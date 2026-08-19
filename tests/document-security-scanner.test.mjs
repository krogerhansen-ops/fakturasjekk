import assert from 'node:assert/strict';
import { createDocumentSecurityScanner, detectDocumentMime, DOCUMENT_SECURITY_SCANNER_POLICY } from '../server/document-security-scanner.mjs';
import { createPrivateObjectStorageAdapter } from '../server/private-storage-adapter.mjs';

const bytes = values => Uint8Array.from(values);
const textBytes = value => new TextEncoder().encode(value);
const concat = (...parts) => {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
};

const pdf = textBytes('%PDF-1.7\nsynthetic invoice\n%%EOF');
const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = concat(textBytes('RIFF'), bytes([0x10, 0x00, 0x00, 0x00]), textBytes('WEBP'), textBytes('synthetic'));

assert.equal(detectDocumentMime(pdf), 'application/pdf');
assert.equal(detectDocumentMime(jpeg), 'image/jpeg');
assert.equal(detectDocumentMime(png), 'image/png');
assert.equal(detectDocumentMime(webp), 'image/webp');
assert.equal(detectDocumentMime(textBytes('MZ-not-a-supported-document')), null);
assert.equal(DOCUMENT_SECURITY_SCANNER_POLICY.fail_closed_without_malware_scanner, true);
assert.throws(() => createDocumentSecurityScanner({ objectReader: { getObjectBytes() {} } }), /explicit malware scanner/i);
assert.throws(() => createDocumentSecurityScanner({ malwareScanner: { scanBytes() {} } }), /private object byte reader/i);

const files = new Map([
  ['clean.pdf', pdf],
  ['fake.pdf', textBytes('this is actually plain text')],
  ['infected.pdf', pdf]
]);
const objectReader = {
  async getObjectBytes({ key, max_bytes }) {
    const file = files.get(key);
    if (!file) throw new Error('not found');
    if (file.byteLength > max_bytes) throw new Error('too large');
    return { bytes: file, byte_size: file.byteLength, content_type: 'application/octet-stream' };
  }
};

const malwareCalls = [];
const scanner = createDocumentSecurityScanner({
  objectReader,
  malwareScanner: {
    async scanBytes(input) {
      malwareCalls.push({ sha256: input.sha256, mime: input.detected_mime_type, byte_size: input.bytes.byteLength });
      if (input.sha256 && input.detected_mime_type === 'application/pdf' && input.bytes === files.get('infected.pdf')) {
        // Same synthetic bytes can only be distinguished by the caller key outside this mock, so the infected path is tested separately below.
      }
      return { safe: true, engine: 'synthetic-av', version: '1.0' };
    }
  },
  max_file_bytes: 1024
});

const clean = await scanner.scanObject({ bucket: 'private', key: 'clean.pdf', declared_mime_type: 'application/pdf' });
assert.equal(clean.malware_safe, true);
assert.equal(clean.magic_bytes_verified, true);
assert.equal(clean.detected_mime_type, 'application/pdf');
assert.equal(clean.mime_matches_declared, true);
assert.equal(clean.scanner_status, 'clean');
assert.equal(clean.malware_engine, 'synthetic-av');
assert.match(clean.sha256, /^[a-f0-9]{64}$/);
assert.equal(malwareCalls.length, 1);
assert.equal('bytes' in clean, false, 'scan result must never echo document bytes');

const mismatch = await scanner.scanObject({ bucket: 'private', key: 'clean.pdf', declared_mime_type: 'image/png' });
assert.equal(mismatch.malware_safe, true);
assert.equal(mismatch.detected_mime_type, 'application/pdf');
assert.equal(mismatch.mime_matches_declared, false, 'detected MIME must remain independent from browser-declared MIME');

const fake = await scanner.scanObject({ bucket: 'private', key: 'fake.pdf', declared_mime_type: 'application/pdf' });
assert.equal(fake.magic_bytes_verified, false);
assert.equal(fake.malware_safe, false);
assert.equal(fake.detected_mime_type, null);
assert.equal(malwareCalls.length, 2, 'unknown file type must be rejected before malware provider upload/call');

const infectedScanner = createDocumentSecurityScanner({
  objectReader,
  malwareScanner: { async scanBytes() { return { safe: false, status: 'malware_detected', engine: 'synthetic-av' }; } },
  max_file_bytes: 1024
});
const infected = await infectedScanner.scanObject({ bucket: 'private', key: 'infected.pdf', declared_mime_type: 'application/pdf' });
assert.equal(infected.magic_bytes_verified, true);
assert.equal(infected.malware_safe, false);
assert.equal(infected.scanner_status, 'malware_detected');

const ambiguousScanner = createDocumentSecurityScanner({
  objectReader,
  malwareScanner: { async scanBytes() { return { safe: true }; } },
  max_file_bytes: 1024
});
await assert.rejects(() => ambiguousScanner.scanObject({ bucket: 'private', key: 'clean.pdf' }), /without identifying its engine/i);

const unavailableScanner = createDocumentSecurityScanner({
  objectReader,
  malwareScanner: { async scanBytes() { throw new Error('provider unavailable'); } },
  max_file_bytes: 1024
});
await assert.rejects(() => unavailableScanner.scanObject({ bucket: 'private', key: 'clean.pdf' }), /Malware scan unavailable/i);

// Integration proof: existence alone is never enough. Generic finalize must reject malware/unknown bytes.
const providerObjects = new Map([
  ['cases/owner/case/doc', { bytes: pdf, content_type: 'application/pdf' }]
]);
const provider = {
  async createSignedPut() { return { url: 'https://uploads.invalid/signed', provider_expires_in_seconds: 7200 }; },
  async headObject({ key }) {
    const file = providerObjects.get(key);
    return file ? { exists: true, byte_size: file.bytes.byteLength, content_type: file.content_type } : { exists: false };
  },
  async getObjectBytes({ key, max_bytes }) {
    const file = providerObjects.get(key);
    if (!file) throw new Error('not found');
    if (file.bytes.byteLength > max_bytes) throw new Error('too large');
    return { bytes: file.bytes, byte_size: file.bytes.byteLength, content_type: file.content_type };
  },
  async deletePrefix() { return { deleted_count: 1 }; },
  async putObject() { return {}; },
  async listPrefix() { return { items: [] }; },
  async getObject() { return { body: '{}' }; }
};
const rejectingSecurityScanner = createDocumentSecurityScanner({
  objectReader: provider,
  malwareScanner: { async scanBytes() { return { safe: false, status: 'malware_detected', engine: 'synthetic-av' }; } },
  max_file_bytes: 1024
});
const privateStorage = createPrivateObjectStorageAdapter({ provider, scanner: rejectingSecurityScanner, bucket: 'private' });
await assert.rejects(() => privateStorage.finalizeUpload({
  case_id: 'case',
  owner_id: 'owner',
  storage_key: 'cases/owner/case/doc',
  max_file_bytes: 1024,
  allowed_mime_types: ['application/pdf']
}), /failed malware scan/i);

console.log('OK document scanner fails closed on unknown type, malware, missing engine and provider failure while preserving detected MIME + SHA-256 provenance.');
