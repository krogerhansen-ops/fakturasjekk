import assert from 'node:assert/strict';
import { ROUTES } from '../server/routes-manifest.mjs';
import { createPaymentProviderGateway, createDevelopmentPaymentProvider } from '../server/payment-provider-contract.mjs';
import { createPaymentWebhookService } from '../server/payment-webhook-service.mjs';
import { createMemoryPaymentEventStore } from '../server/payment-event-store.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';

assert.equal(ROUTES.some(r => r.path.endsWith('/payment/confirm')), false, 'Browser payment confirmation route must not exist');
const sessionRoute = ROUTES.find(r => r.action === 'create_payment_session');
assert.ok(sessionRoute?.auth === true);
const webhookRoute = ROUTES.find(r => r.action === 'payment_webhook');
assert.equal(webhookRoute.auth, false);
assert.equal(webhookRoute.raw_body, true);
assert.equal(webhookRoute.cors, false);

const provider = createDevelopmentPaymentProvider({ name: 'dev-pay' });
const gateway = createPaymentProviderGateway({ provider, product: { price_nok: 29, full_check_free: false }, allowed_providers: ['dev-pay'] });
const session = await gateway.createSession({
  case_id: 'case-1', owner_id: 'u1',
  requirement: { amount_minor: 2900, currency: 'NOK', description: 'Full fakturasjekk + utkast til innsigelse' },
  return_url: 'https://fakturasjekk.no/min-sak'
});
assert.equal(session.provider, 'dev-pay');
assert.match(session.checkout_url, /^https:\/\//);
await assert.rejects(() => gateway.createSession({ case_id: 'case-1', owner_id: 'u1', requirement: { amount_minor: 3000, currency: 'NOK' } }), /unexpected product price/i);
await assert.rejects(() => gateway.verifyEvent({ headers: {}, raw_body: JSON.stringify({ signature: 'bad', case_id: 'case-1', amount_minor: 2900, currency: 'NOK', status: 'paid' }) }), /kunne ikke verifiseres/i);
await assert.rejects(() => gateway.cancelPayment({ case_id: 'case-1' }), /does not support payment cancellation/i);
await assert.rejects(() => gateway.refundPayment({ case_id: 'case-1' }), /does not support refunds/i);
await assert.rejects(() => gateway.pollPaymentEvents({ case_id: 'case-1' }), /does not support payment event polling/i);
await assert.rejects(() => gateway.reconcilePayment({ case_id: 'case-1' }), /does not support payment reconciliation/i);

const operationCalls = [];
const opsProvider = {
  name: 'ops-pay',
  async createPayment({ case_id }) { return { provider_reference: `ops-${case_id}`, checkout_url: 'https://pay.example.test' }; },
  async verifyWebhook() { return { signature_valid: true, case_id: 'case-ops', provider_reference: 'psp-ops', amount_minor: 2900, currency: 'NOK', status: 'paid' }; },
  async cancelPayment(args) { operationCalls.push(['cancel', args]); return { cancelled: true }; },
  async refundPayment(args) { operationCalls.push(['refund', args]); return { refunded: true }; },
  async getPayment(args) { operationCalls.push(['payment', args]); return { payment: { state: 'AUTHORIZED' } }; },
  async getPaymentEvents(args) { operationCalls.push(['events', args]); return { events: [{ name: 'CAPTURED' }] }; },
  async reconcilePayment(args) { operationCalls.push(['reconcile', args]); return { fully_captured: true }; }
};
const opsGateway = createPaymentProviderGateway({ provider: opsProvider, allowed_providers: ['ops-pay'] });
assert.equal((await opsGateway.cancelPayment({ case_id: 'case-ops', cancel_transaction_only: true })).cancelled, true);
assert.equal((await opsGateway.refundPayment({ case_id: 'case-ops', amount_minor: 1000, currency: 'NOK', refund_id: 'partial-1' })).refunded, true);
assert.equal((await opsGateway.pollPayment({ case_id: 'case-ops' })).payment.state, 'AUTHORIZED');
assert.equal((await opsGateway.pollPaymentEvents({ case_id: 'case-ops' })).events[0].name, 'CAPTURED');
assert.equal((await opsGateway.reconcilePayment({ case_id: 'case-ops' })).fully_captured, true);
assert.deepEqual(operationCalls, [
  ['cancel', { case_id: 'case-ops', cancel_transaction_only: true }],
  ['refund', { case_id: 'case-ops', amount_minor: 1000, currency: 'NOK', refund_id: 'partial-1' }],
  ['payment', { case_id: 'case-ops' }],
  ['events', { case_id: 'case-ops' }],
  ['reconcile', { case_id: 'case-ops' }]
]);

const caseStore = createMemoryCaseStore();
await caseStore.save({ id: 'case-1', owner_id: 'u1', state: 'analysis_ready', deleted_at: null });
await caseStore.save({ id: 'case-2', owner_id: 'u2', state: 'analysis_ready', deleted_at: null });
const eventStore = createMemoryPaymentEventStore();
let confirmCalls = 0;
const services = {
  async confirmPayment({ case_id, owner_id, confirmation }) {
    confirmCalls += 1;
    assert.equal(confirmation.verified_server_side, true);
    assert.equal(confirmation.amount_minor, 2900);
    return { paid: true, case_id, owner_id };
  }
};
const webhookService = createPaymentWebhookService({ caseStore, services, gateway, eventStore });
const event = {
  signature: 'dev-valid-signature', case_id: 'case-1', provider_reference: 'pay-1',
  amount_minor: 2900, currency: 'NOK', status: 'paid', paid_at: '2026-08-18T15:30:00Z'
};
const accepted = await webhookService.process({ headers: {}, raw_body: JSON.stringify(event) });
assert.equal(accepted.accepted, true);
assert.equal(accepted.duplicate, false);
assert.equal(confirmCalls, 1);

const duplicate = await webhookService.process({ headers: {}, raw_body: JSON.stringify(event) });
assert.equal(duplicate.accepted, true);
assert.equal(duplicate.duplicate, true);
assert.equal(confirmCalls, 2, 'signed duplicate is reprocessed through idempotent confirmation so transient post-claim failures can recover');

const conflict = await webhookService.process({ headers: {}, raw_body: JSON.stringify({ ...event, case_id: 'case-2' }) });
assert.equal(conflict.accepted, true, 'authentic permanent conflicts are acknowledged to prevent provider retry storms');
assert.equal(conflict.paid, false);
assert.equal(conflict.conflict, true);
assert.equal(confirmCalls, 2, 'conflicted event must not mutate the other case');

console.log('OK secure retry-safe payment provider boundary with adjustment and reconciliation operations');
