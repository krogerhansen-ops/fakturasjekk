import assert from 'node:assert/strict';
import { createPostgresCaseStore } from '../server/postgres-adapters.mjs';

const calls = [];
const db = {
  async query(sql, params = []) {
    calls.push({ sql, params });
    return {
      rows: [{
        id: 'case-pending-1',
        owner_id: 'owner-1',
        state: 'paid',
        retention_mode: 'temporary',
        snapshot: {
          order_confirmations: [{
            document_type: 'order_confirmation_and_payment_receipt',
            confirmation_id: 'confirmation-1',
            durable_medium_delivered: false
          }]
        },
        created_at: '2026-08-22T05:00:00.000Z',
        updated_at: '2026-08-22T05:10:00.000Z',
        deleted_at: null
      }]
    };
  }
};

const store = createPostgresCaseStore({ db });
const result = await store.listPendingOrderConfirmationDeliveries({ limit: 999 });
assert.equal(result.length, 1);
assert.equal(result[0].id, 'case-pending-1');
assert.equal(result[0].owner_id, 'owner-1');
assert.equal(result[0].order_confirmations[0].confirmation_id, 'confirmation-1');

assert.equal(calls.length, 1);
const query = calls[0];
assert.match(query.sql, /deleted_at IS NULL/i);
assert.match(query.sql, /order_confirmations/i);
assert.match(query.sql, /durable_medium_delivered/i);
assert.match(query.sql, /order_confirmation_and_payment_receipt/i);
assert.match(query.sql, /ORDER BY updated_at ASC/i);
assert.match(query.sql, /LIMIT \$1/i);
assert.deepEqual(query.params, [100], 'system query must cap each retry batch at 100 cases');
assert.equal(/listForRetention/i.test(query.sql), false);

console.log('OK Postgres pending-receipt query is narrow, deleted-case-safe, oldest-first and bounded');
