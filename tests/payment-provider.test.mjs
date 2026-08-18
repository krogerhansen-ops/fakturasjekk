import assert from 'node:assert/strict';
import { ROUTES } from '../server/routes-manifest.mjs';
import { createPaymentProviderGateway, createDevelopmentPaymentProvider } from '../server/payment-provider-contract.mjs';
import { createPaymentWebhookService } from '../server/payment-webhook-service.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';

assert.equal(ROUTES.some(r => r.path.endsWith('/payment/confirm')), false, 'Browser payment confirmation route must not exist');
const sessionRoute = ROUTES.find(r => r.action === 'create_payment_session');
assert.ok(sessionRoute?.auth === true);
const webhookRoute = ROUTES.find(r => r.action === 'payment_webhook');
assert.equal(webhookRoute.auth, false);
assert.equal(webhookRoute.raw_body, true);
assert.equal(webhookRoute.cors, false);

const provider = createDevelopmentPaymentProvider({ name: 'dev-pay' });
const gateway = createPaymentProviderGateway({ provider, product: { price_nok: 29 }, allowed_providers: ['dev-pay'] });
const session = await gateway.createSession({
  case_id: 'case-1',
  owner_id: 'u1',
  requirement: { amount_minor: 2900, currency: 'NOK', description: 'Full fakturasjekk + utkast til innsigelse' },
  return_url: 'https://fakturasjekk.no/min-sak'
});
assert.equal(session.provider, 'dev-pay');
assert.match(session.checkout_url, /^https:\/\//);
await assert.rejects(
  () => gateway.createSession({ case_id: 'case-1', owner_id: 'u1', requirement: { amount_minor: 3000, currency: 'NOK' } }),
  /unexpected product price/i
);

await assert.rejects(
  () => gateway.verifyEvent({ headers: {}, raw_body: JSON.stringify({ signature: 'bad', case_id: 'case-1', amount_minor: 2900, currency: 'NOK', status: 'paid' }) }),
  /kunne ikke verifiseres/i
);

const caseStore = createMemoryCaseStore();
await caseStore.save({ id: 'case-1', owner_id: 'u1', state: 'analysis_ready', deleted_at: null });
let confirmCalls = 0;
const services = {
  async confirmPayment({ case_id, owner_id, confirmation }) {
    confirmCalls += 1;
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'u1');
    assert.equal(confirmation.verified_server_side, true);
    assert.equal(confirmation.amount_minor, 2900);
    return { paid: true };
  }
};
const webhookService = createPaymentWebhookService({ caseStore, services, gateway });
const accepted = await webhookService.process({
  headers: {},
  raw_body: JSON.stringify({
    signature: 'dev-valid-signature',
    case_id: 'case-1',
    provider_reference: 'pay-1',
    amount_minor: 2900,
    currency: 'NOK',
    status: 'paid',
    paid_at: '2026-08-18T15:30:00Z'
  })
});
assert.equal(accepted.accepted, true);
assert.equal(confirmCalls, 1);

console.log('OK secure payment provider boundary');
