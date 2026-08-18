import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createBackendServices } from '../server/services.mjs';
import { transitionCase } from '../engine/case-state.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const product = JSON.parse(fs.readFileSync(new URL('../config/product.json', import.meta.url), 'utf8'));
const uploadPolicy = JSON.parse(fs.readFileSync(new URL('../config/upload-policy.json', import.meta.url), 'utf8'));
const extractionPolicy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));
const retentionPolicy = JSON.parse(fs.readFileSync(new URL('../config/retention-policy.json', import.meta.url), 'utf8'));

const db = new Map();
let seq = 0;
let time = 0;
const clock = () => `2026-08-18T14:${String(time++).padStart(2, '0')}:00.000Z`;

const caseStore = {
  async nextId(prefix) { return `${prefix}-${++seq}`; },
  async save(value) { db.set(value.id, structuredClone(value)); return value; },
  async getOwned(id, ownerId) {
    const value = db.get(id);
    if (!value) throw new Error('Case not found');
    if (value.owner_id !== ownerId) throw new Error('Forbidden');
    return structuredClone(value);
  }
};

const storage = {
  async reservePrivateObject({ case_id, document_id }) { return `private/${case_id}/${document_id}`; },
  async listCaseDocuments({ records }) { return records.map(r => ({ ...r, uploaded: true })); }
};

const extractor = {
  async extract({ documents }) {
    const invoice = documents.find(d => d.role === 'invoice');
    const quote = documents.find(d => d.role === 'quote');
    return {
      fields: {
        invoice_total: { value: 146000, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
        invoice_number: { value: '12345', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
        invoice_fee: { value: 500, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
        agreed_price: { value: 120000, confidence: 0.99, source_document_id: quote.id, source_page: 1 },
        price_basis: { value: 'estimate', confidence: 0.99, source_document_id: quote.id, source_page: 1 },
        surcharge_documented: { value: false, confidence: 0.90, source_document_id: quote.id, source_page: 1 }
      }
    };
  }
};

const services = createBackendServices({
  registry, product, uploadPolicy, extractionPolicy, retentionPolicy,
  adapters: { caseStore, storage, extractor },
  clock
});

const owner = 'user-1';
const c = await services.createNewCase({ owner_id: owner, buyer_type: 'consumer', subject: 'handcraft_service' });
assert.equal(c.state, 'draft');
assert.equal(c.retention_mode, 'temporary');

const uploads = await services.registerUploads({
  case_id: c.id,
  owner_id: owner,
  files: [
    { name: 'faktura.pdf', mime_type: 'application/pdf', size: 120000, role: 'invoice' },
    { name: 'tilbud.pdf', mime_type: 'application/pdf', size: 90000, role: 'quote' }
  ]
});
assert.equal(uploads.accepted, true);
assert.equal(uploads.case.documents.length, 2);
assert.ok(uploads.case.documents.every(d => d.storage_key.startsWith('private/')));

const analyzed = await services.analyzeStoredCase({ case_id: c.id, owner_id: owner, user_note: 'Jeg fikk ikke beskjed om ekstraarbeid.' });
assert.equal(analyzed.status, 'analysis_ready');
assert.equal(analyzed.case.state, 'analysis_ready');
assert.equal(analyzed.preview.price_nok, 29);
assert.ok(analyzed.preview.finding_count >= 2);

const requirement = await services.getPaymentRequirement({ case_id: c.id, owner_id: owner });
assert.equal(requirement.amount_nok, 29);
assert.equal(requirement.amount_minor, 2900);

await assert.rejects(() => services.getFullResult({ case_id: c.id, owner_id: owner }), /locked/i);

const payment = await services.confirmPayment({
  case_id: c.id,
  owner_id: owner,
  confirmation: {
    case_id: c.id,
    amount_minor: 2900,
    currency: 'NOK',
    status: 'paid',
    provider: 'mock-pay',
    provider_reference: 'pay-001',
    verified_server_side: true,
    paid_at: '2026-08-18T15:00:00.000Z'
  }
});
assert.equal(payment.paid, true);
assert.equal(payment.case.state, 'paid');

const full = await services.getFullResult({ case_id: c.id, owner_id: owner });
assert.equal(full.status, 'attention');
assert.equal(full.draft.allowed, true);
assert.equal(/HTJL_|FKJL_|POF_|BOF_|INK_/.test(full.draft.text), false);

const savedDraft = await services.saveGeneratedDraft({ case_id: c.id, owner_id: owner });
assert.equal(savedDraft.case.state, 'draft_ready');
assert.equal(savedDraft.draft.text.length > 20, true);

let sent = await caseStore.getOwned(c.id, owner);
sent = transitionCase(sent, 'sent_to_supplier', { clock });
await caseStore.save(sent);

const response = await services.registerSupplierResponse({
  case_id: c.id,
  owner_id: owner,
  response_record: { id: 'response-001', invoice_reference: '12345' },
  structured_response: {
    items: [
      { finding_code: 'HANDCRAFT_INVOICE_FEE', coverage: 'answered', answer_text: 'Fakturagebyret er kreditert og ny faktura sendes.', documentation_required: false },
      { finding_code: 'ESTIMATE_ABOVE_15_CONTROL', coverage: 'partial', answer_text: 'Det ble mer arbeid.', documentation_required: true, documentation_provided: false }
    ]
  }
});
assert.equal(response.review.status, 'follow_up_recommended');
assert.equal(response.follow_up.allowed, true);
assert.equal(response.case.state, 'follow_up_ready');

const retention = await services.retentionStatus({ case_id: c.id, owner_id: owner, now: '2026-08-19T20:00:00.000Z' });
assert.ok(retention.retention.source_documents_delete_at);

await assert.rejects(() => services.getFullResult({ case_id: c.id, owner_id: 'wrong-user' }), /Forbidden/);

console.log('OK: provider-neutral backend service completes case creation, private upload reservation, extraction, analysis, 29 NOK payment, draft, supplier response and follow-up.');
