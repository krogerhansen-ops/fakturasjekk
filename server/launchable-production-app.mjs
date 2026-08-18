import { evaluateLaunchGate } from './launch-gate.mjs';
import { createProductionApp, startProductionApp } from './production-app.mjs';

export function createCustomerProductionApp(options = {}) {
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
