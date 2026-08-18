const VALID_STATES = new Set([
  'draft',
  'documents_ready',
  'analysis_ready',
  'paid',
  'draft_ready',
  'sent_to_supplier',
  'supplier_response_received',
  'follow_up_ready',
  'resolved',
  'closed'
]);

const TRANSITIONS = {
  draft: ['documents_ready', 'closed'],
  documents_ready: ['analysis_ready', 'closed'],
  analysis_ready: ['paid', 'closed'],
  paid: ['draft_ready', 'resolved', 'closed'],
  draft_ready: ['sent_to_supplier', 'resolved', 'closed'],
  sent_to_supplier: ['supplier_response_received', 'resolved', 'closed'],
  supplier_response_received: ['follow_up_ready', 'resolved', 'closed'],
  follow_up_ready: ['sent_to_supplier', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: []
};

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Clock returned invalid date.');
  return date.toISOString();
}

export function createCase({ id, owner_id, created_at = null, retention_mode = 'temporary', clock } = {}) {
  if (!id) throw new Error('Case id is required');
  if (!owner_id) throw new Error('Owner id is required');
  const created = created_at ?? nowIso(clock);
  return {
    id,
    owner_id,
    state: 'draft',
    retention_mode,
    created_at: created,
    updated_at: created,
    documents: [],
    analyses: [],
    drafts: [],
    supplier_responses: [],
    follow_ups: [],
    payments: [],
    events: [{ type: 'CASE_CREATED', at: created, data: {} }]
  };
}

export function transitionCase(caseData, nextState, { event_type = 'STATE_CHANGED', data = {}, clock } = {}) {
  if (!VALID_STATES.has(nextState)) throw new Error(`Invalid case state: ${nextState}`);
  const allowed = TRANSITIONS[caseData.state] ?? [];
  if (!allowed.includes(nextState)) throw new Error(`Illegal transition ${caseData.state} -> ${nextState}`);
  const at = nowIso(clock);
  return {
    ...caseData,
    state: nextState,
    updated_at: at,
    events: [...caseData.events, { type: event_type, at, data: { from: caseData.state, to: nextState, ...data } }]
  };
}

export function addDocument(caseData, document, { clock } = {}) {
  if (!document?.id || !document?.role) throw new Error('Document id and role are required');
  if (caseData.documents.some(d => d.id === document.id)) throw new Error(`Duplicate document id: ${document.id}`);
  const at = nowIso(clock);
  const record = {
    id: document.id,
    role: document.role,
    name: document.name ?? null,
    mime_type: document.mime_type ?? null,
    storage_key: document.storage_key ?? null,
    byte_size: document.byte_size ?? null,
    sha256: document.sha256 ?? null,
    created_at: at,
    uploaded_at: document.uploaded_at ?? null,
    upload_expires_at: document.upload_expires_at ?? null,
    provider_upload_expires_at: document.provider_upload_expires_at ?? document.upload_expires_at ?? null,
    status: document.status ?? 'accepted'
  };
  return {
    ...caseData,
    updated_at: at,
    documents: [...caseData.documents, record],
    events: [...caseData.events, { type: 'DOCUMENT_ADDED', at, data: { document_id: record.id, role: record.role } }]
  };
}

export function markDocumentUploaded(caseData, documentId, metadata = {}, { clock } = {}) {
  const index = caseData.documents.findIndex(d => d.id === documentId);
  if (index < 0) throw new Error(`Document not found: ${documentId}`);
  const current = caseData.documents[index];
  if (!['awaiting_upload', 'accepted', 'uploaded'].includes(current.status)) throw new Error(`Document cannot be marked uploaded from status: ${current.status}`);
  const at = nowIso(clock);
  const updated = {
    ...current,
    status: 'uploaded',
    uploaded_at: at,
    upload_expires_at: null,
    provider_upload_expires_at: null,
    byte_size: metadata.byte_size ?? current.byte_size ?? null,
    mime_type: metadata.mime_type ?? current.mime_type ?? null,
    sha256: metadata.sha256 ?? current.sha256 ?? null
  };
  const documents = [...caseData.documents];
  documents[index] = updated;
  return {
    ...caseData,
    updated_at: at,
    documents,
    events: [...caseData.events, { type: 'DOCUMENT_UPLOADED', at, data: { document_id: documentId, role: updated.role } }]
  };
}

export function expireDocumentUploadWindow(caseData, documentId, { clock } = {}) {
  const index = caseData.documents.findIndex(d => d.id === documentId);
  if (index < 0) throw new Error(`Document not found: ${documentId}`);
  const current = caseData.documents[index];
  if (current.status === 'uploaded') throw new Error('Uploaded document cannot be expired as a reservation.');
  if (current.status === 'upload_window_expired') return caseData;
  if (current.status !== 'awaiting_upload') throw new Error(`Document upload window cannot expire from status: ${current.status}`);
  const at = nowIso(clock);
  const documents = [...caseData.documents];
  documents[index] = { ...current, status: 'upload_window_expired' };
  return {
    ...caseData,
    updated_at: at,
    documents,
    events: [...caseData.events, { type: 'DOCUMENT_UPLOAD_WINDOW_EXPIRED', at, data: { document_id: documentId, role: current.role } }]
  };
}

export function removeDocumentReservations(caseData, documentIds = [], { clock, preserve_updated_at = false } = {}) {
  const ids = new Set(documentIds);
  if (!ids.size) return caseData;
  const removable = caseData.documents.filter(d => ids.has(d.id));
  if (removable.some(d => d.status === 'uploaded')) throw new Error('Uploaded documents cannot be removed as expired reservations.');
  const at = nowIso(clock);
  return {
    ...caseData,
    updated_at: preserve_updated_at ? caseData.updated_at : at,
    documents: caseData.documents.filter(d => !ids.has(d.id)),
    events: [...caseData.events, {
      type: 'EXPIRED_UPLOAD_RESERVATIONS_PURGED',
      at,
      data: { count: removable.length }
    }]
  };
}

export function addAnalysis(caseData, analysisRecord, { clock } = {}) {
  if (!analysisRecord?.id || !analysisRecord?.engine_version) throw new Error('Analysis id and engine version are required');
  const at = nowIso(clock);
  const record = { ...analysisRecord, created_at: at };
  return {
    ...caseData,
    updated_at: at,
    analyses: [...caseData.analyses, record],
    events: [...caseData.events, { type: 'ANALYSIS_ADDED', at, data: { analysis_id: record.id, engine_version: record.engine_version } }]
  };
}

export function addPayment(caseData, payment, { clock } = {}) {
  if (!payment?.id || Number(payment?.amount_nok) <= 0) throw new Error('Valid payment id and amount are required');
  const at = nowIso(clock);
  const record = { ...payment, created_at: at };
  return {
    ...caseData,
    updated_at: at,
    payments: [...caseData.payments, record],
    events: [...caseData.events, { type: 'PAYMENT_RECORDED', at, data: { payment_id: record.id, amount_nok: record.amount_nok } }]
  };
}

export function addDraft(caseData, draftRecord, { clock } = {}) {
  if (!draftRecord?.id || !draftRecord?.text) throw new Error('Draft id and text are required');
  const at = nowIso(clock);
  const record = { ...draftRecord, created_at: at };
  return {
    ...caseData,
    updated_at: at,
    drafts: [...caseData.drafts, record],
    events: [...caseData.events, { type: 'DRAFT_ADDED', at, data: { draft_id: record.id, mode: record.mode ?? 'request' } }]
  };
}

export function addSupplierResponse(caseData, response, { clock } = {}) {
  if (!response?.id) throw new Error('Supplier response id is required');
  const at = nowIso(clock);
  const record = { ...response, received_at: at };
  return {
    ...caseData,
    updated_at: at,
    supplier_responses: [...caseData.supplier_responses, record],
    events: [...caseData.events, { type: 'SUPPLIER_RESPONSE_ADDED', at, data: { response_id: record.id } }]
  };
}

export function addFollowUp(caseData, followUp, { clock } = {}) {
  if (!followUp?.id || !followUp?.text) throw new Error('Follow-up id and text are required');
  const at = nowIso(clock);
  const record = { ...followUp, created_at: at };
  return {
    ...caseData,
    updated_at: at,
    follow_ups: [...caseData.follow_ups, record],
    events: [...caseData.events, { type: 'FOLLOW_UP_ADDED', at, data: { follow_up_id: record.id } }]
  };
}

export function publicCaseSummary(caseData) {
  return {
    id: caseData.id,
    state: caseData.state,
    created_at: caseData.created_at,
    updated_at: caseData.updated_at,
    document_count: caseData.documents.length,
    analysis_count: caseData.analyses.length,
    supplier_response_count: caseData.supplier_responses.length,
    has_payment: caseData.payments.length > 0,
    latest_analysis_status: caseData.analyses.at(-1)?.status ?? null
  };
}
