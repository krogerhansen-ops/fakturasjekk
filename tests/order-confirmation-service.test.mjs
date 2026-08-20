import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { buildOrderConfirmation, createOrderConfirmationService } from '../server/order-confirmation-service.mjs';

const draftPolicy = JSON.parse(fs.readFileSync(new URL('../config/checkout-policy.json', import.meta.url), 'utf8'));
const policy = structuredClone(draftPolicy);
policy.seller = {
  ready: true,
  legal_name: 'Fakturasjekk Test AS',
  organization_number: '999999999',
  postal_address: 'Testveien 1, 0001 Oslo',
  support_email: 'support@example.test',
  privacy_email: 'privacy@example.test'
};

const consent = {
  id: 'checkout-1',
  checkout_policy_version: policy.version,
  terms_version: policy.terms_version,
  privacy_notice_version: policy.privacy_notice_version,
  withdrawal_information_version: policy.withdrawal_information_version,
  payment_obligation_acknowledged: true,
  immediate_service_start_requested: true,
  withdrawal_loss_on_full_performance_acknowledged: true,
  accepted_at: '2026-08-20T10:00:00.000Z',
  durable_medium_delivered_at: null
};
const payment = {
  id: 'pay-1',
  amount_minor: 2900,
  amount_nok: 29,
  currency: 'NOK',
  status: 'paid',
  provider: 'synthetic',
  provider_reference: 'provider-ref-1',
  verified_server_side: true,
  paid_at: '2026-08-20T10:01:00.000Z'
};

const pure = buildOrderConfirmation({
  confirmation_id: 'confirmation-1',
  checkout_policy: policy,
  checkout_consent: consent,
  payment,
  issued_at: '2026-08-20T10:02:00.000Z'
});
assert.equal(pure.product.amount_nok, 29);
assert.equal(pure.payment.verified_server_side, true);
assert.equal(pure.agreement.immediate_service_start_requested, true);
assert.equal(pure.durable_medium_delivered, false);
assert.equal(JSON.stringify(pure).includes('password'), false);
assert.equal(JSON.stringify(pure).includes('storage_key'), false);

assert.throws(() => buildOrderConfirmation({
  confirmation_id: 'bad', checkout_policy: policy, checkout_consent: consent,
  payment: { ...payment, amount_minor: 3000 }, issued_at: '2026-08-20T10:02:00.000Z'
}), error => error?.code === 'payment_amount_mismatch');

assert.throws(() => buildOrderConfirmation({
  confirmation_id: 'bad', checkout_policy: draftPolicy, checkout_consent: consent,
  payment, issued_at: '2026-08-20T10:02:00.000Z'
}), error => error?.code === 'seller_identity_missing');

const store = createMemoryCaseStore();
await store.save({
  id: 'case-1', owner_id: 'u1', state: 'paid', retention_mode: 'temporary',
  created_at: '2026-08-20T09:00:00.000Z', updated_at: '2026-08-20T10:01:00.000Z', deleted_at: null,
  events: [], documents: [], analyses: [], payments: [payment], drafts: [], supplier_responses: [], follow_ups: [],
  checkout_consents: [consent], order_confirmations: []
});

let tick = 0;
const service = createOrderConfirmationService({
  caseStore: store,
  checkoutPolicy: policy,
  clock: () => new Date(tick++ === 0 ? '2026-08-20T10:02:00.000Z' : '2026-08-20T10:03:00.000Z')
});

const prepared = await service.prepare({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(prepared.created, true);
assert.match(prepared.confirmation.confirmation_id, /^confirmation-/);
assert.equal(prepared.confirmation.durable_medium_delivered, false);

const again = await service.prepare({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(again.created, false, 'prepare must be idempotent for same payment and agreement');
assert.equal(again.confirmation.confirmation_id, prepared.confirmation.confirmation_id);

const delivered = await service.markDelivered({
  case_id: 'case-1', owner_id: 'u1', confirmation_id: prepared.confirmation.confirmation_id,
  medium: 'email', delivery_reference: 'provider-message-1'
});
assert.equal(delivered.updated, true);
assert.equal(delivered.confirmation.durable_medium_delivered, true);
assert.equal(delivered.confirmation.durable_medium, 'email');
assert.equal(delivered.confirmation.durable_medium_delivered_at, '2026-08-20T10:03:00.000Z');

const saved = await store.getOwned('case-1', 'u1');
assert.equal(saved.checkout_consents.at(-1).durable_medium_delivered_at, '2026-08-20T10:03:00.000Z');
assert.ok(saved.events.some(event => event.type === 'ORDER_CONFIRMATION_PREPARED'));
assert.ok(saved.events.some(event => event.type === 'ORDER_CONFIRMATION_DELIVERED'));

const redelivered = await service.markDelivered({
  case_id: 'case-1', owner_id: 'u1', confirmation_id: prepared.confirmation.confirmation_id,
  medium: 'email', delivery_reference: 'different-ref'
});
assert.equal(redelivered.updated, false, 'delivery marking must be idempotent');
assert.equal(redelivered.confirmation.delivery_reference, 'provider-message-1');

await assert.rejects(() => service.markDelivered({
  case_id: 'case-1', owner_id: 'u1', confirmation_id: prepared.confirmation.confirmation_id, medium: 'toast'
}), error => error?.code === 'invalid_durable_medium');

console.log('order-confirmation-service.test.mjs passed');
