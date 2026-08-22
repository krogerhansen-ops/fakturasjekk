import assert from 'node:assert/strict';
import {
  RATE_LIMIT_LIVE_POLICY,
  createSupabaseManagementQueryClient,
  validateRateLimitLiveTarget,
  verifyLiveRateLimitConcurrency
} from '../scripts/verify-rate-limit-management-api-live.mjs';

const projectRef = 'jxmkaxwflouacuboaetg';
const syntheticKey = 'fakturasjekk:launch:concurrency:test_1';
let incrementCalls = 0;
let activeIncrements = 0;
let maxActiveIncrements = 0;
let cleanupDeletes = 0;
const requests = [];

const fetchImpl = async (url, options) => {
  requests.push({ url, options });
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.authorization, 'Bearer synthetic-management-token');
  assert.equal(options.headers['content-type'], 'application/json');
  const body = JSON.parse(options.body);
  assert.equal(body.read_only, false);
  const query = body.query;

  if (query.startsWith('delete from public.rate_limit_windows')) {
    cleanupDeletes += 1;
    return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (query.includes('pg_sleep(2)') && query.includes('fakturasjekk_increment_rate_limit_window')) {
    const count = ++incrementCalls;
    activeIncrements += 1;
    maxActiveIncrements = Math.max(maxActiveIncrements, activeIncrements);
    await new Promise(resolve => setTimeout(resolve, 15));
    activeIncrements -= 1;
    return new Response(JSON.stringify([{ pid: 1000 + count, count }]), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (query.startsWith('select count, extract(epoch from reset_at)')) {
    return new Response(JSON.stringify([{ count: 12, reset_epoch: 123456 }]), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (query.startsWith('select count(*)::int as remaining')) {
    return new Response(JSON.stringify([{ remaining: 0 }]), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected test query: ${query}`);
};

let clockCalls = 0;
const now = () => [1000, 3000][clockCalls++] ?? 3000;
const result = await verifyLiveRateLimitConcurrency({
  accessToken: 'synthetic-management-token',
  projectRef,
  syntheticKey,
  fetchImpl,
  now
});
assert.deepEqual(result, {
  verified: true,
  synthetic_only: true,
  project_ref_verified: true,
  concurrent_requests: 12,
  final_count: 12,
  overlap_bound_verified: true,
  customer_data_used: false
});
assert.equal(incrementCalls, 12);
assert.equal(maxActiveIncrements, 12, 'all 12 Management API increment requests must overlap in the verifier');
assert.equal(cleanupDeletes, 2, 'verifier must clean before and after the synthetic test');
assert.equal(requests.every(request => request.url === `https://api.supabase.com/v1/projects/${projectRef}/database/query`), true);
assert.equal(requests.some(request => request.options.body.includes('customer')), false);

assert.deepEqual(validateRateLimitLiveTarget({ projectRef }), {
  project_ref: projectRef,
  management_origin: 'https://api.supabase.com'
});
assert.throws(() => validateRateLimitLiveTarget({ projectRef: 'aaaaaaaaaaaaaaaaaaaa' }), /dedicated Fakturasjekk/i);
assert.throws(() => validateRateLimitLiveTarget({ projectRef, managementOrigin: 'https://example.com' }), /canonical Supabase/i);

let networkCalls = 0;
await assert.rejects(
  () => verifyLiveRateLimitConcurrency({
    accessToken: 'synthetic-management-token',
    projectRef,
    syntheticKey: 'customer-data-key',
    fetchImpl: async () => { networkCalls += 1; return new Response('[]', { status: 201 }); }
  }),
  /approved namespace/i
);
assert.equal(networkCalls, 0, 'invalid synthetic namespace must fail before network');

const badStatusClient = createSupabaseManagementQueryClient({
  accessToken: 'synthetic-management-token',
  projectRef,
  fetchImpl: async () => new Response('{"message":"forbidden"}', { status: 403 })
});
await assert.rejects(() => badStatusClient('select 1;'), /HTTP 403/);

assert.equal(RATE_LIMIT_LIVE_POLICY.concurrent_calls, 12);
assert.equal(RATE_LIMIT_LIVE_POLICY.project_ref, projectRef);
assert.equal(RATE_LIMIT_LIVE_POLICY.synthetic_namespace, 'fakturasjekk:launch:concurrency:');

console.log('OK Management API rate-limit verifier is project-locked, 12-way concurrent, synthetic-only and cleanup-safe');
