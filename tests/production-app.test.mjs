import assert from 'node:assert/strict';
import { createProductionApp } from '../server/production-app.mjs';

const config = { environment: 'production', app_origin: 'https://fakturasjekk.no', payment_provider: 'provider-x' };
const product = { version: '0.56.0', price_nok: 29, full_check_free: false, market: 'NO', audience: 'consumer', includes: ['supplier_response_follow_up'] };
const registry = { engine_version: '0.56.0', rules: [{ id: 'R1', status: 'active', source_url: 'https://lovdata.no/lov/test', last_verified: '2026-08-18' }] };
const uploadPolicy = { max_file_bytes: 1000, allowed_mime_types: ['application/pdf'] };
const extractionPolicy = { critical_fields: [], min_confidence: { critical: 0.95, standard: 0.85 } };
const retentionPolicy = { modes: { temporary: { source_documents_ttl_hours: 24, analysis_ttl_days: 7 } } };

const caseStore = {
  async nextId() { return 'x-1'; },
  async save(x) { return x; },
  async getOwned() { throw new Error('not used'); },
  async getForSystem() { throw new Error('not used'); },
  async listOwned() { return []; },
  async listForRetention() { return []; },
  async deleteOwned() { return {}; }
};
const storage = {
  async reservePrivateObject() { return 'private/key'; },
  async listCaseDocuments() { return []; },
  async deleteCaseObjects() { return 0; }
};
const extractor = { async extract() { return { fields: {} }; } };
const responseInterpreter = { async interpret() { return { items: [] }; } };
const authAdapter = { async verifyBearer() { return { id: 'u1' }; } };
const paymentGateway = {
  provider_name: 'provider-x',
  async createSession() { return { provider: 'provider-x', checkout_url: 'https://pay.example' }; },
  async verifyEvent() { return {}; }
};
const paymentEventStore = { async claim() { return { status: 'new' }; } };
const idempotencyStore = { async get() { return null; }, async put() {} };
const auditAdapter = { async write() {} };
const rateLimiter = { check() { return { allowed: true }; } };

const adapters = { caseStore, storage, extractor, responseInterpreter, authAdapter, paymentGateway, paymentEventStore, idempotencyStore, auditAdapter, rateLimiter };
const app = createProductionApp({ config, product, registry, uploadPolicy, extractionPolicy, retentionPolicy, adapters });
assert.equal(app.readiness.ready, true);
assert.equal(typeof app.handler, 'function');
assert.equal(typeof app.api.invoke, 'function');

assert.throws(
  () => createProductionApp({ config, product, registry, uploadPolicy, extractionPolicy, retentionPolicy, adapters: { ...adapters, rateLimiter: null } }),
  /Missing production adapter: rateLimiter/
);
assert.throws(
  () => createProductionApp({ config: { ...config, environment: 'development' }, product, registry, uploadPolicy, extractionPolicy, retentionPolicy, adapters }),
  /validated production config/
);
assert.throws(
  () => createProductionApp({ config, product: { ...product, price_nok: 0, full_check_free: true }, registry, uploadPolicy, extractionPolicy, retentionPolicy, adapters }),
  /Production readiness failed: product.price/
);

console.log('OK production app composition');
