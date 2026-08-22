import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createOrderConfirmationDeliveryRetryService } from '../server/order-confirmation-delivery-retry-service.mjs';

function caseWithConfirmation({ id, owner_id = 'owner-1', updated_at, delivered = false, providerAccepted = false, confirmation_id }) {
  return {
    id,
    owner_id,
    state: 'paid',
    retention_mode: 'temporary',
    created_at: '2026-08-22T05:00:00.000Z',
    updated_at,
    deleted_at: null,
    order_confirmations: [{
      document_type: 'order_confirmation_and_payment_receipt',
      confirmation_id,
      durable_medium_delivered: delivered,
      delivery_provider_accepted: providerAccepted
    }]
  };
}

const caseStore = createMemoryCaseStore();
await caseStore.save(caseWithConfirmation({ id: 'case-old', updated_at: '2026-08-22T05:10:00.000Z', confirmation_id: 'confirmation-old' }));
await caseStore.save(caseWithConfirmation({ id: 'case-fail', updated_at: '2026-08-22T05:20:00.000Z', confirmation_id: 'confirmation-fail' }));
await caseStore.save(caseWithConfirmation({ id: 'case-new', updated_at: '2026-08-22T05:30:00.000Z', confirmation_id: 'confirmation-new' }));
await caseStore.save(caseWithConfirmation({ id: 'case-delivered', updated_at: '2026-08-22T05:00:00.000Z', confirmation_id: 'confirmation-done', delivered: true }));
await caseStore.save(caseWithConfirmation({ id: 'case-provider-accepted', updated_at: '2026-08-22T05:05:00.000Z', confirmation_id: 'confirmation-accepted', providerAccepted: true }));

const attempted = [];
const deliveryService = {
  async deliverPrepared(input) {
    attempted.push(structuredClone(input));
    if (input.case_id === 'case-fail') {
      const error = new Error('Customer email address and provider details must never appear in retry output.');
      error.code = 'temporary_provider_failure';
      throw error;
    }
    return { delivered: true, accepted: true, pending_provider_confirmation: false, idempotent: false, medium: 'email' };
  }
};
const auditEntries = [];
const audit = { async record(entry) { auditEntries.push(structuredClone(entry)); } };
const retry = createOrderConfirmationDeliveryRetryService({ caseStore, deliveryService, audit, defaultLimit: 2 });

const first = await retry.run();
assert.equal(first.checked, 2);
assert.equal(first.delivered, 1);
assert.equal(first.awaiting_provider_confirmation, 0);
assert.equal(first.failed, 1);
assert.equal(first.skipped, 0);
assert.equal(first.audit_failures, 0);
assert.equal(first.ok, false);
assert.equal(first.has_more_possible, true);
assert.deepEqual(attempted.map(item => item.case_id), ['case-old', 'case-fail'], 'oldest unsent confirmations must be retried first');
assert.deepEqual(first.errors, [{ case_id: 'case-fail', confirmation_id: 'confirmation-fail', error_code: 'temporary_provider_failure' }]);
assert.equal(JSON.stringify(first).includes('Customer email'), false, 'retry summary must expose safe error codes only');
assert.equal(auditEntries.length, 2);
assert.equal(auditEntries[1].metadata.error_code, 'temporary_provider_failure');

const pending = await caseStore.listPendingOrderConfirmationDeliveries({ limit: 1000 });
assert.equal(pending.length, 3, 'delivered and provider-accepted confirmations must not be included and limit must be safely bounded');
assert.equal(pending.some(item => item.id === 'case-delivered'), false);
assert.equal(pending.some(item => item.id === 'case-provider-accepted'), false, 'already accepted message must wait for webhook, never resend');

// A send retry that is accepted by the provider is a healthy asynchronous state,
// not a failed delivery and not a reason to resend immediately.
const acceptedStore = createMemoryCaseStore();
await acceptedStore.save(caseWithConfirmation({
  id: 'case-accepted-now',
  updated_at: '2026-08-22T05:40:00.000Z',
  confirmation_id: 'confirmation-accepted-now'
}));
let acceptedAttempts = 0;
const acceptedRetry = createOrderConfirmationDeliveryRetryService({
  caseStore: acceptedStore,
  deliveryService: {
    async deliverPrepared() {
      acceptedAttempts += 1;
      return {
        delivered: false,
        accepted: true,
        pending_provider_confirmation: true,
        idempotent: false,
        medium: 'email'
      };
    }
  }
});
const acceptedRun = await acceptedRetry.run();
assert.equal(acceptedRun.checked, 1);
assert.equal(acceptedRun.delivered, 0);
assert.equal(acceptedRun.awaiting_provider_confirmation, 1);
assert.equal(acceptedRun.failed, 0);
assert.equal(acceptedRun.ok, true);
assert.equal(acceptedAttempts, 1);

const emptyStore = createMemoryCaseStore();
const emptyRetry = createOrderConfirmationDeliveryRetryService({ caseStore: emptyStore, deliveryService });
const empty = await emptyRetry.run({ limit: 0 });
assert.equal(empty.checked, 0);
assert.equal(empty.ok, true);
assert.equal(empty.limit, 1, 'runtime batch limit must clamp to at least one');

const auditFailureStore = createMemoryCaseStore();
await auditFailureStore.save(caseWithConfirmation({
  id: 'case-audit-failure',
  updated_at: '2026-08-22T05:40:00.000Z',
  confirmation_id: 'confirmation-audit-failure'
}));
const auditFailureRetry = createOrderConfirmationDeliveryRetryService({
  caseStore: auditFailureStore,
  deliveryService: { async deliverPrepared() { return { delivered: true, accepted: true, pending_provider_confirmation: false, idempotent: false, medium: 'email' }; } },
  audit: { async record() { throw new Error('audit database unavailable'); } }
});
const auditFailure = await auditFailureRetry.run();
assert.equal(auditFailure.delivered, 1, 'provider-confirmed delivery must stay successful if audit write fails afterwards');
assert.equal(auditFailure.failed, 0, 'audit failure must never be reclassified as delivery failure');
assert.equal(auditFailure.audit_failures, 1);
assert.equal(auditFailure.ok, false, 'operations must still see audit degradation as a non-green job result');

console.log('OK durable receipt retry is bounded, oldest-first, provider-acceptance-aware, failure-isolated, audit-isolated and privacy-safe');
