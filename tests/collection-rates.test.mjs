import assert from 'node:assert/strict';
import { collectionRateCatalog, delayInterestPeriodsBetween, delayInterestRateOn, inkassoFeeCapsOn } from '../engine/collection-rates.mjs';
import { evaluateCollectionRateClaims } from '../engine/collection-rate-checks.mjs';

const firstDay = inkassoFeeCapsOn('2026-01-01');
assert.equal(firstDay.status, 'verified');
assert.equal(firstDay.inkasso_rate_nok, 750);
assert.equal(firstDay.reminder_fee_nok, 38);
assert.equal(firstDay.collection_notice_fee_nok, 38);
assert.equal(firstDay.own_payment_request_fee_nok, 113);

const lastDay = inkassoFeeCapsOn('2026-12-31');
assert.equal(lastDay.status, 'verified');
assert.equal(inkassoFeeCapsOn('2025-12-31').status, 'unresolved');
assert.equal(inkassoFeeCapsOn('2027-01-01').status, 'unresolved');
assert.equal(inkassoFeeCapsOn('2026-02-30').status, 'unresolved');

const h1 = delayInterestRateOn('2026-06-30');
assert.equal(h1.status, 'verified');
assert.equal(h1.annual_rate_percent, 12.00);
assert.equal(h1.standard_compensation_nok, 460);

const h2 = delayInterestRateOn('2026-07-01');
assert.equal(h2.status, 'verified');
assert.equal(h2.annual_rate_percent, 12.25);
assert.equal(h2.standard_compensation_nok, 430);
assert.equal(delayInterestRateOn('2027-01-01').status, 'unresolved');

const boundary = delayInterestPeriodsBetween('2026-06-30', '2026-07-01');
assert.equal(boundary.status, 'verified');
assert.equal(boundary.periods.length, 2);
assert.deepEqual(boundary.periods.map(p => [p.from, p.to, p.days_inclusive, p.annual_rate_percent]), [
  ['2026-06-30', '2026-06-30', 1, 12.00],
  ['2026-07-01', '2026-07-01', 1, 12.25]
]);

const unknownPeriod = delayInterestPeriodsBetween('2025-12-31', '2026-01-02');
assert.equal(unknownPeriod.status, 'unresolved');
assert.equal(unknownPeriod.unresolved_date, '2025-12-31');

const reminderTooHigh = evaluateCollectionRateClaims({
  stage: 'reminder',
  reminder_fee: 39,
  notice_sent_date: '2026-01-10'
});
assert.equal(reminderTooHigh.status, 'attention');
assert.equal(reminderTooHigh.findings[0].max_amount_nok, 38);
assert.match(reminderTooHigh.findings[0].legal_basis, /inkassoforskriften/i);

const reminderAtCap = evaluateCollectionRateClaims({
  stage: 'reminder',
  reminder_fee: 38,
  notice_sent_date: '2026-12-31'
});
assert.equal(reminderAtCap.status, 'ok');
assert.equal(reminderAtCap.findings.length, 0);

const feeMissingDate = evaluateCollectionRateClaims({
  stage: 'collection_notice',
  collection_notice_fee: 39
});
assert.equal(feeMissingDate.status, 'needs_clarification');
assert.equal(feeMissingDate.findings.length, 0);
assert.ok(feeMissingDate.questions.some(q => /Hvilken dato/i.test(q)));

const ownPaymentRequest = evaluateCollectionRateClaims({
  stage: 'payment_request',
  payment_request_fee: 114,
  collection_mode: 'own_collection',
  notice_sent_date: '2026-08-01'
});
assert.equal(ownPaymentRequest.status, 'attention');
assert.equal(ownPaymentRequest.findings[0].max_amount_nok, 113);

const paymentRequestUnknownSender = evaluateCollectionRateClaims({
  stage: 'payment_request',
  payment_request_fee: 114,
  notice_sent_date: '2026-08-01'
});
assert.equal(paymentRequestUnknownSender.status, 'needs_clarification');
assert.equal(paymentRequestUnknownSender.findings.length, 0);
assert.ok(paymentRequestUnknownSender.questions.some(q => /egeninkasso/i.test(q)));

const h1TooHigh = evaluateCollectionRateClaims({
  stage: 'collection_notice',
  stated_delay_interest_rate_percent: 12.25,
  interest_rate_date: '2026-06-30',
  interest_basis: 'statutory_delay_interest'
});
assert.equal(h1TooHigh.status, 'attention');
assert.equal(h1TooHigh.findings[0].statutory_rate_percent, 12.00);

const h2Correct = evaluateCollectionRateClaims({
  stage: 'collection_notice',
  stated_delay_interest_rate_percent: 12.25,
  interest_rate_date: '2026-07-01',
  interest_basis: 'statutory_delay_interest'
});
assert.equal(h2Correct.status, 'ok');
assert.equal(h2Correct.findings.length, 0);

const interestBasisUnknown = evaluateCollectionRateClaims({
  stage: 'collection_notice',
  stated_delay_interest_rate_percent: 15,
  interest_rate_date: '2026-08-01'
});
assert.equal(interestBasisUnknown.status, 'needs_clarification');
assert.equal(interestBasisUnknown.findings.length, 0);
assert.ok(interestBasisUnknown.questions.some(q => /videreføres en avtalt rente/i.test(q)));

const catalog = collectionRateCatalog();
assert.equal(catalog.inkasso_fee_periods.length, 1);
assert.equal(catalog.delay_interest_periods.length, 2);
assert.ok(catalog.inkasso_fee_periods.every(period => period.verified_at === '2026-08-20'));

console.log('OK collection rates are date-versioned, boundary-tested and fail closed outside verified periods or legal context.');
