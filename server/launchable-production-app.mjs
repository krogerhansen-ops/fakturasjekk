import { evaluateLaunchGate } from './launch-gate.mjs';
import { createProductionApp, startProductionApp } from './production-app.mjs';
import { evaluateZeroCostMode } from './zero-cost-mode.mjs';
import { evaluateRepositoryProtectionGate } from './repository-protection-gate.mjs';

export function assertCustomerProductionFunding(env = process.env) {
  const cost = evaluateZeroCostMode(env);
  if (!cost.safe) {
    const failed = cost.checks.filter(check => !check.ok).map(check => check.name).join(', ');
    throw new Error(`Customer production cost guard rejected configuration: ${failed}`);
  }
  if (cost.zero_cost || cost.paid_network_calls_allowed !== true) {
    throw new Error('Customer production launch is blocked while Fakturasjekk is in zero-cost sponsor-wait mode.');
  }
  return cost;
}

export function assertCustomerCommerceDelivery(options = {}) {
  if (!options.checkoutPolicy || typeof options.checkoutPolicy !== 'object' || Array.isArray(options.checkoutPolicy)) {
    throw new Error('Customer production requires a validated checkout policy before 29 NOK payment can be enabled.');
  }
  const deliveryAdapter = options.adapters?.orderConfirmationDeliveryAdapter;
  if (typeof deliveryAdapter?.deliverOrderConfirmation !== 'function') {
    throw new Error('Customer production requires a durable order confirmation delivery adapter.');
  }

  // Email delivery is allowed only when the authenticated account itself resolves
  // the confirmed recipient. A browser-provided email must never become the delivery address.
  if (deliveryAdapter.name === 'brevo') {
    if (typeof deliveryAdapter.verifyWebhook !== 'function') {
      throw new Error('Brevo durable delivery requires authenticated provider delivery webhooks.');
    }
    const hasResolver = typeof options.adapters?.deliveryContactResolver === 'function'
      || typeof options.adapters?.authAdapter?.getVerifiedDeliveryContact === 'function';
    if (!hasResolver) {
      throw new Error('Brevo durable delivery requires a verified account delivery-contact resolver.');
    }
  }
  return true;
}

export function createCustomerProductionApp(options = {}) {
  // Funding/cost approval is intentionally checked before the ordinary launch
  // gate. Even a fully completed launch checklist must not activate customer
  // production while sponsor-wait mode is still enabled.
  assertCustomerProductionFunding(options.env ?? process.env);

  const launch = evaluateLaunchGate(options.launchGate);
  if (!launch.valid) throw new Error(`Launch gate is invalid: ${launch.errors.join('; ')}`);
  if (!launch.launch_allowed) throw new Error(`Customer launch is blocked by ${launch.blocking_count} gate(s): ${launch.blocking_ids.join(', ')}`);

  // Repository governance is an independent production interlock. A green
  // application checklist is insufficient if GitHub still permits direct or
  // destructive changes to main without the required review/status controls.
  const repositoryProtection = evaluateRepositoryProtectionGate(options.repositoryProtectionGate);
  if (!repositoryProtection.valid) {
    throw new Error(`Repository protection gate is invalid: ${repositoryProtection.errors.join('; ')}`);
  }
  if (!repositoryProtection.launch_allowed) {
    throw new Error(`Customer launch is blocked by ${repositoryProtection.blocking_id}.`);
  }

  // Commerce delivery is also independent of the checklist. This prevents a
  // mistakenly completed launch gate from enabling real customer payments
  // without the checkout contract and a provider-confirmed durable receipt path.
  assertCustomerCommerceDelivery(options);

  const app = createProductionApp(options);
  return { ...app, launch, repository_protection: repositoryProtection };
}

export async function startCustomerProductionApp(options = {}) {
  const app = createCustomerProductionApp(options);
  return startProductionApp({ app, port: options.port, host: options.host });
}
