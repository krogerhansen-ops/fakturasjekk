import assert from 'node:assert/strict';
import { createCoreProductionAdapters } from '../server/production-adapters.mjs';

const config = {
  environment: 'production',
  private_storage_bucket: 'private-bucket',
  auth_issuer: 'https://auth.fakturasjekk.no',
  auth_audience: 'fakturasjekk-api'
};
const db = { async query() { return { rows: [] }; } };
const storageProvider = {
  async createSignedPut() { return { url: 'https://storage.example/upload' }; },
  async headObject() { return { exists: true, byte_size: 1, content_type: 'application/pdf' }; },
  async deletePrefix() { return { deleted_count: 0 }; },
  async putObject() { return {}; },
  async listPrefix() { return { items: [] }; },
  async getObject() { return null; }
};
const storageScanner = { async scanObject() { return { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/pdf' }; } };
const jwtVerifier = { async verify() { return { signature_valid: true, claims: {} }; } };
const extractor = { async extract() { return { fields: {} }; } };
const responseInterpreter = { async interpret() { return { items: [] }; } };
const paymentGateway = { provider_name: 'provider-x', async createSession() { return {}; }, async verifyEvent() { return {}; } };

const adapters = createCoreProductionAdapters({ config, db, storageProvider, storageScanner, jwtVerifier, extractor, responseInterpreter, paymentGateway });
for (const key of ['caseStore','storage','extractor','responseInterpreter','authAdapter','paymentGateway','paymentEventStore','idempotencyStore','auditAdapter','rateLimiter']) {
  assert.ok(adapters[key], `missing ${key}`);
}
assert.equal(typeof adapters.rateLimiter.check, 'function');
assert.equal(typeof adapters.authAdapter.verifyBearer, 'function');
assert.equal(typeof adapters.storage.reservePrivateObject, 'function');
assert.equal(typeof adapters.storage.recordDeletionTombstone, 'function');
assert.equal(typeof adapters.storage.listDeletionTombstones, 'function');

assert.throws(
  () => createCoreProductionAdapters({ config: { environment: 'development' }, db, storageProvider, storageScanner, jwtVerifier, extractor, responseInterpreter, paymentGateway }),
  /production config/i
);
assert.throws(
  () => createCoreProductionAdapters({ config, db, storageProvider, storageScanner, jwtVerifier, extractor: null, responseInterpreter, paymentGateway }),
  /extractor/i
);
assert.throws(
  () => createCoreProductionAdapters({
    config,
    db,
    storageProvider: { createSignedPut() {}, headObject() {}, deletePrefix() {} },
    storageScanner,
    jwtVerifier,
    extractor,
    responseInterpreter,
    paymentGateway
  }),
  /putObject|listPrefix|getObject/i
);

console.log('OK production adapter composition and restore-safe storage contract');
