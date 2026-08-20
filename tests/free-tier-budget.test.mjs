import assert from 'node:assert/strict';
import { SUPABASE_FREE_BUDGET, assertFreeTierBudgetSafe, evaluateFreeTierBudget } from '../server/free-tier-budget.mjs';

const current = assertFreeTierBudgetSafe({
  database_bytes: 11_709_587,
  storage_bytes: 0,
  egress_bytes: 0,
  edge_function_invocations: 0,
  monthly_active_users: 0
});
assert.equal(current.status, 'ok');
assert.equal(current.resources.database_bytes.percent < 3, true);
assert.equal(current.resources.storage_bytes.percent, 0);

const warning = evaluateFreeTierBudget({ database_bytes: SUPABASE_FREE_BUDGET.database_bytes * 0.75 });
assert.equal(warning.status, 'warn');
assert.deepEqual(warning.warn_resources, ['database_bytes']);

const stopped = evaluateFreeTierBudget({ storage_bytes: SUPABASE_FREE_BUDGET.storage_bytes * 0.91 });
assert.equal(stopped.safe, false);
assert.equal(stopped.status, 'stop');
assert.throws(() => assertFreeTierBudgetSafe({ storage_bytes: SUPABASE_FREE_BUDGET.storage_bytes * 0.91 }), /Free-tier budget stop/);

assert.throws(() => evaluateFreeTierBudget({ database_bytes: -1 }), /non-negative/);
assert.throws(() => evaluateFreeTierBudget({}, { thresholds: { warn: 0.95, stop: 0.90 } }), /thresholds/);

console.log('free-tier-budget.test.mjs passed');
