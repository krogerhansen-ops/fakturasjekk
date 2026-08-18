import assert from 'node:assert/strict';
import { createApi } from '../server/api.mjs';
import { createDevelopmentAuthAdapter } from '../server/auth-adapter.mjs';
import { createNodeHandler, startNodeServer } from '../server/node-runtime.mjs';
import { createMemoryRateLimiter } from '../server/security-policy.mjs';

const emptyCase = (state = 'draft') => ({ id: 'case-1', owner_id: 'u1', state, retention_mode: 'temporary', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] });
const services = {
  async createNewCase() { return emptyCase('draft'); },
  async registerUploads() { return { accepted: true, validation: { valid: true }, upload_targets: [], case: emptyCase('draft') }; },
  async analyzeStoredCase() { return { status: 'analysis_ready', preview: { price_nok: 29 }, case: emptyCase('analysis_ready') }; },
  async getPaymentRequirement() { return { amount_minor: 2900, currency: 'NOK' }; },
  async confirmPayment() { return { paid: true, case: emptyCase('paid') }; },
  async getFullResult() { return { status: 'clean', engine: '0.44.0', analysis: { calculations: {}, findings: [], rule_ids: [], questions: [] }, evidence: [], evidence_summary: {}, draft: { allowed: false } }; },
  async saveGeneratedDraft() { return { draft: { id: 'd1' }, case: emptyCase('draft_ready') }; },
  async registerSupplierResponse() { return { review: {}, follow_up: { allowed: false }, case: emptyCase('supplier_response_received') }; },
  async retentionStatus() { return { retention: {} }; }
};
const management = {
  async listCases({ owner_id }) { return [{ id: 'case-1', owner_id }]; },
  async deleteCase({ case_id }) { return { case_id, state: 'deleted' }; }
};
const api = createApi({ services, management });
const authAdapter = createDevelopmentAuthAdapter({ users: { token12345: { id: 'u1', email: 'u1@example.no' } } });
const handler = createNodeHandler({ api, authAdapter, allowedOrigins: ['https://fakturasjekk.no'], rateLimiter: createMemoryRateLimiter(), production: false });
const server = await startNodeServer({ handler, port: 0 });
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const noAuth = await fetch(`${base}/v1/cases`, { headers: { origin: 'https://fakturasjekk.no' } });
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.headers.get('cache-control')?.includes('no-store'), true);

  const preflight = await fetch(`${base}/v1/cases`, { method: 'OPTIONS', headers: { origin: 'https://fakturasjekk.no' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://fakturasjekk.no');

  const created = await fetch(`${base}/v1/cases`, {
    method: 'POST',
    headers: { authorization: 'Bearer token12345', 'content-type': 'application/json', origin: 'https://fakturasjekk.no' },
    body: JSON.stringify({ buyer_type: 'consumer', subject: 'goods', retention_mode: 'temporary' })
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.id, 'case-1');
  assert.equal('owner_id' in createdBody, false);

  const badOrigin = await fetch(`${base}/v1/cases`, { headers: { authorization: 'Bearer token12345', origin: 'https://evil.example' } });
  assert.equal(badOrigin.status, 403);
  const badOriginBody = await badOrigin.json();
  assert.equal(badOriginBody.error.code, 'origin_not_allowed');
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('OK node runtime');
