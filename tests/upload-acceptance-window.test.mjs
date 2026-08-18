import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createBackendServices } from '../server/services.mjs';

let now = new Date('2026-08-18T15:00:00.000Z');
const caseStore = createMemoryCaseStore();
let finalizeCalls = 0;
let listedRecords = null;
let counter = 0;
const storage = {
  async reservePrivateObject({ case_id, owner_id, document_id, mime_type }) {
    counter += 1;
    return {
      storage_key: `cases/${owner_id}/${case_id}/${document_id}-${counter}`,
      upload_url: `https://storage.example/signed/${document_id}`,
      expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      provider_expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      required_headers: { 'content-type': mime_type }
    };
  },
  async finalizeUpload() {
    finalizeCalls += 1;
    return {
      uploaded: true,
      byte_size: 100,
      mime_type: 'application/pdf',
      sha256: 'abc',
      magic_bytes_verified: true,
      malware_safe: true
    };
  },
  async listCaseDocuments({ records }) {
    listedRecords = structuredClone(records);
    return records.map(record => ({ ...structuredClone(record), object_key: record.storage_key, object_bucket: 'private' }));
  }
};
const extractor = {
  async extract() { throw new Error('STOP_AFTER_STORAGE_LIST'); }
};

const services = createBackendServices({
  registry: { engine_version: 'test', rules: [] },
  product: { price_nok: 29 },
  uploadPolicy: {
    max_files: 8,
    max_file_bytes: 15728640,
    max_total_bytes: 52428800,
    allowed_mime_types: ['application/pdf'],
    document_roles: ['invoice', 'quote'],
    required_roles: ['invoice']
  },
  extractionPolicy: { critical_fields: [], min_confidence: { critical: 0.95, standard: 0.85 }, require_source_location: true },
  extractionCatalog: { fields: {} },
  retentionPolicy: { modes: {} },
  adapters: { caseStore, storage, extractor },
  clock: () => now
});

const created = await services.createNewCase({ owner_id: 'u1', buyer_type: 'consumer', subject: 'test' });
const registration = await services.registerUploads({
  case_id: created.id,
  owner_id: 'u1',
  files: [
    { name: 'invoice.pdf', mime_type: 'application/pdf', size: 100, role: 'invoice' },
    { name: 'quote.pdf', mime_type: 'application/pdf', size: 100, role: 'quote' }
  ]
});
assert.equal(registration.accepted, true);
assert.equal(registration.upload_targets.length, 2);
for (const target of registration.upload_targets) {
  assert.equal(target.expires_at, '2026-08-18T15:10:00.000Z');
  assert.equal('provider_expires_at' in target, false, 'provider token expiry stays internal');
  assert.equal(JSON.stringify(target).includes('cases/u1/'), false, 'storage key stays internal');
}
const invoice = registration.case.documents.find(document => document.role === 'invoice');
const quote = registration.case.documents.find(document => document.role === 'quote');
assert.equal(invoice.provider_upload_expires_at, '2026-08-18T17:00:00.000Z');
assert.equal(quote.provider_upload_expires_at, '2026-08-18T17:00:00.000Z');

now = new Date('2026-08-18T15:05:00.000Z');
const invoiceConfirmation = await services.confirmDocumentUpload({ case_id: created.id, owner_id: 'u1', document_id: invoice.id });
assert.equal(invoiceConfirmation.uploaded, true);
assert.equal(invoiceConfirmation.document.status, 'uploaded');
assert.equal(invoiceConfirmation.document.upload_expires_at, null);
assert.equal(invoiceConfirmation.document.provider_upload_expires_at, null);
assert.equal(finalizeCalls, 1);

now = new Date('2026-08-18T15:11:00.000Z');
await assert.rejects(
  () => services.confirmDocumentUpload({ case_id: created.id, owner_id: 'u1', document_id: quote.id }),
  /expired/i
);
assert.equal(finalizeCalls, 1, 'expired application window must fail before storage finalization/scanning');
const afterExpiry = await caseStore.getOwned(created.id, 'u1');
assert.equal(afterExpiry.documents.find(document => document.id === quote.id).status, 'upload_window_expired');

await assert.rejects(
  () => services.analyzeStoredCase({ case_id: created.id, owner_id: 'u1' }),
  /STOP_AFTER_STORAGE_LIST/
);
assert.deepEqual(listedRecords.map(record => record.id), [invoice.id], 'analysis must receive uploaded documents only');
assert.equal(listedRecords.some(record => record.id === quote.id), false);

console.log('OK 10-minute Fakturasjekk acceptance window blocks late provider-token uploads and excludes expired reservations from analysis');
