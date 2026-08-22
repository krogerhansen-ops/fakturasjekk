import crypto from 'node:crypto';
import { createSupabaseAuthAdapter } from '../server/supabase-auth-adapter.mjs';

export const AUTH_E2E_PROJECT_REF = 'jxmkaxwflouacuboaetg';
export const AUTH_E2E_ORIGIN = `https://${AUTH_E2E_PROJECT_REF}.supabase.co`;

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function apiKeyValue(item) {
  for (const key of ['api_key', 'key', 'value']) {
    if (typeof item?.[key] === 'string' && item[key].trim()) return item[key].trim();
  }
  return null;
}

export function selectAuthE2EKeys(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.keys) ? payload.keys : [];
  const active = items.filter(item => item?.disabled !== true);
  const client = active.find(item => item?.type === 'publishable')
    ?? active.find(item => item?.type === 'legacy' && (item?.name === 'anon' || item?.id === 'anon'));
  const admin = active.find(item => item?.type === 'legacy' && (item?.name === 'service_role' || item?.id === 'service_role'));
  const clientKey = apiKeyValue(client);
  const adminKey = apiKeyValue(admin);
  if (!clientKey || /^sb_secret_/i.test(clientKey)) {
    throw new Error('Live Auth E2E could not resolve a publishable/anon client key.');
  }
  // The raw Auth admin REST contract is deliberately tested with the legacy service_role JWT.
  // It remains supported through 2026 and avoids guessing about secret-key Authorization semantics.
  if (!adminKey || !/^eyJ/i.test(adminKey)) {
    throw new Error('Live Auth E2E requires an enabled legacy service_role key from the project Management API.');
  }
  return { clientKey, adminKey };
}

async function jsonRequest(fetchImpl, url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    const error = new Error('Live Auth E2E network request failed.');
    error.code = 'auth_e2e_network_failed';
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`Live Auth E2E request failed with HTTP ${response.status}.`);
    error.code = 'auth_e2e_http_failed';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function assertUuid(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} is not a valid UUID.`);
  }
  return value;
}

function syntheticCredentials(clock = () => new Date()) {
  const stamp = clock().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const nonce = crypto.randomBytes(8).toString('hex');
  return {
    email: `fakturasjekk-auth-e2e-${stamp}-${nonce}@example.invalid`,
    password: `${crypto.randomBytes(24).toString('base64url')}Aa1!`
  };
}

async function bestEffortSignOut(fetchImpl, { clientKey, accessToken }) {
  if (!accessToken) return false;
  try {
    const response = await fetchImpl(`${AUTH_E2E_ORIGIN}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: clientKey,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      cache: 'no-store'
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteSyntheticUser(fetchImpl, { adminKey, userId }) {
  if (!userId) return true;
  const response = await fetchImpl(`${AUTH_E2E_ORIGIN}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: adminKey,
      authorization: `Bearer ${adminKey}`,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    cache: 'no-store'
  });
  return response.ok;
}

export async function runSupabaseAuthLiveE2E({
  accessToken = process.env.SUPABASE_ACCESS_TOKEN,
  projectRef = process.env.SUPABASE_PROJECT_REF ?? AUTH_E2E_PROJECT_REF,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
} = {}) {
  const managementToken = required(accessToken, 'SUPABASE_ACCESS_TOKEN');
  if (projectRef !== AUTH_E2E_PROJECT_REF) throw new Error('Live Auth E2E is locked to the dedicated Fakturasjekk production project.');
  if (typeof fetchImpl !== 'function') throw new Error('Live Auth E2E requires fetch.');

  const keyPayload = await jsonRequest(fetchImpl, `https://api.supabase.com/v1/projects/${AUTH_E2E_PROJECT_REF}/api-keys?reveal=true`, {
    headers: { authorization: `Bearer ${managementToken}` }
  });
  const { clientKey, adminKey } = selectAuthE2EKeys(keyPayload);
  const credentials = syntheticCredentials(clock);
  let userId = null;
  let latestAccessToken = null;
  let cleanupOk = true;

  try {
    const created = await jsonRequest(fetchImpl, `${AUTH_E2E_ORIGIN}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: adminKey,
        authorization: `Bearer ${adminKey}`,
        'content-type': 'application/json'
      },
      body: {
        email: credentials.email,
        password: credentials.password,
        email_confirm: true,
        app_metadata: { fakturasjekk_synthetic_auth_e2e: true }
      }
    });
    userId = assertUuid(created?.id, 'Created Auth user id');

    const signedIn = await jsonRequest(fetchImpl, `${AUTH_E2E_ORIGIN}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: clientKey, 'content-type': 'application/json' },
      body: { email: credentials.email, password: credentials.password }
    });
    latestAccessToken = required(signedIn?.access_token, 'Auth access token');
    const refreshToken = required(signedIn?.refresh_token, 'Auth refresh token');
    if (assertUuid(signedIn?.user?.id, 'Signed-in Auth user id') !== userId) throw new Error('Auth sign-in returned a different user id.');

    const adapter = createSupabaseAuthAdapter({ supabaseUrl: AUTH_E2E_ORIGIN, publishableKey: clientKey, fetchImpl, timeoutMs: 10000 });
    const verifiedInitial = await adapter.verifyBearer(latestAccessToken);
    if (verifiedInitial?.id !== userId) throw new Error('Canonical Supabase Auth adapter rejected the initial live session.');

    const refreshed = await jsonRequest(fetchImpl, `${AUTH_E2E_ORIGIN}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: clientKey, 'content-type': 'application/json' },
      body: { refresh_token: refreshToken }
    });
    latestAccessToken = required(refreshed?.access_token, 'Refreshed Auth access token');
    if (assertUuid(refreshed?.user?.id, 'Refreshed Auth user id') !== userId) throw new Error('Auth refresh returned a different user id.');
    const verifiedRefresh = await adapter.verifyBearer(latestAccessToken);
    if (verifiedRefresh?.id !== userId) throw new Error('Canonical Supabase Auth adapter rejected the refreshed live session.');

    return {
      ok: true,
      project_ref: AUTH_E2E_PROJECT_REF,
      user_created: true,
      password_session_verified: true,
      jwt_adapter_verified: true,
      refresh_verified: true,
      synthetic_only: true
    };
  } finally {
    await bestEffortSignOut(fetchImpl, { clientKey, accessToken: latestAccessToken });
    if (userId) cleanupOk = await deleteSyntheticUser(fetchImpl, { adminKey, userId });
    if (!cleanupOk) {
      const error = new Error('Live Auth E2E cleanup failed; synthetic Auth user may remain and must be removed before rerun.');
      error.code = 'auth_e2e_cleanup_failed';
      throw error;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupabaseAuthLiveE2E()
    .then(result => console.log(`OK Supabase Auth live E2E: ${JSON.stringify(result)}`))
    .catch(error => {
      console.error(`FAIL Supabase Auth live E2E: ${error?.code ?? 'auth_e2e_failed'}: ${error?.message ?? 'unknown error'}`);
      process.exitCode = 1;
    });
}
