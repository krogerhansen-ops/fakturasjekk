import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createOrderConfirmationService } from '../server/order-confirmation-service.mjs';
import { createOrderConfirmationDeliveryWebhookService } from '../server/order-confirmation-delivery-webhook-service.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const baseConfirmation = {
  version: 1,
  document_type: 'order_confirmation_and_payment_receipt',
  confirmation_id: 'confirmation-1',
  issued_at: '2026-08-22T12:00:00.000Z',
  delivery_provider_accepted: false,
  delivery_provider_accepted_at: null,
  delivery_provider: null,
  delivery_reference: null,
  durable_medium_delivered: false,
  durable_medium_delivered_at: null,
  durable_medium: null,
  agreement: {
    checkout_policy_version: 'checkout-v1',
    terms_version: 'terms-v1',
    privacy_notice_version: 'privacy-v1',
    withdrawal_information_version: 'withdrawal-v1',
    accepted_at: '2026-08-22T11:59:00.000Z',
    payment_obligation_acknowledged: true,
    immediate_service_start_requested: true,
    withdrawal_loss_on_full_performance_acknowledged: true
  },
  payment: {
    status: 'paid',
    amount_minor: 2900,
    currency: 'NOK',
    provider: 'vipps',
    provider_reference: 'vipps-1',
    verified_server_side: true
  }
};

function caseData(overrides = {}) {
  return {
    id: 'case-1',
    owner_id: ownerId,
    state: 'paid',
    retention_mode: 'temporary',
    created_at: '2026-08-22T11:00:00.000Z',
    updated_at: '2026-08-22T12:00:00.000Z',
    deleted_at: null,
    checkout_consents: [],
    events: [],
    order_confirmations: [{ ...structuredClone(baseConfirmation), ...overrides }]
  };
}

function adapterEvent(overrides = {}) {
  return {
    authenticated: true,
    provider: 'brevo',
    event: 'delivered',
    delivered: true,
    terminal_failure: false,
    retryable_failure: false,
    case_id: 'case-1',
    owner_id: ownerId,
    confirmation_id: 'confirmation-1',
    delivery_reference: '<message-1@relay>',
    occurred_at: '2026-08-22T12:00:01.000Z',
    ...overrides
  };
}

async function harness({ confirmation = {}, event = adapterEvent(), clock = '2026-08-22T12:00:02.000Z' } = {}) {
  const store = createMemoryCaseStore();
  await store.save(caseData(confirmation));
  const orderConfirmationService = createOrderConfirmationService({
    caseStore: store,
    checkoutPolicy: {},
    clock: () => new Date(clock)
  });
  const audits = [];
  const service = createOrderConfirmationDeliveryWebhookService({
    deliveryAdapter: { verifyWebhook() { return structuredClone(event); } },
    orderConfirmationService,
    audit: { async record(entry) { audits.push(structuredClone(entry)); } }
  });
  return { store, service, audits };
}

// Race safety: delivered may arrive before provider acceptance was persisted.
{
  const { store, service, audits } = await harness();
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.delivered, true);
  assert.equal(result.idempotent, false);
  const saved = await store.getOwned('case-1', ownerId);
  const confirmation = saved.order_confirmations.at(-1);
  assert.equal(confirmation.delivery_provider_accepted, true, 'delivered webhook must atomically imply provider acceptance');
  assert.equal(confirmation.delivery_provider, 'brevo');
  assert.equal(confirmation.delivery_reference, '<message-1@relay>');
  assert.equal(confirmation.durable_medium_delivered, true);
  assert.equal(confirmation.durable_medium, 'email');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'delivered');
  assert.equal(audits[0].metadata.status, 'brevo:delivered');
}

// Already accepted matching message becomes delivered, then duplicate webhook is idempotent.
{
  const acceptedState = {
    delivery_provider_accepted: true,
    delivery_provider_accepted_at: '2026-08-22T12:00:00.500Z',
    delivery_provider: 'brevo',
    delivery_reference: '<message-1@relay>',
    durable_medium: 'email'
  };
  const { service, audits } = await harness({ confirmation: acceptedState });
  const first = await service.process({ headers: {}, raw_body: '{}' });
  const second = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(first.delivered, true);
  assert.equal(first.idempotent, false);
  assert.equal(second.delivered, true);
  assert.equal(second.idempotent, true);
  assert.deepEqual(audits.map(item => item.outcome), ['delivered', 'duplicate_delivered']);
}

// A conflicting provider message is acknowledged but must never mutate the case.
{
  const { store, service } = await harness({
    confirmation: {
      delivery_provider_accepted: true,
      delivery_provider_accepted_at: '2026-08-22T12:00:00.500Z',
      delivery_provider: 'brevo',
      delivery_reference: '<stored@relay>',
      durable_medium: 'email'
    }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.conflict, true);
  const saved = await store.getOwned('case-1', ownerId);
  assert.equal(saved.order_confirmations.at(-1).durable_medium_delivered, false);
}

// Non-delivery status cannot bind an unpersisted message to a confirmation.
{
  const event = adapterEvent({ event: 'soft_bounce', delivered: false, retryable_failure: true });
  const { store, service } = await harness({ event });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.conflict, true);
  const saved = await store.getOwned('case-1', ownerId);
  assert.equal(saved.order_confirmations.at(-1).delivery_provider_accepted, false);
}

// Matching provider-deferred status is accepted but never marks durable delivery.
{
  const event = adapterEvent({ event: 'soft_bounce', delivered: false, retryable_failure: true });
  const { store, service, audits } = await harness({
    event,
    confirmation: {
      delivery_provider_accepted: true,
      delivery_provider_accepted_at: '2026-08-22T12:00:00.500Z',
      delivery_provider: 'brevo',
      delivery_reference: '<message-1@relay>',
      durable_medium: 'email'
    }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.delivered, false);
  assert.equal(result.retryable_failure, true);
  const saved = await store.getOwned('case-1', ownerId);
  assert.equal(saved.order_confirmations.at(-1).durable_medium_delivered, false);
  assert.equal(audits.at(-1).outcome, 'provider_deferred');
}

// Provider authentication failure is rejected before case access.
{
  let accessed = 0;
  const service = createOrderConfirmationDeliveryWebhookService({
    deliveryAdapter: { verifyWebhook() { return { authenticated: false }; } },
    orderConfirmationService: {
      async getLatestPrepared() { accessed += 1; throw new Error('must not access'); },
      async markDelivered() { throw new Error('must not mark'); }
    }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.deepEqual(result, { accepted: false, delivered: false });
  assert.equal(accessed, 0);
}

// Authentic webhook for an already deleted/missing case is acknowledged without recreating data.
{
  const audits = [];
  const service = createOrderConfirmationDeliveryWebhookService({
    deliveryAdapter: { verifyWebhook() { return adapterEvent(); } },
    orderConfirmationService: {
      async getLatestPrepared() { throw new Error('case deleted'); },
      async markDelivered() { throw new Error('must not mark'); }
    },
    audit: { async record(entry) { audits.push(entry); } }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.ignored, true);
  assert.equal(audits[0].outcome, 'ignored_missing_case');
}

console.log('OK durable receipt webhook is authenticated, race-safe, conflict-safe, idempotent and actually audited');
