import assert from 'node:assert/strict';
import { assertCustomerProductionFunding } from '../server/launchable-production-app.mjs';

const zero = {
  FAKTURASJEKK_COST_MODE: 'zero',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'no',
  CUSTOMER_UPLOAD_ENABLED: 'false',
  PRODUCTION_API_ENABLED: 'false',
  PAYMENT_PROVIDER: 'unset',
  DOCUMENT_EXTRACTOR_PROVIDER: 'manual',
  RESPONSE_INTERPRETER_PROVIDER: 'synthetic',
  VIPPS_ENVIRONMENT: 'test'
};

assert.throws(
  () => assertCustomerProductionFunding(zero),
  /blocked while Fakturasjekk is in zero-cost sponsor-wait mode/
);

assert.throws(
  () => assertCustomerProductionFunding({ ...zero, PAYMENT_PROVIDER: 'vipps' }),
  /cost guard rejected configuration: payment_provider_free/
);

const funded = assertCustomerProductionFunding({
  FAKTURASJEKK_COST_MODE: 'funded',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved'
});
assert.equal(funded.mode, 'funded');
assert.equal(funded.paid_network_calls_allowed, true);

assert.throws(
  () => assertCustomerProductionFunding({
    FAKTURASJEKK_COST_MODE: 'funded',
    FAKTURASJEKK_PAID_SERVICES_APPROVED: 'no'
  }),
  /cost guard rejected configuration: paid_services_approved/
);

console.log('runtime-zero-cost-guard.test.mjs passed');
