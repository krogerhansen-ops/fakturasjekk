import assert from 'node:assert/strict';
import { createApi } from '../server/api.mjs';

const services = {
  async createNewCase(input) { return { id: 'case-1', owner_id: input.owner_id, state: 'draft', retention_mode: input.retention_mode, documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] }; },
  async registerUploads() { return { accepted: true, validation: { valid: true }, upload_targets: [], case: { id: 'case-1', state: 'draft', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; },
  async analyzeStoredCase() { return { status: 'analysis_ready', preview: { price_nok: 29 }, case: { id: 'case-1', state: 'analysis_ready', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; },
  async getPaymentRequirement() { return { amount_minor: 2900, currency: 'NOK' }; },
  async confirmPayment() { return { paid: true, case: { id: 'case-1', state: 'paid', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; },
  async getFullResult() { throw new Error('Full result is locked until verified 29 NOK payment.'); },
  async saveGeneratedDraft() { return { draft: { id: 'd1' }, case: { id: 'case-1', state: 'draft_ready', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; },
  async registerSupplierResponse() { return { review: {}, follow_up: { allowed: false }, case: { id: 'case-1', state: 'supplier_response_received', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; },
  async retentionStatus() { return { retention: {}, purge: {} }; }
};

const api = createApi({ services });
const unauth = await api.invoke('create_case', { request_id: 'r1', body: { buyer_type: 'consumer', subject: 'goods' } });
assert.equal(unauth.status, 401);
assert.equal(unauth.body.error.code, 'authentication_required');
assert.equal(unauth.body.request_id, 'r1');

const created = await api.invoke('create_case', {
  auth: { user: { id: 'u1' } },
  body: { buyer_type: 'consumer', subject: 'goods', retention_mode: 'temporary' }
});
assert.equal(created.status, 201);
assert.equal(created.body.id, 'case-1');
assert.equal('owner_id' in created.body, false);

const business = await api.invoke('create_case', {
  auth: { user: { id: 'u1' } },
  body: { buyer_type: 'company', subject: 'goods' }
});
assert.equal(business.status, 400);
assert.equal(business.body.error.code, 'invalid_buyer_type');

const locked = await api.invoke('full_result', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-1' }
});
assert.equal(locked.status, 402);
assert.equal(locked.body.error.code, 'payment_required');
assert.match(locked.body.error.message, /29 kr/);

const unknown = await api.invoke('does_not_exist', { auth: { user: { id: 'u1' } } });
assert.equal(unknown.status, 404);
assert.equal(unknown.body.error.code, 'route_not_found');

console.log('OK api contract');
