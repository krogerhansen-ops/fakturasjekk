import assert from 'node:assert/strict';
import { assertCustomerCommerceDelivery, createCustomerProductionApp } from '../server/launchable-production-app.mjs';

const deliveryAdapter = { async deliverOrderConfirmation() { return { delivered: true, medium: 'email' }; } };

assert.throws(
  () => assertCustomerCommerceDelivery({ adapters: { orderConfirmationDeliveryAdapter: deliveryAdapter } }),
  /checkout policy/i,
  'customer production must not enable payment without the checkout contract'
);
assert.throws(
  () => assertCustomerCommerceDelivery({ checkoutPolicy: {} }),
  /durable order confirmation delivery adapter/i,
  'customer production must not enable payment without durable delivery'
);
assert.throws(
  () => assertCustomerCommerceDelivery({ checkoutPolicy: {}, adapters: { orderConfirmationDeliveryAdapter: {} } }),
  /durable order confirmation delivery adapter/i,
  'an adapter object without the delivery contract must not pass the interlock'
);
assert.equal(
  assertCustomerCommerceDelivery({ checkoutPolicy: {}, adapters: { orderConfirmationDeliveryAdapter: deliveryAdapter } }),
  true
);

const fundedEnv = {
  FAKTURASJEKK_COST_MODE: 'funded',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved'
};
const launchGate = {
  checks: [{ id: 'synthetic-complete', required: true, status: 'complete', evidence: 'Synthetic complete launch gate used only to prove the independent commerce interlock.' }]
};
const repositoryProtectionGate = {
  required: true,
  repository: 'krogerhansen-ops/fakturasjekk',
  branch: 'main',
  status: 'complete',
  evidence: 'Synthetic GitHub protection evidence for independent commerce-interlock unit coverage.',
  requirements: {
    protected: true,
    pull_request_required: true,
    quality_gate_required: true,
    codeowner_review_required: true,
    force_push_blocked: true,
    branch_deletion_blocked: true
  }
};

assert.throws(
  () => createCustomerProductionApp({ env: fundedEnv, launchGate, repositoryProtectionGate, adapters: {} }),
  /validated checkout policy/i,
  'even funded mode plus completed launch/repository gates cannot bypass checkout requirements'
);
assert.throws(
  () => createCustomerProductionApp({ env: fundedEnv, launchGate, repositoryProtectionGate, checkoutPolicy: {}, adapters: {} }),
  /durable order confirmation delivery adapter/i,
  'even funded mode plus completed launch/repository gates cannot bypass durable receipt delivery'
);

assert.throws(
  () => createCustomerProductionApp({
    env: {
      FAKTURASJEKK_COST_MODE: 'zero',
      FAKTURASJEKK_PAID_SERVICES_APPROVED: 'false'
    },
    launchGate,
    repositoryProtectionGate,
    checkoutPolicy: {},
    adapters: { orderConfirmationDeliveryAdapter: deliveryAdapter }
  }),
  /zero-cost sponsor-wait mode/i,
  'funding interlock must remain the first barrier to customer production'
);

console.log('OK customer production requires funding, checkout contract and provider-confirmed durable receipt delivery');
