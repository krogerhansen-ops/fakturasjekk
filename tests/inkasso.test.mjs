import assert from 'node:assert/strict';
import { analyzeInkasso } from '../engine/inkasso.mjs';

const shortNotice = analyzeInkasso({
  stage: 'collection_notice',
  payment_deadline_days: 7
});
assert.equal(shortNotice.status, 'attention');
assert.ok(shortNotice.findings.some(f => f.code === 'INKASSO_NOTICE_SHORT_DEADLINE'));
assert.ok(shortNotice.rule_ids.includes('INK_9_NOTICE'));

const disputed = analyzeInkasso({
  stage: 'payment_request',
  payment_deadline_days: 14,
  claim_disputed: true,
  dispute_documentation_provided: true,
  dispute_reasonable: true,
  ordinary_collection_continues: true,
  collection_costs: 1200,
  claim_doubt_known: true,
  doubt_assessed_before_request: false
});
assert.equal(disputed.status, 'attention');
assert.ok(disputed.findings.some(f => f.code === 'DISPUTED_CLAIM_ORDINARY_COLLECTION'));
assert.ok(disputed.findings.some(f => f.code === 'COLLECTION_COSTS_WITH_REASONABLE_DISPUTE'));
assert.ok(disputed.findings.some(f => f.code === 'CLAIM_DOUBT_NOT_ASSESSED'));
assert.ok(disputed.rule_ids.includes('INK_8_GOOD_PRACTICE'));
assert.ok(disputed.rule_ids.includes('INK_10_PAYMENT_REQUEST'));
assert.ok(disputed.rule_ids.includes('INK_17_COLLECTION_COSTS'));
assert.equal(disputed.principal_claim_effect, 'separate_from_collection_compliance');

const normalInvoice = analyzeInkasso({ stage: 'invoice' });
assert.equal(normalInvoice.status, 'not_applicable');
assert.equal(normalInvoice.findings.length, 0);

const pressure = analyzeInkasso({
  stage: 'payment_request',
  payment_deadline_days: 14,
  unreasonable_pressure: true
});
assert.equal(pressure.status, 'attention');
assert.ok(pressure.findings.some(f => f.code === 'POSSIBLE_BAD_COLLECTION_PRACTICE'));

console.log('OK: inkasso engine separates principal claim from collection compliance and flags deadlines, disputes, costs and pressure.');
