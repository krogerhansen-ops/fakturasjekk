import assert from 'node:assert/strict';
import { assertOrderConfirmationRetryJobEnabled, createOrderConfirmationRetryJob } from '../server/order-confirmation-retry-job.mjs';
import { PRODUCTION_SUPABASE_TARGET } from '../server/production-config.mjs';

const config = {
  environment: 'production',
  supabase_project_ref: PRODUCTION_SUPABASE_TARGET.project_ref
};
const fundedApproved = {
  FAKTURASJEKK_COST_MODE: 'funded',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved',
  FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_ENABLED: 'approved',
  FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_BATCH_LIMIT: '999'
};

assert.throws(
  () => assertOrderConfirmationRetryJobEnabled({
    env: {
      FAKTURASJEKK_COST_MODE: 'zero',
      FAKTURASJEKK_PAID_SERVICES_APPROVED: 'false',
      FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_ENABLED: 'approved'
    },
    config
  }),
  /zero-cost sponsor-wait mode/i
);
assert.throws(
  () => assertOrderConfirmationRetryJobEnabled({
    env: { ...fundedApproved, FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_ENABLED: 'false' },
    config
  }),
  /explicit runtime approval/i
);
assert.throws(
  () => assertOrderConfirmationRetryJobEnabled({
    env: fundedApproved,
    config: { ...config, supabase_project_ref: 'wrong-project' }
  }),
  /dedicated Fakturasjekk Supabase project/i
);
assert.throws(
  () => assertOrderConfirmationRetryJobEnabled({ env: fundedApproved, config: { ...config, environment: 'development' } }),
  /validated production config/i
);

const guard = assertOrderConfirmationRetryJobEnabled({ env: fundedApproved, config });
assert.equal(guard.enabled, true);
assert.equal(guard.project_ref, PRODUCTION_SUPABASE_TARGET.project_ref);
assert.equal(guard.batch_limit, 100, 'retry batch must remain capped even if runtime asks for more');

const calls = [];
const env = { ...fundedApproved, FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_BATCH_LIMIT: '12' };
const retryService = {
  async run({ limit }) {
    calls.push(limit);
    return {
      ok: false,
      checked: 3,
      delivered: 1,
      already_delivered: 1,
      failed: 1,
      audit_failures: 0,
      has_more_possible: false,
      errors: [{ case_id: 'case-1', confirmation_id: 'confirmation-1', error_code: 'temporary_provider_failure' }],
      secret_provider_payload: 'must-not-be-projected'
    };
  }
};
const job = createOrderConfirmationRetryJob({ retryService, config, env });
const result = await job.run();
assert.deepEqual(calls, [12]);
assert.deepEqual(result, {
  ok: false,
  project_locked: true,
  batch_limit: 12,
  checked: 3,
  delivered: 1,
  already_delivered: 1,
  failed: 1,
  audit_failures: 0,
  has_more_possible: false,
  errors: [{ case_id: 'case-1', confirmation_id: 'confirmation-1', error_code: 'temporary_provider_failure' }]
});
assert.equal(JSON.stringify(result).includes('must-not-be-projected'), false, 'job result must use an explicit safe projection');

// Guard is re-evaluated on every invocation, so operators can stop outbound
// network activity without restarting the process.
env.FAKTURASJEKK_ORDER_CONFIRMATION_RETRY_ENABLED = 'revoked';
await assert.rejects(() => job.run(), /explicit runtime approval/i);
assert.deepEqual(calls, [12], 'revoked runtime approval must block before retry service is invoked again');

console.log('OK receipt retry job is funded-only, project-locked, runtime-revocable, bounded and output-minimized');
