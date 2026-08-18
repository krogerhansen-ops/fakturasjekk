export const API_VERSION = 'v1';

export const ROUTES = Object.freeze([
  { method: 'GET', path: '/v1/cases', action: 'list_cases', auth: true, mutation: false },
  { method: 'POST', path: '/v1/cases', action: 'create_case', auth: true, mutation: true },
  { method: 'DELETE', path: '/v1/cases/:case_id', action: 'delete_case', auth: true, mutation: true },
  { method: 'POST', path: '/v1/cases/:case_id/uploads', action: 'register_uploads', auth: true, mutation: true },
  { method: 'POST', path: '/v1/cases/:case_id/documents/:document_id/confirm', action: 'confirm_document_upload', auth: true, mutation: true },
  { method: 'POST', path: '/v1/cases/:case_id/analyze', action: 'analyze_case', auth: true, mutation: true },
  { method: 'GET', path: '/v1/cases/:case_id/payment', action: 'payment_requirement', auth: true, mutation: false },
  { method: 'POST', path: '/v1/cases/:case_id/payment/session', action: 'create_payment_session', auth: true, mutation: true },
  { method: 'POST', path: '/v1/webhooks/payment/:provider', action: 'payment_webhook', auth: false, mutation: true, raw_body: true, cors: false },
  { method: 'GET', path: '/v1/cases/:case_id/result', action: 'full_result', auth: true, mutation: false },
  { method: 'POST', path: '/v1/cases/:case_id/draft', action: 'create_draft', auth: true, mutation: true },
  { method: 'POST', path: '/v1/cases/:case_id/supplier-response', action: 'supplier_response', auth: true, mutation: true },
  { method: 'GET', path: '/v1/cases/:case_id/retention', action: 'retention_status', auth: true, mutation: false }
]);
