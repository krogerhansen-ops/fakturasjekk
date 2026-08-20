import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cameraInputAttributes, documentInputAttributes, createDocumentIntake } from '../site/app/document-intake.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/upload-policy.json', import.meta.url), 'utf8'));

assert.deepEqual(documentInputAttributes(), {
  accept: 'application/pdf,image/jpeg,image/png,image/webp',
  multiple: true
});
assert.deepEqual(cameraInputAttributes(), {
  accept: 'image/*',
  capture: 'environment'
});

const ordinary = createDocumentIntake({ policy });
const pdf = { name: 'faktura.pdf', type: 'application/pdf', size: 120000 };
const preparedPdf = await ordinary.prepare([pdf], { role: 'invoice', source: 'file' });
assert.equal(preparedPdf.valid, true);
assert.deepEqual(preparedPdf.descriptors, [{ name: 'faktura.pdf', mime_type: 'application/pdf', size: 120000, role: 'invoice' }]);
assert.equal(preparedPdf.files[0], pdf, 'ordinary file upload must pass the original File object through untouched');

const rawCameraImage = { name: 'IMG_1001.HEIC', type: 'image/heic', size: 2100000 };
const blockedCamera = await ordinary.prepare([rawCameraImage], { role: 'invoice', source: 'camera' });
assert.equal(blockedCamera.valid, false);
assert.ok(blockedCamera.errors.some(error => error.code === 'camera_sanitizer_required'));
assert.equal(blockedCamera.files.length, 0, 'raw camera image must never be prepared when metadata stripping is unavailable');

const safeJpeg = { name: 'faktura-bilde-1.jpg', type: 'image/jpeg', size: 940000 };
let sanitizerCalls = 0;
const camera = createDocumentIntake({
  policy,
  sanitizeCameraFile: async (file, context) => {
    sanitizerCalls += 1;
    assert.equal(file, rawCameraImage);
    assert.equal(context.role, 'invoice');
    return { file: safeJpeg, metadata_stripped: true, low_resolution: false };
  }
});
const preparedCamera = await camera.prepare([rawCameraImage], { role: 'invoice', source: 'camera' });
assert.equal(sanitizerCalls, 1);
assert.equal(preparedCamera.valid, true, 'HEIC camera source may be accepted only after sanitizer converts it to an allowed upload type');
assert.equal(preparedCamera.files[0], safeJpeg);
assert.deepEqual(preparedCamera.descriptors, [{ name: 'faktura-bilde-1.jpg', mime_type: 'image/jpeg', size: 940000, role: 'invoice' }]);
assert.equal(JSON.stringify(preparedCamera.descriptors).includes('camera'), false, 'local capture source must not expand backend metadata contract');
assert.equal(JSON.stringify(preparedCamera.descriptors).includes('metadata_stripped'), false);

const dishonestSanitizer = createDocumentIntake({ policy, sanitizeCameraFile: async file => ({ file }) });
const unsafe = await dishonestSanitizer.prepare([rawCameraImage], { role: 'invoice', source: 'camera' });
assert.equal(unsafe.valid, false);
assert.ok(unsafe.errors.some(error => error.code === 'camera_metadata_not_stripped'));

const lowResolution = createDocumentIntake({
  policy,
  sanitizeCameraFile: async () => ({ file: safeJpeg, metadata_stripped: true, low_resolution: true })
});
const low = await lowResolution.prepare([rawCameraImage], { role: 'invoice', source: 'camera' });
assert.equal(low.valid, true);
assert.ok(low.warnings.some(message => /lavoppløselig/.test(message)), 'low resolution is a warning, not a guessed OCR failure');

const tooLarge = await ordinary.prepare([{ name: 'stor.pdf', type: 'application/pdf', size: policy.max_file_bytes + 1 }], { role: 'invoice' });
assert.equal(tooLarge.valid, false);
assert.ok(tooLarge.errors.some(error => error.code === 'file_too_large'));

const calls = [];
const api = {
  async registerUploads(caseId, descriptors) {
    calls.push(['register', caseId, descriptors]);
    return {
      accepted: true,
      validation: { valid: true },
      upload_targets: [{ document_id: 'doc-1', upload_url: 'https://signed.example/1' }],
      case: { id: caseId }
    };
  },
  async uploadSigned(target, file) {
    calls.push(['upload', target.document_id, file]);
    return { document_id: target.document_id, uploaded: true };
  },
  async confirmDocument(caseId, documentId) {
    calls.push(['confirm', caseId, documentId]);
    return { uploaded: true, document: { id: documentId, status: 'uploaded' } };
  }
};
const uploaded = await ordinary.uploadPrepared({ api, caseId: 'case-1', prepared: preparedPdf });
assert.equal(uploaded.uploaded, true);
assert.equal(uploaded.confirmed[0].document_id, 'doc-1');
assert.deepEqual(calls.map(call => call[0]), ['register', 'upload', 'confirm'], 'browser flow must register -> signed PUT -> server confirmation in order');
assert.deepEqual(calls[0][2], preparedPdf.descriptors);

const mismatchApi = { ...api, registerUploads: async () => ({ accepted: true, validation: { valid: true }, upload_targets: [] }) };
await assert.rejects(
  () => ordinary.uploadPrepared({ api: mismatchApi, caseId: 'case-1', prepared: preparedPdf }),
  error => error?.code === 'upload_target_mismatch'
);

console.log('OK browser document intake supports files and privacy-safe camera preparation without weakening signed upload verification');
