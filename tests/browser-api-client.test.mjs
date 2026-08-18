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

const target = { document_id: 'doc-1', upload_url: 'https://signed-upload.example/object?sig=x', required_headers: { 'content-type': 'application/pdf' } };
const fakeFile = { name: 'faktura.pdf', type: 'application/pdf', size: 123, data: 'x' };
await api.uploadSigned(target, fakeFile);
const uploadCall = calls.at(-1);
assert.equal(uploadCall.options.method, 'PUT');
assert.equal('authorization' in uploadCall.options.headers, false, 'Bearer token must never be sent to signed object-storage URL');
assert.equal(uploadCall.options.credentials, 'omit');

assert.deepEqual(fileDescriptor(fakeFile, 'invoice'), { name: 'faktura.pdf', mime_type: 'application/pdf', size: 123, role: 'invoice' });

const errorApi = createApiClient({
  baseUrl: 'https://api.fakturasjekk.no', getToken: async () => 'token',
  fetchImpl: async () => ({ ok: false, status: 402, headers: { get: () => 'req-pay' }, text: async () => JSON.stringify({ error: { code: 'payment_required', message: '29 kr kreves.' }, request_id: 'req-pay' }) })
});
await assert.rejects(() => errorApi.getResult('case-1'), error => error instanceof FakturasjekkApiError && error.status === 402 && error.code === 'payment_required' && error.request_id === 'req-pay');

console.log('OK browser API client');
