import assert from 'node:assert/strict';
import { assertPaidNetworkCallAllowed, assertZeroCostSafe, evaluateZeroCostMode } from '../server/zero-cost-mode.mjs';

const safeZero = {
  FAKTURASJEKK_COST_MODE: 'zero',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'no',
  CUSTOMER_UPLOAD_ENABLED: 'false',
  PRODUCTION_API_ENABLED: 'false',
  PAYMENT_PROVIDER: 'unset',
  DOCUMENT_EXTRACTOR_PROVIDER: 'manual',
  RESPONSE_INTERPRETER_PROVIDER: 'synthetic',
  VIPPS_ENVIRONMENT: 'test'
};

const result = assertZeroCostSafe(safeZero);
assert.equal(result.zero_cost, true);
assert.equal(result.safe, true);
assert.equal(result.paid_network_calls_allowed, false);
assert.throws(() => assertPaidNetworkCallAllowed(safeZero, 'Google OCR'), /blocked until Fakturasjekk is explicitly switched to funded mode/);

for (const mutation of [
  { PAYMENT_PROVIDER: 'vipps' },
  { DOCUMENT_EXTRACTOR_PROVIDER: 'google_cloud_vision' },
  { RESPONSE_INTERPRETER_PROVIDER: 'google_vertex_ai' },
  { CUSTOMER_UPLOAD_ENABLED: 'true' },
  { PRODUCTION_API_ENABLED: 'true' },
  { VIPPS_ENVIRONMENT: 'production' },
  { FAKTURASJEKK_PAID_SERVICES_APPROVED: 'yes' }
]) {
  assert.equal(evaluateZeroCostMode({ ...safeZero, ...mutation }).safe, false);
}

const funded = {
  FAKTURASJEKK_COST_MODE: 'funded',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved'
};
assert.equal(evaluateZeroCostMode(funded).paid_network_calls_allowed, true);
assert.equal(assertPaidNetworkCallAllowed(funded, 'paid provider'), true);

assert.throws(() => evaluateZeroCostMode({ FAKTURASJEKK_COST_MODE: 'maybe' }), /must be zero or funded/);

console.log('zero-cost-mode.test.mjs passed');
