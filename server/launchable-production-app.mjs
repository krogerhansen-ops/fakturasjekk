import { evaluateLaunchGate } from './launch-gate.mjs';
import { createProductionApp, startProductionApp } from './production-app.mjs';
import { evaluateZeroCostMode } from './zero-cost-mode.mjs';

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

export function createCustomerProductionApp(options = {}) {
  // Funding/cost approval is intentionally checked before the ordinary launch
  // gate. Even a fully completed launch checklist must not activate customer
  // production while sponsor-wait mode is still enabled.
  assertCustomerProductionFunding(options.env ?? process.env);

  const launch = evaluateLaunchGate(options.launchGate);
  if (!launch.valid) throw new Error(`Launch gate is invalid: ${launch.errors.join('; ')}`);
  if (!launch.launch_allowed) throw new Error(`Customer launch is blocked by ${launch.blocking_count} gate(s): ${launch.blocking_ids.join(', ')}`);
  const app = createProductionApp(options);
  return { ...app, launch };
}

export async function startCustomerProductionApp(options = {}) {
  const app = createCustomerProductionApp(options);
  return startProductionApp({ app, port: options.port, host: options.host });
}
