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

const chronologyOnly = analyzeInkasso({
  stage: 'payment_request',
  payment_deadline_days: 14,
  claim_disputed: true,
  dispute_documentation_provided: true,
  collection_after_documented_dispute: true
});
assert.equal(chronologyOnly.status, 'review');
assert.equal(chronologyOnly.findings.some(f => f.code === 'DISPUTED_CLAIM_ORDINARY_COLLECTION'), false);
assert.ok(chronologyOnly.questions.some(q => /hvordan innsigelsen ble vurdert/i.test(q)));

const doubtUnknown = analyzeInkasso({
  stage: 'payment_request',
  payment_deadline_days: 14,
  claim_doubt_known: true
});
assert.equal(doubtUnknown.status, 'review');
assert.equal(doubtUnknown.findings.some(f => f.code === 'CLAIM_DOUBT_NOT_ASSESSED'), false);
assert.ok(doubtUnknown.questions.some(q => /må det avklares om denne tvilen ble vurdert/i.test(q)));

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

const datedNoticeFee = analyzeInkasso({
  stage: 'collection_notice',
  payment_deadline_days: 14,
  collection_notice_fee: 39,
  notice_sent_date: '2026-08-01'
});
assert.equal(datedNoticeFee.status, 'attention');
assert.ok(datedNoticeFee.findings.some(f => f.code === 'COLLECTION_NOTICE_FEE_ABOVE_DATE_CAP'));
assert.ok(datedNoticeFee.rule_ids.includes('INK_17_COLLECTION_COSTS'));
assert.equal(datedNoticeFee.rate_checks.checks[0].max_amount_nok, 38);

const undatedNoticeFee = analyzeInkasso({
  stage: 'collection_notice',
  payment_deadline_days: 14,
  collection_notice_fee: 39
});
assert.equal(undatedNoticeFee.status, 'review');
assert.equal(undatedNoticeFee.findings.some(f => f.code === 'COLLECTION_NOTICE_FEE_ABOVE_DATE_CAP'), false);
assert.ok(undatedNoticeFee.questions.some(q => /Hvilken dato/i.test(q)));

const h1InterestMismatch = analyzeInkasso({
  stage: 'collection_notice',
  payment_deadline_days: 14,
  stated_delay_interest_rate_percent: 12.25,
  interest_rate_date: '2026-06-30',
  interest_basis: 'statutory_delay_interest'
});
assert.equal(h1InterestMismatch.status, 'attention');
assert.ok(h1InterestMismatch.findings.some(f => f.code === 'STATED_DELAY_INTEREST_ABOVE_DATE_RATE'));

const h2InterestCorrect = analyzeInkasso({
  stage: 'collection_notice',
  payment_deadline_days: 14,
  stated_delay_interest_rate_percent: 12.25,
  interest_rate_date: '2026-07-01',
  interest_basis: 'statutory_delay_interest'
});
assert.equal(h2InterestCorrect.status, 'ok');
assert.equal(h2InterestCorrect.findings.some(f => f.code === 'STATED_DELAY_INTEREST_ABOVE_DATE_RATE'), false);

console.log('OK: inkasso engine fails closed on chronology, unknown doubt assessment, dates, fees and interest.');
