import assert from 'node:assert/strict';
import { buildCollectionContext, collectionContextPublicSummary } from '../engine/collection-context.mjs';

const ignoredClientInjection = buildCollectionContext({
  facts: {},
  origins: {},
  documents: [{ id: 'notice-1', role: 'collection_notice' }],
  user_collection: {
    stage: 'payment_request',
    notice_sent_date: '2026-08-01',
    collection_notice_fee: 999,
    collection_mode: 'own_collection',
    stated_delay_interest_rate_percent: 99
  }
});
assert.equal(ignoredClientInjection.stage, 'collection_notice');
assert.equal('notice_sent_date' in ignoredClientInjection, false);
assert.equal('collection_notice_fee' in ignoredClientInjection, false);
assert.equal('collection_mode' in ignoredClientInjection, false);
assert.equal('stated_delay_interest_rate_percent' in ignoredClientInjection, false);

const sourceBacked = buildCollectionContext({
  facts: {
    collection_document_sent_date: '2026-08-01',
    collection_payment_deadline_date: '2026-08-15',
    collection_notice_fee: 39,
    stated_delay_interest_rate_percent: 12.25,
    interest_rate_date: '2026-08-01',
    interest_basis: 'statutory_delay_interest'
  },
  origins: {
    collection_document_sent_date: { type: 'documented', source_id: 'notice-1' },
    collection_payment_deadline_date: { type: 'documented', source_id: 'notice-1' },
    collection_notice_fee: { type: 'documented', source_id: 'notice-1' },
    stated_delay_interest_rate_percent: { type: 'documented', source_id: 'notice-1' },
    interest_rate_date: { type: 'documented', source_id: 'notice-1' },
    interest_basis: { type: 'documented', source_id: 'notice-1' }
  },
  documents: [{ id: 'notice-1', role: 'collection_notice' }]
});
assert.equal(sourceBacked.stage, 'collection_notice');
assert.equal(sourceBacked.notice_sent_date, '2026-08-01');
assert.equal(sourceBacked.payment_deadline_date, '2026-08-15');
assert.equal(sourceBacked.payment_deadline_days, 14);
assert.equal(sourceBacked.collection_notice_fee, 39);
assert.equal(sourceBacked.interest_basis, 'statutory_delay_interest');

const manualSourceBacked = buildCollectionContext({
  facts: { collection_document_sent_date: '2026-08-02' },
  origins: { collection_document_sent_date: { type: 'user_provided', source_id: 'notice-2' } },
  documents: [{ id: 'notice-2', role: 'collection_notice' }]
});
assert.equal(manualSourceBacked.notice_sent_date, '2026-08-02');

const sourceIdMissing = buildCollectionContext({
  facts: { collection_notice_fee: 39 },
  origins: { collection_notice_fee: { type: 'documented', source_id: null } },
  documents: [{ id: 'notice-3', role: 'collection_notice' }]
});
assert.equal('collection_notice_fee' in sourceIdMissing, false);

const userDisputeOnly = buildCollectionContext({
  facts: {}, origins: {},
  documents: [{ id: 'request-1', role: 'payment_request' }],
  user_collection: { claim_disputed: true, dispute_reasonable: true, ordinary_collection_continues: true }
});
assert.equal(userDisputeOnly.claim_disputed, true);
assert.equal('dispute_reasonable' in userDisputeOnly, false);
assert.equal('ordinary_collection_continues' in userDisputeOnly, false);

const documentedDisputeBeforeRequest = buildCollectionContext({
  facts: {
    claim_dispute_date: '2026-07-25',
    collection_document_sent_date: '2026-08-01'
  },
  origins: {
    claim_dispute_date: { type: 'documented', source_id: 'email-1' },
    collection_document_sent_date: { type: 'documented', source_id: 'request-2' }
  },
  documents: [
    { id: 'email-1', role: 'correspondence' },
    { id: 'request-2', role: 'payment_request' }
  ]
});
assert.equal(documentedDisputeBeforeRequest.claim_disputed, true);
assert.equal(documentedDisputeBeforeRequest.dispute_documentation_provided, true);
assert.equal(documentedDisputeBeforeRequest.ordinary_collection_continues, true);

const noCollectionDocument = buildCollectionContext({
  facts: { collection_notice_fee: 39 },
  origins: { collection_notice_fee: { type: 'documented', source_id: 'invoice-1' } },
  documents: [{ id: 'invoice-1', role: 'invoice' }]
});
assert.equal(noCollectionDocument, null);

const summary = collectionContextPublicSummary(sourceBacked);
assert.equal(summary.source_backed, true);
assert.equal('_fact_origins' in summary, false);
assert.equal('_construction' in summary, false);

console.log('OK collection context is built from document roles and source-backed facts, not raw client legal fields.');
