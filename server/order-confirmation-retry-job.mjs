import { evaluateZeroCostMode } from './zero-cost-mode.mjs';
import { PRODUCTION_SUPABASE_TARGET } from './production-config.mjs';

function parseBatchLimit(value, fallback = 25) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export function assertOrderConfirmationRetryJobEnabled({ env = process.env, config } = {}) {
  const cost = evaluateZeroCostMode(env);
  if (!cost.safe) {
    const failed = cost.checks.filter(check => !check.ok).map(check => check.name).join(', ');
    throw new Error(`Order confirmation retry cost guard rejected configuration: ${failed}`);
  }
  if (cost.zero_cost || cost.paid_network_calls_allowed !== true) {
    throw new Error('Order confirmation retry is blocked while Fakturasjekk is in zero-cost sponsor-wait mode.');
  }
  if (env?.FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_ENABLED !== 'approved') {
    throw new Error('Order confirmation retry requires explicit runtime approval.');
  }
  if (config?.environment !== 'production') {
    throw new Error('Order confirmation retry requires validated production config.');
  }
  if (config?.supabase_project_ref !== PRODUCTION_SUPABASE_TARGET.project_ref) {
    throw new Error('Order confirmation retry is locked to the dedicated Fakturasjekk Supabase project.');
  }
  return {
    enabled: true,
    project_ref: PRODUCTION_SUPABASE_TARGET.project_ref,
    batch_limit: parseBatchLimit(env?.FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_BATCH_LIMIT)
  };
}

export function createOrderConfirmationRetryJob({ retryService, config, env = process.env } = {}) {
  if (typeof retryService?.run !== 'function') {
    throw new Error('Order confirmation retry job requires retryService.run.');
  }

  async function run() {
    // Evaluate every invocation rather than only at startup. Operations can stop
    // outbound retry immediately by removing approval or returning to zero-cost.
    const guard = assertOrderConfirmationRetryJobEnabled({ env, config });
    const result = await retryService.run({ limit: guard.batch_limit });
    return {
      ok: result?.ok === true,
      project_locked: true,
      batch_limit: guard.batch_limit,
      checked: Number(result?.checked ?? 0),
      delivered: Number(result?.delivered ?? 0),
      already_delivered: Number(result?.already_delivered ?? 0),
      failed: Number(result?.failed ?? 0),
      audit_failures: Number(result?.audit_failures ?? 0),
      has_more_possible: result?.has_more_possible === true,
      errors: Array.isArray(result?.errors) ? result.errors : []
    };
  }

  return { run };
}
