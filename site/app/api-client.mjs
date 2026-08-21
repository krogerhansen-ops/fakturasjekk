import { privacySafeFileDescriptor } from './upload-metadata.mjs';

export class FakturasjekkApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', request_id = null, details = null } = {}) {
    super(message);
    this.name = 'FakturasjekkApiError';
    this.status = status;
    this.code = code;
    this.request_id = request_id;
    this.details = details;
  }
}

function defaultKey() {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createApiClient({ baseUrl, getToken, fetchImpl = globalThis.fetch, idempotencyKey = defaultKey } = {}) {
  if (!baseUrl) throw new Error('API baseUrl is required.');
  if (typeof getToken !== 'function') throw new Error('getToken function is required.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required.');
  const base = baseUrl.replace(/\/$/, '');

  async function request(path, { method = 'GET', body = undefined, mutation = false } = {}) {
    const token = await getToken();
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (mutation) headers['idempotency-key'] = idempotencyKey();
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit' });
    } catch (error) {
      throw new FakturasjekkApiError('Kunne ikke kontakte Fakturasjekk.', { details: { cause: String(error?.message ?? '') } });
    }
    const requestId = response.headers?.get?.('x-request-id') ?? null;
    let payload = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { throw new FakturasjekkApiError('Ugyldig svar fra Fakturasjekk.', { status: response.status, code: 'invalid_server_response', request_id: requestId }); }
    }
    if (!response.ok) {
      throw new FakturasjekkApiError(payload?.error?.message ?? 'Forespørselen feilet.', {
        status: response.status,
        code: payload?.error?.code ?? 'request_failed',
        request_id: payload?.request_id ?? requestId,
        details: payload?.error?.details ?? null
      });
    }
    return payload;
  }

  async function uploadSigned(target, file) {
    if (!target?.upload_url || !target?.document_id) throw new Error('Invalid signed upload target.');
    if (!file) throw new Error('File is required.');
    const headers = { ...(target.required_headers ?? {}) };
    const response = await fetchImpl(target.upload_url, { method: 'PUT', headers, body: file, credentials: 'omit' });
    if (!response.ok) throw new FakturasjekkApiError('Dokumentet kunne ikke lastes opp.', { status: response.status, code: 'signed_upload_failed' });
    return { document_id: target.document_id, uploaded: true };
  }

  return {
    listCases: () => request('/v1/cases'),
    createCase: input => request('/v1/cases', { method: 'POST', mutation: true, body: input }),
    deleteCase: caseId => request(`/v1/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE', mutation: true }),
    registerUploads: (caseId, files) => request(`/v1/cases/${encodeURIComponent(caseId)}/uploads`, { method: 'POST', mutation: true, body: { files } }),
    uploadSigned,
    confirmDocument: (caseId, documentId) => request(`/v1/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/confirm`, { method: 'POST', mutation: true }),
    analyze: (caseId, input = {}) => request(`/v1/cases/${encodeURIComponent(caseId)}/analyze`, { method: 'POST', mutation: true, body: input }),
    confirmFacts: (caseId, items) => request(`/v1/cases/${encodeURIComponent(caseId)}/facts/confirm`, { method: 'POST', mutation: true, body: { items } }),
    getPaymentRequirement: caseId => request(`/v1/cases/${encodeURIComponent(caseId)}/payment`),
    createPaymentSession: (caseId, return_url) => request(`/v1/cases/${encodeURIComponent(caseId)}/payment/session`, { method: 'POST', mutation: true, body: return_url ? { return_url } : {} }),
    getResult: caseId => request(`/v1/cases/${encodeURIComponent(caseId)}/result`),
    createDraft: (caseId, mode = 'request') => request(`/v1/cases/${encodeURIComponent(caseId)}/draft`, { method: 'POST', mutation: true, body: { mode } }),
    submitSupplierResponse: (caseId, response_text, invoice_reference = '') => request(`/v1/cases/${encodeURIComponent(caseId)}/supplier-response`, { method: 'POST', mutation: true, body: { response_text, invoice_reference } }),
    getRetention: caseId => request(`/v1/cases/${encodeURIComponent(caseId)}/retention`),
    health: () => request('/health'),
    readiness: () => request('/ready')
  };
}

export function fileDescriptor(file, role, index = 0) {
  return privacySafeFileDescriptor(file, role, index);
}
