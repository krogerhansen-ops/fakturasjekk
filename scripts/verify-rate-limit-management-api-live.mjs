const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg';
const MANAGEMENT_ORIGIN = 'https://api.supabase.com';
const CONCURRENT_CALLS = 12;
const WINDOW_MS = 300000;
const SLEEP_SECONDS = 2;
const MAX_PARALLEL_WALL_MS = 15000;

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function safeSyntheticKey(value) {
  const key = required(value, 'synthetic key');
  if (!/^fakturasjekk:launch:concurrency:[A-Za-z0-9_-]{1,100}$/.test(key)) {
    throw new Error('Synthetic rate-limit key is outside the approved namespace.');
  }
  return key;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

export function validateRateLimitLiveTarget({ projectRef, managementOrigin = MANAGEMENT_ORIGIN } = {}) {
  if (projectRef !== EXPECTED_PROJECT_REF) throw new Error('Rate-limit verifier must target the dedicated Fakturasjekk production project.');
  const origin = new URL(managementOrigin).origin;
  if (origin !== MANAGEMENT_ORIGIN) throw new Error('Rate-limit verifier must use the canonical Supabase Management API origin.');
  return { project_ref: projectRef, management_origin: origin };
}

export function createSupabaseManagementQueryClient({ accessToken, projectRef = EXPECTED_PROJECT_REF, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  validateRateLimitLiveTarget({ projectRef });
  const token = required(accessToken, 'Supabase Management API access token');
  if (typeof fetchImpl !== 'function') throw new Error('Management API verifier requires fetch.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 5000 || timeoutMs > 30000) throw new Error('Management API timeout must be between 5000 and 30000 ms.');
  const url = `${MANAGEMENT_ORIGIN}/v1/projects/${EXPECTED_PROJECT_REF}/database/query`;

  return async function runQuery(query) {
    const sql = required(query, 'SQL query');
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ query: sql, read_only: false }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (cause) {
      const error = new Error('Supabase Management API query request failed.');
      error.cause = cause;
      throw error;
    }
    const raw = await response.text();
    if (response.status !== 201) throw new Error(`Supabase Management API query returned HTTP ${response.status}.`);
    if (!raw) return [];
    try { return JSON.parse(raw); }
    catch { throw new Error('Supabase Management API query returned invalid JSON.'); }
  };
}

export async function verifyLiveRateLimitConcurrency({
  accessToken,
  projectRef = EXPECTED_PROJECT_REF,
  syntheticKey,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  validateRateLimitLiveTarget({ projectRef });
  const key = safeSyntheticKey(syntheticKey);
  const runQuery = createSupabaseManagementQueryClient({ accessToken, projectRef, fetchImpl });
  const quotedKey = sqlLiteral(key);
  let mainError = null;

  try {
    await runQuery(`delete from public.rate_limit_windows where key = ${quotedKey};`);

    const incrementSql = `with sync as (select pg_backend_pid() as pid, clock_timestamp() as started, pg_sleep(${SLEEP_SECONDS})) select sync.pid, extract(epoch from sync.started) as started_epoch, extract(epoch from clock_timestamp()) as finished_epoch, r.count from sync cross join lateral public.fakturasjekk_increment_rate_limit_window(${quotedKey}, ${WINDOW_MS}) r;`;
    const startedAt = now();
    const payloads = await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => runQuery(incrementSql)));
    const elapsedMs = now() - startedAt;

    const rows = payloads.flatMap(rowsFromPayload);
    if (rows.length !== CONCURRENT_CALLS) throw new Error(`Expected ${CONCURRENT_CALLS} Management API increment rows, received ${rows.length}.`);
    const counts = rows.map(row => Number(row?.count)).filter(Number.isInteger).sort((a, b) => a - b);
    if (counts.length !== CONCURRENT_CALLS || counts.at(-1) !== CONCURRENT_CALLS) {
      throw new Error('Concurrent increment responses did not reach the expected atomic count.');
    }
    if (elapsedMs >= MAX_PARALLEL_WALL_MS) {
      throw new Error(`Concurrent Management API requests exceeded the ${MAX_PARALLEL_WALL_MS} ms overlap bound.`);
    }

    const finalPayload = await runQuery(`select count, extract(epoch from reset_at) as reset_epoch from public.rate_limit_windows where key = ${quotedKey};`);
    const finalRows = rowsFromPayload(finalPayload);
    if (finalRows.length !== 1 || Number(finalRows[0]?.count) !== CONCURRENT_CALLS) {
      throw new Error('Production rate-limit row did not finish at exactly 12 increments.');
    }

    return {
      verified: true,
      synthetic_only: true,
      project_ref_verified: true,
      concurrent_requests: CONCURRENT_CALLS,
      final_count: CONCURRENT_CALLS,
      overlap_bound_verified: true,
      customer_data_used: false
    };
  } catch (error) {
    mainError = error;
    throw error;
  } finally {
    try {
      await runQuery(`delete from public.rate_limit_windows where key = ${quotedKey};`);
      const cleanupPayload = await runQuery(`select count(*)::int as remaining from public.rate_limit_windows where key = ${quotedKey};`);
      const cleanupRows = rowsFromPayload(cleanupPayload);
      if (cleanupRows.length !== 1 || Number(cleanupRows[0]?.remaining) !== 0) throw new Error('Synthetic rate-limit cleanup could not be verified.');
    } catch (cleanupError) {
      if (!mainError) throw cleanupError;
    }
  }
}

async function main() {
  const token = required(process.env.SUPABASE_ACCESS_TOKEN, 'SUPABASE_ACCESS_TOKEN');
  const runId = required(process.env.GITHUB_RUN_ID ?? 'local', 'GITHUB_RUN_ID');
  const attempt = required(process.env.GITHUB_RUN_ATTEMPT ?? '1', 'GITHUB_RUN_ATTEMPT');
  const key = safeSyntheticKey(`fakturasjekk:launch:concurrency:${runId}_${attempt}`);
  const result = await verifyLiveRateLimitConcurrency({
    accessToken: token,
    projectRef: process.env.EXPECTED_PROJECT_REF ?? EXPECTED_PROJECT_REF,
    syntheticKey: key
  });
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`Rate-limit live verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export const RATE_LIMIT_LIVE_POLICY = Object.freeze({
  project_ref: EXPECTED_PROJECT_REF,
  management_origin: MANAGEMENT_ORIGIN,
  concurrent_calls: CONCURRENT_CALLS,
  window_ms: WINDOW_MS,
  sleep_seconds: SLEEP_SECONDS,
  max_parallel_wall_ms: MAX_PARALLEL_WALL_MS,
  synthetic_namespace: 'fakturasjekk:launch:concurrency:'
});
