import assert from 'node:assert/strict';
import { createPaymentWebhookService } from '../server/payment-webhook-service.mjs';
import { createMemoryPaymentEventStore } from '../server/payment-event-store.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';

const caseStore = createMemoryCaseStore();
await caseStore.save({ id: 'case-vipps-12345678', owner_id: 'u1', state: 'analysis_ready', deleted_at: null });
const eventStore = createMemoryPaymentEventStore();
let captureCalls = 0;
let confirmCalls = 0;
let currentEvent = null;
const gateway = {
  async verifyEvent() { return structuredClone(currentEvent); },
  async captureAuthorized({ confirmation }) {
    captureCalls += 1;
    assert.equal(confirmation.status, 'authorized');
    assert.equal(confirmation.amount_minor, 2900);
    return { captured: true };
  }
};
const services = {
  async confirmPayment({ confirmation }) {
    confirmCalls += 1;
    const paid = confirmation.status === 'paid' && confirmation.amount_minor === 2900 && confirmation.currency === 'NOK';
    return { paid };
  }
};
const webhookService = createPaymentWebhookService({ caseStore, services, gateway, eventStore });

currentEvent = {
  case_id: 'case-vipps-12345678', payment_reference: 'fsk-case-vipps-12345678', provider_reference: 'psp-auth-1',
  provider: 'vipps', verified_server_side: true, amount_minor: 2900, currency: 'NOK',
  status: 'authorized', event_name: 'AUTHORIZED', operation_success: true, paid_at: null
};
const authorized = await webhookService.process({ headers: {}, raw_body: '{}' });
assert.equal(authorized.accepted, true);
assert.equal(authorized.paid, false, 'authorization alone must never unlock the result');
assert.equal(authorized.capture_requested, true);
assert.equal(captureCalls, 1);
assert.equal(confirmCalls, 0);

const authorizedReplay = await webhookService.process({ headers: {}, raw_body: '{}' });
assert.equal(authorizedReplay.duplicate, true);
assert.equal(authorizedReplay.paid, false);
assert.equal(captureCalls, 2, 'duplicate authorization retries idempotent capture to recover transient post-claim failures');

currentEvent = {
  case_id: 'case-vipps-12345678', payment_reference: 'fsk-case-vipps-12345678', provider_reference: 'psp-capture-1',
  provider: 'vipps', verified_server_side: true, amount_minor: 2900, currency: 'NOK',
  status: 'paid', event_name: 'CAPTURED', operation_success: true, paid_at: '2026-08-19T06:31:00Z'
};
const captured = await webhookService.process({ headers: {}, raw_body: '{}' });
assert.equal(captured.accepted, true);
assert.equal(captured.paid, true, 'only captured payment may unlock');
assert.equal(confirmCalls, 1);

currentEvent = {
  case_id: 'case-vipps-12345678', payment_reference: 'fsk-case-vipps-12345678', provider_reference: 'psp-created-1',
  provider: 'vipps', verified_server_side: true, amount_minor: 2900, currency: 'NOK',
  status: 'created', event_name: 'CREATED', operation_success: true, paid_at: null
};
const created = await webhookService.process({ headers: {}, raw_body: '{}' });
assert.equal(created.accepted, true);
assert.equal(created.paid, false);
assert.equal(confirmCalls, 1);

currentEvent = {
  case_id: 'case-vipps-12345678', payment_reference: 'fsk-case-vipps-12345678', provider_reference: 'psp-auth-wrong-amount',
  provider: 'vipps', verified_server_side: true, amount_minor: 3900, currency: 'NOK',
  status: 'authorized', event_name: 'AUTHORIZED', operation_success: true, paid_at: null
};
const wrongAmount = await webhookService.process({ headers: {}, raw_body: '{}' });
assert.equal(wrongAmount.accepted, true);
assert.equal(wrongAmount.capture_requested, false);
assert.equal(captureCalls, 2, 'wrong amount authorization must not be captured');

console.log('OK Vipps authorization is captured idempotently and only CAPTURED unlocks paid access');
