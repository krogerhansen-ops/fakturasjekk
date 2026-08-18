export const API_VERSION = 'v1';

export const ROUTES = Object.freeze([
  ['GET', '/v1/cases', 'list_cases', false],
  ['POST', '/v1/cases', 'create_case', true],
  ['DELETE', '/v1/cases/:case_id', 'delete_case', true],
  ['POST', '/v1/cases/:case_id/uploads', 'register_uploads', true],
  ['POST', '/v1/cases/:case_id/analyze', 'analyze_case', true],
  ['GET', '/v1/cases/:case_id/payment', 'payment_requirement', false],
  ['POST', '/v1/cases/:case_id/payment/confirm', 'confirm_payment', true],
  ['GET', '/v1/cases/:case_id/result', 'full_result', false],
  ['POST', '/v1/cases/:case_id/draft', 'create_draft', true],
  ['POST', '/v1/cases/:case_id/supplier-response', 'supplier_response', true],
  ['GET', '/v1/cases/:case_id/retention', 'retention_status', false]
].map(([method, path, action, mutation]) => ({ method, path, action, auth: true, mutation })));
