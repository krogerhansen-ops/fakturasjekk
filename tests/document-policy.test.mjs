import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateUploadSet } from '../engine/document-policy.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/upload-policy.json', import.meta.url), 'utf8'));

const valid = validateUploadSet([
  { name: 'faktura.pdf', mime_type: 'application/pdf', size: 500000, role: 'invoice' },
  { name: 'tilbud.pdf', mime_type: 'application/pdf', size: 400000, role: 'quote' }
], policy);
assert.equal(valid.valid, true);
assert.equal(valid.file_count, 2);
assert.ok(valid.warnings.some(w => w.includes('magic bytes')));

const missingInvoice = validateUploadSet([
  { name: 'tilbud.pdf', mime_type: 'application/pdf', size: 400000, role: 'quote' }
], policy);
assert.equal(missingInvoice.valid, false);
assert.ok(missingInvoice.errors.some(e => e.includes('invoice')));

const badMime = validateUploadSet([
  { name: 'faktura.exe', mime_type: 'application/x-msdownload', size: 1000, role: 'invoice' }
], policy);
assert.equal(badMime.valid, false);
assert.ok(badMime.errors.some(e => e.includes('ikke tillatt')));

const tooLarge = validateUploadSet([
  { name: 'faktura.pdf', mime_type: 'application/pdf', size: policy.max_file_bytes + 1, role: 'invoice' }
], policy);
assert.equal(tooLarge.valid, false);

const tooMany = Array.from({ length: policy.max_files + 1 }, (_, i) => ({
  name: `f${i}.pdf`, mime_type: 'application/pdf', size: 1000, role: i === 0 ? 'invoice' : 'other'
}));
assert.equal(validateUploadSet(tooMany, policy).valid, false);

console.log('OK: document upload policy validates required invoice, file types, file counts and size limits.');
