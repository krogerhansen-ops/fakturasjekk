import assert from 'node:assert/strict';
import { sanitizeCollectionContext } from '../server/case-handlers.mjs';

assert.equal(sanitizeCollectionContext(null), null);
assert.equal(sanitizeCollectionContext('bad'), null);
assert.equal(sanitizeCollectionContext([]), null);
assert.equal(sanitizeCollectionContext({}), null);
assert.equal(sanitizeCollectionContext({ claim_disputed: false }), null);

const sanitized = sanitizeCollectionContext({
  claim_disputed: true,
  stage: 'payment_request',
  notice_sent_date: '2026-08-01',
  payment_request_fee: 999,
  collection_mode: 'own_collection',
  stated_delay_interest_rate_percent: 99,
  ordinary_collection_continues: true,
  dispute_reasonable: true
});
assert.deepEqual(sanitized, { claim_disputed: true });

console.log('OK API boundary strips client-supplied legal collection fields and only allows dispute context.');
