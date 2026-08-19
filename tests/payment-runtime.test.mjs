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
let consentCalls = 0;
const checkoutConsentService = {
  async acceptForPaymentSession({ case_id, owner_id, consent, requirement }) {
    consentCalls += 1;
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'u1');
    assert.equal(requirement.amount_minor, 2900);
    assert.equal(consent.delivery_email, 'kunde@example.test');
    assert.equal(consent.payment_obligation_acknowledged, true);
    assert.equal(consent.immediate_service_start_requested, true);
    assert.equal(consent.withdrawal_loss_on_full_performance_acknowledged, true);
    return {
      checkout_consent_id: 'checkout-1',
      agreement_confirmation_payload: {
        version: 1,
        durable_medium_delivered: false,
        case_id,
        product: { name: 'Full Fakturasjekk + utkast til innsigelse', amount_nok: 29, currency: 'NOK' },
        acknowledgements: { payment_obligation: true, immediate_service_start: true, withdrawal_loss_on_full_performance: true }
      }
    };
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
  checkoutConsentService,
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
  assert.equal(consentCalls, 0);

  const checkout = await fetch(`${base}/v1/cases/case-1/payment/session`, {
    method: 'POST',
    headers: { authorization: 'Bearer token12345', 'content-type': 'application/json', origin: 'https://fakturasjekk.no' },
    body: JSON.stringify({
      return_url: 'https://fakturasjekk.no/min-sak',
      checkout_consent: {
        delivery_email: 'kunde@example.test',
        payment_obligation_acknowledged: true,
        immediate_service_start_requested: true,
        withdrawal_loss_on_full_performance_acknowledged: true
      }
    })
  });
  assert.equal(checkout.status, 201);
  assert.equal(sessionCalls, 1);
  assert.equal(consentCalls, 1);
  const checkoutBody = await checkout.json();
  assert.equal(checkoutBody.checkout_url, 'https://pay.example/checkout');
  assert.equal(checkoutBody.checkout_consent_id, 'checkout-1');
  assert.equal(checkoutBody.agreement_confirmation_payload.product.amount_nok, 29);
  assert.equal(checkoutBody.agreement_confirmation_payload.durable_medium_delivered, false);

  const raw = '{"signature":"abc","amount_minor":2900,"note":"spacing stays"}';
  const webhook = await fetch(`${base}/v1/webhooks/payment/dev-pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
  assert.equal(webhook.status, 200);
  assert.equal(rawSeen, raw);
  assert.deepEqual(await webhook.json(), { accepted: true });
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('OK payment runtime requires checkout consent + delivery email and does not confuse confirmation payload with durable-medium delivery');
