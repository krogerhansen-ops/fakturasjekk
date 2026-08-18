import fs from 'node:fs';
import assert from 'node:assert/strict';
import { paymentRequirement, validatePaymentConfirmation, shouldUnlockFullResult, PRICE_NOK, PRICE_MINOR } from '../engine/payment-gate.mjs';

const product = JSON.parse(fs.readFileSync(new URL('../config/product.json', import.meta.url), 'utf8'));
assert.equal(PRICE_NOK, 29);
assert.equal(PRICE_MINOR, 2900);

const requirement = paymentRequirement({ case_id: 'case-1', product });
assert.equal(requirement.amount_nok, 29);
assert.equal(requirement.amount_minor, 2900);
assert.equal(requirement.currency, 'NOK');
assert.ok(requirement.description.includes('innsigelse'));

const valid = validatePaymentConfirmation({
  case_id: 'case-1',
  amount_minor: 2900,
  currency: 'NOK',
  status: 'paid',
  provider: 'test-provider',
  provider_reference: 'pay-123',
  verified_server_side: true,
  paid_at: '2026-08-18T13:00:00.000Z'
}, requirement);
assert.equal(valid.valid, true);
assert.equal(valid.payment_record.amount_nok, 29);
assert.equal(shouldUnlockFullResult({ payment_validation: valid, product }), true);

const wrongAmount = validatePaymentConfirmation({
  case_id: 'case-1', amount_minor: 2800, currency: 'NOK', status: 'paid', provider_reference: 'pay-x', verified_server_side: true
}, requirement);
assert.equal(wrongAmount.valid, false);
assert.equal(shouldUnlockFullResult({ payment_validation: wrongAmount, product }), false);

const browserOnly = validatePaymentConfirmation({
  case_id: 'case-1', amount_minor: 2900, currency: 'NOK', status: 'paid', provider_reference: 'pay-y', verified_server_side: false
}, requirement);
assert.equal(browserOnly.valid, false);
assert.ok(browserOnly.errors.some(e => e.includes('server-side')));

const wrongCase = validatePaymentConfirmation({
  case_id: 'case-2', amount_minor: 2900, currency: 'NOK', status: 'paid', provider_reference: 'pay-z', verified_server_side: true
}, requirement);
assert.equal(wrongCase.valid, false);

assert.throws(() => paymentRequirement({ case_id: 'case-1', product: { ...product, price_nok: 0, full_check_free: true } }), /price mismatch/i);

console.log('OK: full result unlocks only after server-verified payment of exactly 29 NOK for the correct case.');
