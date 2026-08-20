import { evaluateZeroCostMode, ZERO_COST_ALLOWED_COMPONENTS } from '../server/zero-cost-mode.mjs';

const result = evaluateZeroCostMode(process.env);

console.log(`Fakturasjekk cost mode: ${result.mode}`);
console.log(`Zero-cost safe: ${result.safe ? 'YES' : 'NO'}`);
console.log(`Paid network calls allowed: ${result.paid_network_calls_allowed ? 'YES' : 'NO'}`);
console.log(`Allowed while waiting for sponsor: ${ZERO_COST_ALLOWED_COMPONENTS.join(', ')}`);

for (const check of result.checks) {
  console.log(`${check.ok ? 'OK' : 'BLOCK'} ${check.name}: ${check.detail}`);
}

if (!result.safe) process.exitCode = 2;
