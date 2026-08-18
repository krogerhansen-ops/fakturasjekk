import assert from 'node:assert/strict';
import { evaluateRuleSafety, runtimeSafeRegistry } from '../engine/rule-safety.mjs';

const registry = { rules: [
  { id: 'fresh', status: 'active', source_url: 'https://lovdata.no/lov/test', last_verified: '2026-08-18' },
  { id: 'stale', status: 'active', source_url: 'https://lovdata.no/lov/test2', last_verified: '2026-06-01' },
  { id: 'wrong-source', status: 'active', source_url: 'https://example.com/law', last_verified: '2026-08-18' },
  { id: 'manual', status: 'review_required', source_url: 'https://lovdata.no/lov/test3', last_verified: '2026-08-18' }
] };
const safety = evaluateRuleSafety(registry, { now: new Date('2026-08-18T15:00:00Z'), max_age_days: 30 });
assert.equal(safety.usable, false);
assert.deepEqual(safety.blocked_ids.sort(), ['stale','wrong-source']);
const safeRegistry = runtimeSafeRegistry(registry, { now: new Date('2026-08-18T15:00:00Z'), max_age_days: 30 });
assert.equal(safeRegistry.rules.find(r => r.id === 'fresh').status, 'active');
assert.equal(safeRegistry.rules.find(r => r.id === 'stale').status, 'review_required');
assert.equal(safeRegistry.rules.find(r => r.id === 'wrong-source').status, 'review_required');
assert.equal(safeRegistry.rules.find(r => r.id === 'manual').status, 'review_required');
assert.equal(safeRegistry.runtime_safety.blocked_count, 2);

console.log('OK runtime rule freshness');
