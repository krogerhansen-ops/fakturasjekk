import assert from 'node:assert/strict';
import { createApiClient, FakturasjekkApiError, fileDescriptor } from '../site/app/api-client.mjs';

const calls = [];
const fakeFetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.includes('signed-upload.example')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' };
  return {
    ok: true,
    status: 200,
    headers: { get: name => name === 'x-request-id' ? 'req-1' : null },
    text: async () => JSON.stringify({ ok: true })
  };
};
let keyN = 0;
const api = createApiClient({ baseUrl: 'https://api.fakturasjekk.no/', getToken: async () => 'token-1', fetchImpl: fakeFetch, idempotencyKey: () => `key-${++keyN}-12345678` });
await api.createCase({ buyer_type: 'consumer', subject: 'goods' });
assert.equal(calls[0].url, 'https://api.fakturasjekk.no/v1/cases');
assert.equal(calls[0].options.headers.authorization, 'Bearer token-1');
assert.ok(calls[0].options.headers['idempotency-key']);

await api.getPaymentRequirement('case 1');
assert.match(calls[1].url, /case%201\/payment$/);
assert.equal('idempotency-key' in calls[1].options.headers, false);

await api.confirmFacts('case 1', [{ field: 'invoice_total', value: 1000, source_document_id: 'doc-1', source_page: 1, confirmed_by_user: true }]);
const confirmationCall = calls[2];
assert.match(confirmationCall.url, /case%201\/facts\/confirm$/);
assert.equal(confirmationCall.options.method, 'POST');
assert.ok(confirmationCall.options.headers['idempotency-key']);
assert.equal(JSON.parse(confirmationCall.options.body).items[0].confirmed_by_user, true);

const target = { document_id: 'doc-1', upload_url: 'https://signed-upload.example/object?sig=x', required_headers: { 'content-type': 'application/pdf' } };
const fakeFile = { name: 'Kai-Hansen-faktura-august.pdf', type: 'application/pdf', size: 123, data: 'x' };
await api.uploadSigned(target, fakeFile);
const uploadCall = calls.at(-1);
assert.equal(uploadCall.options.method, 'PUT');
assert.equal('authorization' in uploadCall.options.headers, false, 'Bearer token must never be sent to signed object-storage URL');
assert.equal(uploadCall.options.credentials, 'omit');

const descriptor = fileDescriptor(fakeFile, 'invoice');
assert.deepEqual(descriptor, { name: 'invoice-1.pdf', mime_type: 'application/pdf', size: 123, role: 'invoice' });
assert.equal(JSON.stringify(descriptor).includes('Kai-Hansen'), false, 'original local filename must never be included in backend upload metadata');

const errorApi = createApiClient({
  baseUrl: 'https://api.fakturasjekk.no', getToken: async () => 'token',
  fetchImpl: async () => ({ ok: false, status: 402, headers: { get: () => 'req-pay' }, text: async () => JSON.stringify({ error: { code: 'payment_required', message: '29 kr kreves.' }, request_id: 'req-pay' }) })
});
await assert.rejects(() => errorApi.getResult('case-1'), error => error instanceof FakturasjekkApiError && error.status === 402 && error.code === 'payment_required' && error.request_id === 'req-pay');

console.log('OK browser API client and privacy-safe upload metadata');
