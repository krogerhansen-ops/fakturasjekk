import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createOrderConfirmationDeliveryRetryService } from '../server/order-confirmation-delivery-retry-service.mjs';

function caseWithConfirmation({ id, owner_id = 'owner-1', updated_at, delivered = false, confirmation_id }) {
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
      durable_medium_delivered: delivered
    }]
  };
}

const caseStore = createMemoryCaseStore();
await caseStore.save(caseWithConfirmation({ id: 'case-old', updated_at: '2026-08-22T05:10:00.000Z', confirmation_id: 'confirmation-old' }));
await caseStore.save(caseWithConfirmation({ id: 'case-fail', updated_at: '2026-08-22T05:20:00.000Z', confirmation_id: 'confirmation-fail' }));
await caseStore.save(caseWithConfirmation({ id: 'case-new', updated_at: '2026-08-22T05:30:00.000Z', confirmation_id: 'confirmation-new' }));
await caseStore.save(caseWithConfirmation({ id: 'case-delivered', updated_at: '2026-08-22T05:00:00.000Z', confirmation_id: 'confirmation-done', delivered: true }));

const attempted = [];
const deliveryService = {
  async deliverPrepared(input) {
    attempted.push(structuredClone(input));
    if (input.case_id === 'case-fail') {
      const error = new Error('Customer email address and provider details must never appear in retry output.');
      error.code = 'temporary_provider_failure';
      throw error;
    }
    return { delivered: true, idempotent: false, medium: 'email' };
  }
};
const auditEntries = [];
const audit = { async record(entry) { auditEntries.push(structuredClone(entry)); } };
const retry = createOrderConfirmationDeliveryRetryService({ caseStore, deliveryService, audit, defaultLimit: 2 });

const first = await retry.run();
assert.equal(first.checked, 2);
assert.equal(first.delivered, 1);
assert.equal(first.failed, 1);
assert.equal(first.skipped, 0);
assert.equal(first.ok, false);
assert.equal(first.has_more_possible, true);
assert.deepEqual(attempted.map(item => item.case_id), ['case-old', 'case-fail'], 'oldest pending confirmations must be retried first');
assert.deepEqual(first.errors, [{ case_id: 'case-fail', confirmation_id: 'confirmation-fail', error_code: 'temporary_provider_failure' }]);
assert.equal(JSON.stringify(first).includes('Customer email'), false, 'retry summary must expose safe error codes only');
assert.equal(auditEntries.length, 2);
assert.equal(auditEntries[1].metadata.error_code, 'temporary_provider_failure');

const pending = await caseStore.listPendingOrderConfirmationDeliveries({ limit: 1000 });
assert.equal(pending.length, 3, 'delivered confirmations must not be included and limit must be safely bounded');
assert.equal(pending.some(item => item.id === 'case-delivered'), false);

const emptyStore = createMemoryCaseStore();
const emptyRetry = createOrderConfirmationDeliveryRetryService({ caseStore: emptyStore, deliveryService });
const empty = await emptyRetry.run({ limit: 0 });
assert.equal(empty.checked, 0);
assert.equal(empty.ok, true);
assert.equal(empty.limit, 1, 'runtime batch limit must clamp to at least one');

console.log('OK durable receipt retry is bounded, oldest-first, failure-isolated and privacy-safe');
