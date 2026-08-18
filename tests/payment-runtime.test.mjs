import assert from 'node:assert/strict';
import { createApi } from '../server/api.mjs';
import { createDevelopmentAuthAdapter } from '../server/auth-adapter.mjs';
import { createNodeHandler, startNodeServer } from '../server/node-runtime.mjs';

const services = {
  async getPaymentRequirement({ case_id, owner_id }) {
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'u1');
    return { case_id, amount_minor: 2900, amount_nok: 29, currency: 'NOK', description: 'Full fakturasjekk + utkast til innsigelse' };
  }
};
let sessionCalls = 0;
const paymentGateway = {
  async createSession({ case_id, owner_id, requirement }) {
    sessionCalls += 1;
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'u1');
    assert.equal(requirement.amount_minor, 2900);
    return { provider: 'dev-pay', checkout_url: 'https://pay.example/checkout', expires_at: null };
  }
};
let rawSeen = null;
const paymentWebhookService = {
  async process({ raw_body }) {
    rawSeen = raw_body;
    return { accepted: true, paid: true };
  }
};
const api = createApi({
  services,
  paymentGateway,
  paymentWebhookService,
  paymentProviderName: 'dev-pay',
  allowedReturnOrigins: ['https://fakturasjekk.no']
});
const authAdapter = createDevelopmentAuthAdapter({ users: { token12345: { id: 'u1' } } });
const handler = createNodeHandler({ api, authAdapter, allowedOrigins: ['https://fakturasjekk.no'], production: false });
const server = await startNodeServer({ handler, port: 0 });
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const unauth = await fetch(`${base}/v1/cases/case-1/payment/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(unauth.status, 401);
  assert.equal(sessionCalls, 0);

  const checkout = await fetch(`${base}/v1/cases/case-1/payment/session`, {
    method: 'POST',
    headers: { authorization: 'Bearer token12345', 'content-type': 'application/json', origin: 'https://fakturasjekk.no' },
    body: JSON.stringify({ return_url: 'https://fakturasjekk.no/min-sak' })
  });
  assert.equal(checkout.status, 201);
  assert.equal(sessionCalls, 1);
  assert.equal((await checkout.json()).checkout_url, 'https://pay.example/checkout');

  const raw = '{"signature":"abc","amount_minor":2900,"note":"spacing stays"}';
  const webhook = await fetch(`${base}/v1/webhooks/payment/dev-pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
  assert.equal(webhook.status, 200);
  assert.equal(rawSeen, raw);
  assert.deepEqual(await webhook.json(), { accepted: true });
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('OK payment runtime boundary');
