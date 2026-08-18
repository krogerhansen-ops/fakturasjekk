import fs from 'node:fs';
import assert from 'node:assert/strict';
import { evaluateLaunchGate, markLaunchGate } from '../server/launch-gate.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));
const initial = evaluateLaunchGate(config);
assert.equal(initial.valid, true);
assert.equal(initial.launch_allowed, false);
assert.ok(initial.blocking_count > 10);
assert.ok(initial.blocking_ids.includes('COMMERCE_29_NOK_TOTAL_PRICE'));
assert.ok(initial.blocking_ids.includes('LEGAL_DPIA_DECISION'));
assert.ok(initial.blocking_ids.includes('QA_FULL_CI_GREEN'));

let one = markLaunchGate(config, 'COMMERCE_29_NOK_TOTAL_PRICE', { status: 'complete', evidence: 'Product config + checkout integration test' });
const oneResult = evaluateLaunchGate(one);
assert.equal(oneResult.launch_allowed, false);
assert.equal(oneResult.complete, 1);

const invalid = structuredClone(config);
invalid.checks[0].status = 'complete';
invalid.checks[0].evidence = null;
assert.equal(evaluateLaunchGate(invalid).valid, false);

assert.throws(() => markLaunchGate(config, 'DOES_NOT_EXIST', { status: 'complete', evidence: 'x' }), /Unknown launch-gate/);
console.log('OK customer launch gate');
