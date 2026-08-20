import assert from 'node:assert/strict';
import { mapServiceError, apiErrorResponse } from '../server/api-errors.mjs';

for (const [code, expectedStatus] of [
  ['checkout_consent_required', 409],
  ['durable_confirmation_required', 409],
  ['durable_delivery_not_confirmed', 503],
  ['invalid_durable_medium', 500]
]) {
  const error = new Error('internal message that must not be exposed');
  error.code = code;
  const mapped = mapServiceError(error);
  assert.equal(mapped.status, expectedStatus);
  assert.equal(mapped.code, code);
  const response = apiErrorResponse(mapped, 'req-1');
  assert.equal(response.status, expectedStatus);
  assert.equal(response.body.error.code, code);
  assert.equal(response.body.error.message.includes('internal message'), false);
  assert.equal(response.body.request_id, 'req-1');
}

console.log('OK durable checkout failures map to bounded customer-safe API errors.');
