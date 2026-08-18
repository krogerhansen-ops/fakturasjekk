import assert from 'node:assert/strict';
import { createApi } from '../server/api.mjs';
import { createDevelopmentAuthAdapter } from '../server/auth-adapter.mjs';
import { createNodeHandler, startNodeServer } from '../server/node-runtime.mjs';
import { createMemoryRateLimiter } from '../server/security-policy.mjs';

const services = {
  async createNewCase({ owner_id, buyer_type, subject, retention_mode }) { return { id: 'case-1', owner_id, buyer_type, subject, retention_mode }; },
  async registerUploads() { return { accepted: true }; },
  async analyzeStoredCase() { return { status: 'analysis_ready' }; },
  async getPaymentRequirement() { return { amount_minor: 2900, currency: 'NOK' }; },
  async confirmPayment() { return { paid: true }; },
  async getFullResult() { return { status: 'ok' }; },
  async saveGeneratedDraft() { return { draft: { id: 'd1' } }; },
  async registerSupplierResponse() { return { review: {} }; },
  async retentionStatus() { return { retention: {} }; }
};
const management = {
  async listCases({ owner_id }) { return [{ id: 'case-1', owner_id }]; },
  async deleteCase({ case_id }) { return { case_id, state: 'deleted' }; }
};
const api = createApi({ services, management });
const authAdapter = createDevelopmentAuthAdapter({ users: { token12345: { id: 'u1', email: 'u1@example.no' } } });
const handler = createNodeHandler({
  api,
  authAdapter,
  allowedOrigins: ['https://fakturasjekk.no'],
  rateLimiter: createMemoryRateLimiter(),
  production: false
});
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
  assert.equal(createdBody.owner_id, 'u1');

  const badOrigin = await fetch(`${base}/v1/cases`, { headers: { authorization: 'Bearer token12345', origin: 'https://evil.example' } });
  assert.equal(badOrigin.status, 403);
  const badOriginBody = await badOrigin.json();
  assert.equal(badOriginBody.error.code, 'origin_not_allowed');
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('OK node runtime');
