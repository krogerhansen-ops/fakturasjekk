import { createCase, transitionCase, addDocument, markDocumentUploaded, addAnalysis, addPayment, addDraft, addSupplierResponse, addFollowUp } from '../engine/case-state.mjs';
import { validateUploadSet } from '../engine/document-policy.mjs';
import { validateExtraction, toEvidenceOrigins } from '../engine/extraction-policy.mjs';
import { runCase } from '../engine/case-service.mjs';
import { paymentRequirement, validatePaymentConfirmation, shouldUnlockFullResult } from '../engine/payment-gate.mjs';
import { reviewSupplierResponse, buildFollowUpDraft } from '../engine/followup.mjs';
import { computeRetention, purgePlan } from '../engine/retention.mjs';
import { normalizeStorageReservation, publicUploadTarget, assertUploadTargetSafe } from './storage-contract.mjs';

function requireAdapter(adapters, name) {
  const adapter = adapters?.[name];
  if (!adapter) throw new Error(`Missing backend adapter: ${name}`);
  return adapter;
}

export function createBackendServices({ registry, product, uploadPolicy, extractionPolicy, retentionPolicy, adapters = {}, clock } = {}) {
  const store = requireAdapter(adapters, 'caseStore');
  const storage = requireAdapter(adapters, 'storage');
  const extractor = requireAdapter(adapters, 'extractor');

  async function createNewCase({ owner_id, buyer_type, subject, retention_mode = 'temporary' }) {
    const id = await store.nextId('case');
    const caseData = createCase({ id, owner_id, retention_mode, clock });
    const saved = { ...caseData, intake_request: { buyer_type, subject } };
    await store.save(saved);
    return saved;
  }

  async function registerUploads({ case_id, owner_id, files }) {
    let caseData = await store.getOwned(case_id, owner_id);
    const validation = validateUploadSet(files, uploadPolicy);
    if (!validation.valid) return { accepted: false, validation, upload_targets: [], case: caseData };

    const uploadTargets = [];
    for (const file of files) {
      const documentId = await store.nextId('document');
      const reservation = normalizeStorageReservation(await storage.reservePrivateObject({
        case_id,
        owner_id,
        document_id: documentId,
        name: file.name,
        mime_type: file.mime_type,
        byte_size: file.size
      }));
      const target = publicUploadTarget({ document_id: documentId, reservation });
      if (target) {
        assertUploadTargetSafe(target);
        uploadTargets.push(target);
      }
      caseData = addDocument(caseData, {
        id: documentId,
        role: file.role,
        name: file.name,
        mime_type: file.mime_type,
        storage_key: reservation.storage_key,
        status: target ? 'awaiting_upload' : 'uploaded'
      }, { clock });
    }
    await store.save(caseData);
    return { accepted: true, validation, upload_targets: uploadTargets, case: caseData };
  }

  async function confirmDocumentUpload({ case_id, owner_id, document_id }) {
    let caseData = await store.getOwned(case_id, owner_id);
    const document = caseData.documents.find(d => d.id === document_id);
    if (!document) throw new Error('Document not found.');
    if (document.status === 'uploaded') return { uploaded: true, document, case: caseData };
    if (document.status !== 'awaiting_upload') throw new Error('Document is not awaiting upload.');
    if (!storage.finalizeUpload) throw new Error('Storage adapter does not support upload finalization.');

    const verified = await storage.finalizeUpload({
      case_id,
      owner_id,
      document_id,
      storage_key: document.storage_key,
      expected_mime_type: document.mime_type,
      max_file_bytes: uploadPolicy.max_file_bytes,
      allowed_mime_types: uploadPolicy.allowed_mime_types
    });
    if (!verified?.uploaded || !verified?.magic_bytes_verified || verified?.malware_safe !== true) {
      throw new Error('Uploaded document failed server-side verification.');
    }
    if (Number(verified.byte_size) > Number(uploadPolicy.max_file_bytes)) throw new Error('Uploaded document is too large.');
    if (!uploadPolicy.allowed_mime_types.includes(verified.mime_type)) throw new Error('Uploaded document type is not allowed.');

    caseData = markDocumentUploaded(caseData, document_id, {
      byte_size: verified.byte_size,
      mime_type: verified.mime_type,
      sha256: verified.sha256 ?? null
    }, { clock });
    await store.save(caseData);
    return { uploaded: true, document: caseData.documents.find(d => d.id === document_id), case: caseData };
  }

  async function analyzeStoredCase({ case_id, owner_id, user_note = '', collection = null }) {
    let caseData = await store.getOwned(case_id, owner_id);
    if (caseData.documents.some(d => d.status === 'awaiting_upload')) throw new Error('All reserved documents must be uploaded and verified before analysis.');
    const documents = await storage.listCaseDocuments({ case_id, owner_id, records: caseData.documents });
    if (!documents.some(d => d.role === 'invoice')) throw new Error('Invoice document is required before analysis.');

    const extractionRaw = await extractor.extract({ case_id, owner_id, documents });
    const extraction = validateExtraction(extractionRaw, extractionPolicy);
    if (!extraction.safe_to_continue) {
      return { status: 'needs_confirmation', extraction, case: caseData };
    }

    const facts = Object.fromEntries(Object.entries(extraction.accepted).map(([field, item]) => [field, item.value]));
    const origins = toEvidenceOrigins(extraction);
    const intake = {
      buyer_type: caseData.intake_request?.buyer_type,
      subject: caseData.intake_request?.subject,
      documents: documents.map(d => d.role)
    };

    const result = runCase({ intake, facts, origins, collection, registry, user_note, draft_mode: 'request' });
    const analysisId = await store.nextId('analysis');
    caseData = addAnalysis(caseData, {
      id: analysisId,
      engine_version: registry.engine_version,
      status: result.status,
      result
    }, { clock });

    if (caseData.state === 'draft') caseData = transitionCase(caseData, 'documents_ready', { clock });
    if (caseData.state === 'documents_ready') caseData = transitionCase(caseData, 'analysis_ready', { clock });
    await store.save(caseData);

    return {
      status: 'analysis_ready',
      preview: {
        status: result.status,
        finding_count: result.analysis?.findings?.length ?? 0,
        requires_clarification: (result.analysis?.questions?.length ?? 0) > 0,
        price_nok: product.price_nok
      },
      extraction,
      case: caseData
    };
  }

  async function getPaymentRequirement({ case_id, owner_id }) {
    const caseData = await store.getOwned(case_id, owner_id);
    if (!caseData.analyses.length) throw new Error('Analysis must exist before payment requirement is created.');
    return paymentRequirement({ case_id, product });
  }

  async function confirmPayment({ case_id, owner_id, confirmation }) {
    let caseData = await store.getOwned(case_id, owner_id);
    const requirement = paymentRequirement({ case_id, product });
    const validation = validatePaymentConfirmation(confirmation, requirement);
    if (!validation.valid) return { paid: false, validation, case: caseData };

    if (!caseData.payments.some(p => p.provider_reference === validation.payment_record.provider_reference)) {
      caseData = addPayment(caseData, validation.payment_record, { clock });
    }
    if (caseData.state === 'analysis_ready') caseData = transitionCase(caseData, 'paid', { clock });
    await store.save(caseData);
    return { paid: true, validation, case: caseData };
  }

  async function getFullResult({ case_id, owner_id }) {
    const caseData = await store.getOwned(case_id, owner_id);
    const latest = caseData.analyses.at(-1);
    if (!latest) throw new Error('No analysis available.');
    const paid = caseData.payments.at(-1);
    const requirement = paymentRequirement({ case_id, product });
    const paymentValidation = paid ? validatePaymentConfirmation({
      case_id,
      amount_minor: paid.amount_minor,
      currency: paid.currency,
      status: paid.status,
      provider: paid.provider,
      provider_reference: paid.provider_reference,
      verified_server_side: paid.verified_server_side,
      paid_at: paid.paid_at
    }, requirement) : null;
    if (!shouldUnlockFullResult({ payment_validation: paymentValidation, product })) throw new Error('Full result is locked until verified 29 NOK payment.');
    return latest.result;
  }

  async function saveGeneratedDraft({ case_id, owner_id, mode = 'request' }) {
    let caseData = await store.getOwned(case_id, owner_id);
    const result = await getFullResult({ case_id, owner_id });
    const draftOutput = result.draft?.allowed ? result.draft : null;
    if (!draftOutput) throw new Error('No controlled draft is available for this analysis.');
    const id = await store.nextId('draft');
    caseData = addDraft(caseData, { id, mode, text: draftOutput.text, analysis_id: caseData.analyses.at(-1)?.id }, { clock });
    if (caseData.state === 'paid') caseData = transitionCase(caseData, 'draft_ready', { clock });
    await store.save(caseData);
    return { draft: caseData.drafts.at(-1), case: caseData };
  }

  async function registerSupplierResponse({ case_id, owner_id, response_record, structured_response }) {
    let caseData = await store.getOwned(case_id, owner_id);
    const id = response_record?.id ?? await store.nextId('response');
    caseData = addSupplierResponse(caseData, { ...response_record, id }, { clock });
    if (caseData.state === 'sent_to_supplier') caseData = transitionCase(caseData, 'supplier_response_received', { clock });

    const original = caseData.analyses.at(-1)?.result?.analysis;
    const review = reviewSupplierResponse({ original_analysis: original, response: structured_response, registry });
    const followUp = buildFollowUpDraft({ review, invoice_reference: response_record?.invoice_reference ?? '' });
    if (followUp.allowed) {
      const followUpId = await store.nextId('followup');
      caseData = addFollowUp(caseData, { id: followUpId, text: followUp.text, response_id: id }, { clock });
      if (caseData.state === 'supplier_response_received') caseData = transitionCase(caseData, 'follow_up_ready', { clock });
    }
    await store.save(caseData);
    return { review, follow_up: followUp, case: caseData };
  }

  async function retentionStatus({ case_id, owner_id, now }) {
    const caseData = await store.getOwned(case_id, owner_id);
    return { retention: computeRetention(caseData, retentionPolicy, { now }), purge: purgePlan(caseData, retentionPolicy, { now }) };
  }

  return {
    createNewCase,
    registerUploads,
    confirmDocumentUpload,
    analyzeStoredCase,
    getPaymentRequirement,
    confirmPayment,
    getFullResult,
    saveGeneratedDraft,
    registerSupplierResponse,
    retentionStatus
  };
}
