import assert from 'node:assert/strict';
import { createPaymentWebhookService } from '../server/payment-webhook-service.mjs';
import { createMemoryPaymentEventStore } from '../server/payment-event-store.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';

const caseStore = createMemoryCaseStore();
await caseStore.save({ id: 'case-paid-1', owner_id: 'owner-1', state: 'analysis_ready', deleted_at: null });
const eventStore = createMemoryPaymentEventStore();
const capturedEvent = {
  case_id: 'case-paid-1',
  payment_reference: 'fsk-case-paid-1',
  provider_reference: 'vipps-captured-delivery-1',
  provider: 'vipps',
  verified_server_side: true,
  amount_minor: 2900,
  currency: 'NOK',
  status: 'paid',
  event_name: 'CAPTURED',
  operation_success: true,
  paid_at: '2026-08-22T07:00:00.000Z'
};

let paymentConfirmCalls = 0;
let prepareCalls = 0;
let deliveryCalls = 0;
const services = {
  async confirmPayment({ case_id, owner_id, confirmation }) {
    paymentConfirmCalls += 1;
    assert.equal(case_id, 'case-paid-1');
    assert.equal(owner_id, 'owner-1');
    assert.equal(confirmation.provider_reference, capturedEvent.provider_reference);
    return { paid: true };
  }
};
const orderConfirmationService = {
  async prepare({ case_id, owner_id }) {
    prepareCalls += 1;
    assert.equal(case_id, 'case-paid-1');
    assert.equal(owner_id, 'owner-1');
    return { confirmation: { confirmation_id: 'confirmation-1', durable_medium_delivered: false } };
  }
};
const orderConfirmationDeliveryService = {
  async deliverPrepared({ case_id, owner_id, confirmation_id }) {
    deliveryCalls += 1;
    assert.equal(case_id, 'case-paid-1');
    assert.equal(owner_id, 'owner-1');
    assert.equal(confirmation_id, 'confirmation-1');
    if (deliveryCalls === 1) {
      const error = new Error('temporary provider outage');
      error.code = 'order_confirmation_delivery_failed';
      throw error;
    }
    return { delivered: true, idempotent: false, medium: 'email', delivery_reference: 'message-1' };
  }
};
const gateway = { async verifyEvent() { return structuredClone(capturedEvent); } };
const webhook = createPaymentWebhookService({
  caseStore,
  services,
  gateway,
  eventStore,
  orderConfirmationService,
  orderConfirmationDeliveryService
});

const first = await webhook.process({ headers: {}, raw_body: '{}' });
assert.equal(first.accepted, true);
assert.equal(first.paid, true, 'delivery failure must never roll back verified payment');
assert.equal(first.duplicate, false);
assert.equal(first.order_confirmation_prepared, true);
assert.equal(first.order_confirmation_delivered, false);
assert.equal(first.order_confirmation_delivery_pending, true);
assert.equal(first.order_confirmation_delivery_medium, null);
assert.equal(paymentConfirmCalls, 1);
assert.equal(prepareCalls, 1);
assert.equal(deliveryCalls, 1);

const retry = await webhook.process({ headers: {}, raw_body: '{}' });
assert.equal(retry.accepted, true);
assert.equal(retry.paid, true);
assert.equal(retry.duplicate, true, 'same authenticated CAPTURED event should be recognized as duplicate');
assert.equal(retry.order_confirmation_prepared, true);
assert.equal(retry.order_confirmation_delivered, true, 'duplicate CAPTURED event may recover pending durable delivery');
assert.equal(retry.order_confirmation_delivery_pending, false);
assert.equal(retry.order_confirmation_delivery_medium, 'email');
assert.equal(paymentConfirmCalls, 2, 'payment confirmation remains idempotently retryable');
assert.equal(prepareCalls, 2, 'confirmation preparation remains idempotently retryable');
assert.equal(deliveryCalls, 2, 'pending delivery is retried after transient failure');

console.log('OK CAPTURED payment stays paid on delivery failure and safely retries durable delivery on duplicate webhook');
