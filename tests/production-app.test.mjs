import assert from 'node:assert/strict';
import { createProductionApp } from '../server/production-app.mjs';

const today = new Date().toISOString().slice(0, 10);
const config = { environment: 'production', app_origin: 'https://fakturasjekk.no', payment_provider: 'provider-x' };
const product = { version: '0.56.0', price_nok: 29, full_check_free: false, market: 'NO', audience: 'consumer', includes: ['supplier_response_follow_up'] };
const registry = { engine_version: '0.56.0', rules: [{ id: 'R1', status: 'active', source_url: 'https://lovdata.no/lov/test', last_verified: today }] };
const uploadPolicy = { max_file_bytes: 1000, allowed_mime_types: ['application/pdf'] };
const extractionPolicy = { critical_fields: [], min_confidence: { critical: 0.95, standard: 0.85 }, require_source_location: true };
const extractionCatalog = { fields: { invoice_total: { type: 'number' }, invoice_number: { type: 'string' } } };
const retentionPolicy = { modes: { temporary: { source_documents_ttl_hours: 24, analysis_ttl_days: 7 } } };
const launchGate = { checks: [{ id: 'test-gate', required: true, status: 'complete', evidence: 'synthetic production composition test' }] };

const caseStore = {
  async nextId() { return 'x-1'; },
  async save(x) { return x; },
  async getOwned() { throw new Error('not used'); },
  async getForSystem() { throw new Error('not used'); },
  async listOwned() { return []; },
  async listForRetention() { return []; },
  async listPendingOrderConfirmationDeliveries() { return []; },
  async deleteOwned() { return {}; }
};
const storage = {
  async reservePrivateObject() { return 'private/key'; },
  async listCaseDocuments() { return []; },
  async deleteCaseObjects() { return 0; },
  async recordDeletionTombstone() { return { key: 'deletion-ledger/test.json' }; }
};
const extractor = { async extract() { return { fields: {} }; } };
const responseInterpreter = { async interpret() { return { items: [] }; } };
const authAdapter = {
  async verifyBearer() { return { id: 'u1' }; },
  async getVerifiedDeliveryContact(token, userId) {
    assert.equal(token, 'test-token');
    assert.equal(userId, 'u1');
    return { user_id: 'u1', email: 'customer@example.test', verified_at: '2026-08-22T12:00:00.000Z' };
  }
};
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
const input = { config, product, registry, uploadPolicy, extractionPolicy, extractionCatalog, retentionPolicy, launchGate, adapters };
const app = createProductionApp(input);
assert.equal(app.readiness.ready, true);
assert.equal(app.launch_gate.launch_allowed, true);
assert.equal(typeof app.handler, 'function');
assert.equal(typeof app.fetchHandler, 'function');
assert.equal(typeof app.api.invoke, 'function');
assert.equal(app.orderConfirmationDeliveryService, null, 'delivery service is not fabricated without an explicit provider adapter');
assert.equal(app.orderConfirmationDeliveryRetryService, null, 'retry runner is not fabricated without a durable delivery provider');

const commerceApp = createProductionApp({
  ...input,
  checkoutPolicy: {},
  adapters: {
    ...adapters,
    orderConfirmationDeliveryAdapter: {
      async deliverOrderConfirmation() { return { delivered: true, medium: 'email', delivery_reference: 'test-message' }; }
    }
  }
});
assert.equal(typeof commerceApp.orderConfirmationService?.prepare, 'function');
assert.equal(typeof commerceApp.orderConfirmationDeliveryService?.deliverPrepared, 'function', 'production composition must wire an explicit durable delivery adapter');
assert.equal(typeof commerceApp.orderConfirmationDeliveryRetryService?.run, 'function', 'production composition must expose bounded retry when pending-query support exists');

assert.throws(
  () => createProductionApp({
    ...input,
    checkoutPolicy: {},
    adapters: {
      ...adapters,
      authAdapter: { async verifyBearer() { return { id: 'u1' }; } },
      orderConfirmationDeliveryAdapter: {
        async deliverOrderConfirmation() { return { delivered: true, medium: 'email', delivery_reference: 'test-message' }; }
      }
    }
  }),
  /Missing production adapter: deliveryContactResolver/,
  'durable receipt delivery must fail closed without a server-verified recipient resolver'
);

const edgeHealth = await app.fetchHandler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/health'));
assert.equal(edgeHealth.status, 200);
assert.equal(edgeHealth.headers.get('x-frame-options'), 'DENY');

assert.throws(
  () => createProductionApp({ ...input, launchGate: null }),
  /launch gate blocked/i
);
assert.throws(
  () => createProductionApp({ ...input, launchGate: { checks: [{ id: 'blocked', required: true, status: 'todo' }] } }),
  /launch gate blocked/i
);
assert.throws(
  () => createProductionApp({ ...input, adapters: { ...adapters, rateLimiter: null } }),
  /Missing production adapter: rateLimiter/
);
assert.throws(
  () => createProductionApp({ ...input, config: { ...config, environment: 'development' } }),
  /validated production config/
);
assert.throws(
  () => createProductionApp({ ...input, product: { ...product, price_nok: 0, full_check_free: true } }),
  /Production readiness failed: product.price/
);

console.log('OK production app composition exposes Node/Fetch runtimes, verified delivery contact, durable delivery and bounded receipt retry wiring');
