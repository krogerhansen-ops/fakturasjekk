import assert from 'node:assert/strict';
import { createPrivateObjectStorageAdapter } from '../server/private-storage-adapter.mjs';
import { normalizeStorageReservation, publicUploadTarget, assertUploadTargetSafe } from '../server/storage-contract.mjs';

const objects = new Map();
const provider = {
  async createSignedPut({ bucket, key, content_type }) {
    objects.set(key, { bucket, exists: false, content_type, byte_size: 0 });
    return {
      url: `https://storage.example/upload?key=${encodeURIComponent(key)}`,
      provider_expires_in_seconds: 7200,
      required_headers: { 'content-type': content_type }
    };
  },
  async headObject({ key }) { return objects.get(key) ?? { exists: false }; },
  async deletePrefix({ prefix }) {
    let deleted_count = 0;
    for (const key of [...objects.keys()]) if (key.startsWith(prefix)) { objects.delete(key); deleted_count += 1; }
    return { deleted_count };
  },
  async putObject({ bucket, key, body, content_type }) {
    objects.set(key, { bucket, exists: true, body, content_type, byte_size: Buffer.byteLength(body) });
    return { key };
  },
  async listPrefix({ prefix }) {
    return { items: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
  },
  async getObject({ key }) {
    const item = objects.get(key);
    return item ? { body: item.body } : null;
  }
};
let scanResult = { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/pdf', sha256: 'sha-1' };
const scanner = { async scanObject() { return { ...scanResult }; } };
const storage = createPrivateObjectStorageAdapter({ provider, scanner, bucket: 'private-bucket', clock: () => new Date('2026-08-18T15:00:00Z') });
const reservation = await storage.reservePrivateObject({ case_id: 'case-1', owner_id: 'u1', document_id: 'doc-1', mime_type: 'application/pdf', byte_size: 100000 });
assert.match(reservation.upload_url, /^https:\/\//);
assert.match(reservation.storage_key, /^cases\/u1\/case-1\/doc-1-/);
assert.equal(reservation.expires_at, '2026-08-18T15:10:00.000Z', 'Fakturasjekk acceptance window remains 10 minutes');
assert.equal(reservation.provider_expires_at, '2026-08-18T17:00:00.000Z', 'provider token lifetime stays internal and may be longer');

const normalized = normalizeStorageReservation(reservation);
assert.equal(normalized.provider_expires_at, '2026-08-18T17:00:00.000Z');
const publicTarget = publicUploadTarget({ document_id: 'doc-1', reservation });
assert.equal(publicTarget.expires_at, '2026-08-18T15:10:00.000Z');
assert.equal('provider_expires_at' in publicTarget, false);
assert.equal(JSON.stringify(publicTarget).includes('cases/u1/case-1'), false, 'storage key must stay internal');
assertUploadTargetSafe(publicTarget);

const stored = objects.get(reservation.storage_key);
objects.set(reservation.storage_key, { ...stored, exists: true, byte_size: 100000, content_type: 'application/pdf' });

const verified = await storage.finalizeUpload({ case_id: 'case-1', owner_id: 'u1', storage_key: reservation.storage_key, max_file_bytes: 15 * 1024 * 1024, allowed_mime_types: ['application/pdf'] });
assert.equal(verified.uploaded, true);
assert.equal(verified.magic_bytes_verified, true);
assert.equal(verified.malware_safe, true);

await assert.rejects(
  () => storage.finalizeUpload({ case_id: 'case-1', owner_id: 'u2', storage_key: reservation.storage_key, max_file_bytes: 1000000, allowed_mime_types: ['application/pdf'] }),
  /does not belong/i
);
scanResult = { malware_safe: false, magic_bytes_verified: true, detected_mime_type: 'application/pdf' };
await assert.rejects(
  () => storage.finalizeUpload({ case_id: 'case-1', owner_id: 'u1', storage_key: reservation.storage_key, max_file_bytes: 1000000, allowed_mime_types: ['application/pdf'] }),
  /malware/i
);
scanResult = { malware_safe: true, magic_bytes_verified: false, detected_mime_type: 'application/pdf' };
await assert.rejects(
  () => storage.finalizeUpload({ case_id: 'case-1', owner_id: 'u1', storage_key: reservation.storage_key, max_file_bytes: 1000000, allowed_mime_types: ['application/pdf'] }),
  /magic-byte/i
);
scanResult = { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/x-msdownload' };
await assert.rejects(
  () => storage.finalizeUpload({ case_id: 'case-1', owner_id: 'u1', storage_key: reservation.storage_key, max_file_bytes: 1000000, allowed_mime_types: ['application/pdf'] }),
  /MIME type is not allowed/i
);
scanResult = { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/pdf' };

assert.equal(await storage.deleteReservedObject({ case_id: 'case-1', owner_id: 'u1', storage_key: reservation.storage_key }), 1);
assert.equal(objects.has(reservation.storage_key), false);

await storage.recordDeletionTombstone({ case_id: 'old-case', deleted_at: '2026-06-01T00:00:00.000Z' });
const tombstone = await storage.recordDeletionTombstone({ case_id: 'case-1', deleted_at: '2026-08-18T15:30:00.000Z' });
assert.equal(tombstone.key, 'deletion-ledger/case-1.json');
let ledger = await storage.listDeletionTombstones();
assert.deepEqual(ledger.map(item => item.case_id), ['old-case', 'case-1']);
assert.equal(JSON.stringify(objects.get('deletion-ledger/case-1.json')).includes('u1'), false, 'deletion ledger must not contain owner id');

const ledgerPurge = await storage.purgeDeletionTombstonesBefore({ cutoff: '2026-07-04T00:00:00.000Z' });
assert.equal(ledgerPurge.checked, 2);
assert.equal(ledgerPurge.purged, 1);
ledger = await storage.listDeletionTombstones();
assert.deepEqual(ledger.map(item => item.case_id), ['case-1']);
assert.equal(objects.has('deletion-ledger/case-1.json'), true, 'case cleanup must not delete restore-safety tombstones');

assert.throws(
  () => createPrivateObjectStorageAdapter({ provider, scanner, bucket: 'private-bucket', upload_ttl_seconds: 600, max_provider_upload_ttl_seconds: 9000 }),
  /7200/i
);

console.log('OK private storage separates short app acceptance from bounded provider token lifetime');
