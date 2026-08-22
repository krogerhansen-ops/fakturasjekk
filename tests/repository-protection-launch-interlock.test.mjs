import fs from 'node:fs';
import assert from 'node:assert/strict';
import { evaluateRepositoryProtectionGate } from '../server/repository-protection-gate.mjs';
import { createCustomerProductionApp } from '../server/launchable-production-app.mjs';

const gate = JSON.parse(fs.readFileSync(new URL('../config/repository-protection-gate.json', import.meta.url), 'utf8'));
const evaluated = evaluateRepositoryProtectionGate(gate);
assert.equal(evaluated.valid, true);
assert.equal(evaluated.launch_allowed, false);
assert.equal(evaluated.blocking, true);
assert.equal(evaluated.blocking_id, 'TECH_REPOSITORY_PROTECTION');

const fundedEnv = {
  FAKTURASJEKK_COST_MODE: 'funded',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved'
};
const completedOrdinaryGate = {
  checks: [{ id: 'SYNTHETIC_COMPLETE', required: true, status: 'complete', evidence: 'synthetic test evidence' }]
};

assert.throws(
  () => createCustomerProductionApp({ env: fundedEnv, launchGate: completedOrdinaryGate, repositoryProtectionGate: gate }),
  /TECH_REPOSITORY_PROTECTION/,
  'customer production must remain blocked even when funding and the ordinary launch gate are green'
);

const fakeComplete = { ...gate, status: 'complete', evidence: 'Live GitHub read-back confirms all required main-branch rules are actively enforced.' };
assert.equal(evaluateRepositoryProtectionGate(fakeComplete).launch_allowed, true);

const invalidSelfAttestation = { ...gate, status: 'complete', evidence: '' };
assert.equal(evaluateRepositoryProtectionGate(invalidSelfAttestation).valid, false);
assert.equal(evaluateRepositoryProtectionGate(invalidSelfAttestation).launch_allowed, false);

console.log('OK repository protection is an independent fail-closed customer production launch interlock');
