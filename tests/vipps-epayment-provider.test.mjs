import assert from 'node:assert/strict';
import { createVippsAccessTokenProvider, createVippsEpaymentProvider, vippsReferenceForCase } from '../server/vipps-epayment-provider.mjs';

const encoder = new TextEncoder();
function b64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
async function hash(body) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body)))); }
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))));
}

const calls = [];
let tokenCalls = 0;
const fetchImpl = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, options, body });
  if (url.endsWith('/accesstoken/get')) {
    tokenCalls += 1;
    return new Response(JSON.stringify({ access_token: 'vipps-test-token', expires_in: 3600 }), { status: 200 });
  }
  if (url.endsWith('/epayment/v1/payments') && options.method === 'POST') {
    assert.equal(body.amount.value, 2900);
    assert.equal(body.amount.currency, 'NOK');
    assert.equal(body.reference, 'fsk-case-12345678');
    assert.equal(body.userFlow, 'WEB_REDIRECT');
    assert.equal(body.paymentMethod.type, 'WALLET');
    return new Response(JSON.stringify({ redirectUrl: 'https://pay.vipps.no/dwo-api-application/v1/deeplink/test' }), { status: 201 });
  }
  if (url.endsWith('/epayment/v1/payments/fsk-case-12345678/capture')) {
    assert.deepEqual(body, { modificationAmount: { currency: 'NOK', value: 2900 } });
    return new Response(JSON.stringify({
      reference: 'fsk-case-12345678',
      pspReference: 'capture-psp-1',
      aggregate: { capturedAmount: { currency: 'NOK', value: 2900 } }
    }), { status: 200 });
  }
  if (url.endsWith('/epayment/v1/payments/fsk-case-12345678') && options.method === 'GET') {
    return new Response(JSON.stringify({ reference: 'fsk-case-12345678', state: 'AUTHORIZED', aggregate: { capturedAmount: { currency: 'NOK', value: 0 } } }), { status: 200 });
  }
  throw new Error(`Unexpected Vipps URL: ${url}`);
};

const tokenProvider = createVippsAccessTokenProvider({
  clientId: 'client-id', clientSecret: 'client-secret', subscriptionKey: 'sub-key', merchantSerialNumber: '123456',
  environment: 'test', fetchImpl, clock: () => new Date('2026-08-19T06:00:00Z')
});
assert.equal(await tokenProvider.getAccessToken(), 'vipps-test-token');
assert.equal(await tokenProvider.getAccessToken(), 'vipps-test-token');
assert.equal(tokenCalls, 1, 'access token should be reused while valid');

const webhookSecret = 'webhook-secret-test';
const provider = createVippsEpaymentProvider({
  accessTokenProvider: tokenProvider,
  subscriptionKey: 'sub-key', merchantSerialNumber: '123456', webhookSecret,
  webhookHost: 'api.fakturasjekk.no', webhookPathAndQuery: '/v1/webhooks/payment/vipps',
  environment: 'test', fetchImpl, systemVersion: '0.70.0'
});

assert.equal(vippsReferenceForCase('case-12345678'), 'fsk-case-12345678');
const created = await provider.createPayment({
  case_id: 'case-12345678', amount_minor: 2900, currency: 'NOK',
  description: 'Full fakturasjekk + utkast til innsigelse', return_url: 'https://fakturasjekk.no/min-sak'
});
assert.equal(created.provider_reference, 'fsk-case-12345678');
assert.match(created.checkout_url, /^https:\/\/pay\.vipps\.no\//);
const createCall = calls.find(c => c.url.endsWith('/epayment/v1/payments') && c.options.method === 'POST');
assert.ok(createCall.options.headers['idempotency-key'].startsWith('fsk-create-'));
assert.equal(createCall.options.headers.authorization, 'Bearer vipps-test-token');
assert.equal(createCall.options.headers['merchant-serial-number'], '123456');
assert.equal(createCall.options.headers.client_secret, undefined);

const capture = await provider.capturePayment({ case_id: 'case-12345678', amount_minor: 2900, currency: 'NOK' });
assert.equal(capture.captured, true);
const captureCall = calls.find(c => c.url.endsWith('/capture'));
assert.ok(captureCall.options.headers['idempotency-key'].startsWith('fsk-capture-'));

const polled = await provider.getPayment({ case_id: 'case-12345678' });
assert.equal(polled.payment.state, 'AUTHORIZED');

async function signedWebhook(event) {
  const raw_body = JSON.stringify(event);
  const date = 'Wed, 19 Aug 2026 06:30:00 GMT';
  const contentHash = await hash(raw_body);
  const signedString = `POST\n/v1/webhooks/payment/vipps\n${date};api.fakturasjekk.no;${contentHash}`;
  const signature = await hmac(webhookSecret, signedString);
  return {
    raw_body,
    headers: {
      host: 'api.fakturasjekk.no',
      'x-ms-date': date,
      'x-ms-content-sha256': contentHash,
      authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`
    }
  };
}

const authorizedRequest = await signedWebhook({
  msn: '123456', reference: 'fsk-case-12345678', pspReference: 'auth-psp-1', name: 'AUTHORIZED',
  amount: { currency: 'NOK', value: 2900 }, timestamp: '2026-08-19T06:30:00Z', success: true
});
const authorized = await provider.verifyWebhook(authorizedRequest);
assert.equal(authorized.signature_valid, true);
assert.equal(authorized.case_id, 'case-12345678');
assert.equal(authorized.status, 'authorized');
assert.equal(authorized.provider_reference, 'auth-psp-1');

const capturedRequest = await signedWebhook({
  msn: '123456', reference: 'fsk-case-12345678', pspReference: 'capture-psp-1', name: 'CAPTURED',
  amount: { currency: 'NOK', value: 2900 }, timestamp: '2026-08-19T06:31:00Z', success: true
});
const captured = await provider.verifyWebhook(capturedRequest);
assert.equal(captured.status, 'paid');
assert.equal(captured.paid_at, '2026-08-19T06:31:00Z');

const tampered = await provider.verifyWebhook({ ...capturedRequest, raw_body: capturedRequest.raw_body.replace('2900', '3900') });
assert.equal(tampered.signature_valid, false);
const wrongHost = await provider.verifyWebhook({ ...capturedRequest, headers: { ...capturedRequest.headers, host: 'evil.example' } });
assert.equal(wrongHost.signature_valid, false);

await assert.rejects(() => provider.createPayment({ case_id: 'case-12345678', amount_minor: 3000, currency: 'NOK', return_url: 'https://fakturasjekk.no' }), /exactly 2900/i);
await assert.rejects(() => provider.capturePayment({ case_id: 'case-12345678', amount_minor: 2900, currency: 'EUR' }), /exactly 2900/i);

assert.equal(JSON.stringify(calls).includes('client-secret'), false, 'client secret must only be used at token endpoint headers and never payment bodies');
console.log('OK Vipps ePayment create/capture/token/HMAC boundaries');
