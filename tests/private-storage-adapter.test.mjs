import assert from 'node:assert/strict';
import { createPrivateObjectStorageAdapter } from '../server/private-storage-adapter.mjs';

const objects = new Map();
const provider = {
  async createSignedPut({ bucket, key, content_type }) {
    objects.set(key, { bucket, exists: false, content_type, byte_size: 0 });
    return { url: `https://storage.example/upload?key=${encodeURIComponent(key)}`, required_headers: { 'content-type': content_type } };
  },
  async headObject({ key }) { return objects.get(key) ?? { exists: false }; },
  async deletePrefix({ prefix }) {
    let deleted_count = 0;
    for (const key of [...objects.keys()]) if (key.startsWith(prefix)) { objects.delete(key); deleted_count += 1; }
    return { deleted_count };
  }
};
let scanResult = { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/pdf', sha256: 'sha-1' };
const scanner = { async scanObject() { return { ...scanResult }; } };
const storage = createPrivateObjectStorageAdapter({ provider, scanner, bucket: 'private-bucket', clock: () => new Date('2026-08-18T15:00:00Z') });
const reservation = await storage.reservePrivateObject({ case_id: 'case-1', owner_id: 'u1', document_id: 'doc-1', mime_type: 'application/pdf', byte_size: 100000 });
assert.match(reservation.upload_url, /^https:\/\//);
assert.match(reservation.storage_key, /^cases\/u1\/case-1\/doc-1-/);
assert.equal(reservation.expires_at, '2026-08-18T15:10:00.000Z');
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

assert.equal(await storage.deleteCaseObjects({ case_id: 'case-1', owner_id: 'u1' }), 1);
console.log('OK private object storage adapter');
