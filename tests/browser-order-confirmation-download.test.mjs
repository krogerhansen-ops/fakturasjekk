import assert from 'node:assert/strict';
import { saveOrderConfirmation, validateOrderConfirmationDownload, ORDER_CONFIRMATION_DOWNLOAD_MAX_BYTES } from '../site/app/order-confirmation-download.mjs';

const htmlBody = '<!doctype html><html><body>Ordrebekreftelse 29,00 kr NOK</body></html>';
const payload = {
  confirmation_id: 'confirmation-1',
  document: {
    format: 'html',
    filename: 'fakturasjekk-ordrebekreftelse-confirmation-1.html',
    content_type: 'text/html; charset=utf-8',
    content_disposition: 'attachment; filename="fakturasjekk-ordrebekreftelse-confirmation-1.html"',
    body: htmlBody,
    durable_medium_delivered: false
  }
};

const validated = validateOrderConfirmationDownload(payload);
assert.equal(validated.filename, payload.document.filename);
assert.equal(validated.durable_medium_delivered, false);
assert.ok(validated.byte_length > 0);
assert.equal(ORDER_CONFIRMATION_DOWNLOAD_MAX_BYTES, 512 * 1024);

for (const bad of [
  { ...payload, document: { ...payload.document, durable_medium_delivered: true } },
  { ...payload, document: { ...payload.document, content_type: 'text/html' } },
  { ...payload, document: { ...payload.document, filename: '../receipt.html' } },
  { ...payload, document: { ...payload.document, filename: 'evil/receipt.html' } },
  { ...payload, document: { ...payload.document, format: 'pdf' } },
  { ...payload, document: { ...payload.document, body: '' } }
]) {
  assert.throws(() => validateOrderConfirmationDownload(bad));
}

assert.throws(
  () => validateOrderConfirmationDownload({ ...payload, document: { ...payload.document, body: 'x'.repeat(2048) } }, { maxBytes: 1024 }),
  error => error?.code === 'order_confirmation_download_too_large'
);

const calls = [];
const apiClient = {
  async getOrderConfirmation(caseId, format) {
    calls.push({ caseId, format });
    return payload;
  }
};
let clicked = false;
let removed = false;
let appended = false;
const anchor = {
  href: '', download: '', rel: '', style: {},
  click() { clicked = true; },
  remove() { removed = true; }
};
const documentImpl = {
  createElement(tag) { assert.equal(tag, 'a'); return anchor; },
  body: { appendChild(node) { assert.equal(node, anchor); appended = true; } }
};
let createdBlob = null;
const objectUrl = 'blob:test-order-confirmation';
let revoked = null;
const urlImpl = {
  createObjectURL(blob) { createdBlob = blob; return objectUrl; },
  revokeObjectURL(value) { revoked = value; }
};
const scheduled = [];
const schedule = fn => { scheduled.push(fn); return 1; };

const result = await saveOrderConfirmation({ apiClient, caseId: 'case 1', format: 'html', documentImpl, urlImpl, BlobImpl: Blob, schedule });
assert.deepEqual(calls, [{ caseId: 'case 1', format: 'html' }]);
assert.equal(appended, true);
assert.equal(clicked, true);
assert.equal(removed, true);
assert.equal(anchor.href, objectUrl);
assert.equal(anchor.download, payload.document.filename);
assert.equal(anchor.rel, 'noopener');
assert.equal(createdBlob.type, 'text/html; charset=utf-8');
assert.equal(result.durable_medium_delivered, false);
assert.equal(revoked, null, 'object URL should not be revoked before browser gets the click');
assert.equal(scheduled.length, 1);
scheduled[0]();
assert.equal(revoked, objectUrl);

const textPayload = {
  confirmation_id: 'confirmation-2',
  document: {
    format: 'text',
    filename: 'fakturasjekk-ordrebekreftelse-confirmation-2.txt',
    content_type: 'text/plain; charset=utf-8',
    content_disposition: 'attachment; filename="fakturasjekk-ordrebekreftelse-confirmation-2.txt"',
    body: 'Ordrebekreftelse 29,00 kr NOK',
    durable_medium_delivered: false
  }
};
assert.equal(validateOrderConfirmationDownload(textPayload).format, 'text');

console.log('OK browser receipt save is local, bounded, filename-safe and durable-medium neutral.');
