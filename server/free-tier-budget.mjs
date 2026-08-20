export const SUPABASE_FREE_BUDGET = Object.freeze({
  database_bytes: 500_000_000,
  storage_bytes: 1_000_000_000,
  egress_bytes: 5_000_000_000,
  edge_function_invocations: 500_000,
  monthly_active_users: 50_000
});

const DEFAULT_THRESHOLDS = Object.freeze({ warn: 0.70, stop: 0.90 });

function finiteNonNegative(value, name) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number.`);
  return number;
}

function ratio(used, limit) {
  return limit > 0 ? used / limit : 1;
}

export function evaluateFreeTierBudget(usage = {}, { limits = SUPABASE_FREE_BUDGET, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const warn = Number(thresholds.warn);
  const stop = Number(thresholds.stop);
  if (!(warn > 0 && warn < stop && stop <= 1)) throw new Error('Free-tier thresholds must satisfy 0 < warn < stop <= 1.');

  const resources = {};
  for (const [name, limitValue] of Object.entries(limits)) {
    const limit = finiteNonNegative(limitValue, `${name} limit`);
    const used = finiteNonNegative(usage[name] ?? 0, `${name} usage`);
    const share = ratio(used, limit);
    const state = share >= stop ? 'stop' : share >= warn ? 'warn' : 'ok';
    resources[name] = {
      used,
      limit,
      ratio: Number(share.toFixed(6)),
      percent: Number((share * 100).toFixed(2)),
      remaining: Math.max(0, limit - used),
      state
    };
  }

  const entries = Object.entries(resources);
  const stopResources = entries.filter(([, item]) => item.state === 'stop').map(([name]) => name);
  const warnResources = entries.filter(([, item]) => item.state === 'warn').map(([name]) => name);

  return {
    safe: stopResources.length === 0,
    status: stopResources.length ? 'stop' : warnResources.length ? 'warn' : 'ok',
    can_expand_internal_testing: stopResources.length === 0,
    stop_resources: stopResources,
    warn_resources: warnResources,
    resources
  };
}

export function assertFreeTierBudgetSafe(usage, options) {
  const result = evaluateFreeTierBudget(usage, options);
  if (!result.safe) throw new Error(`Free-tier budget stop: ${result.stop_resources.join(', ')}`);
  return result;
}
