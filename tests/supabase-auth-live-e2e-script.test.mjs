import assert from 'node:assert/strict';
import { runSupabaseAuthLiveE2E, selectAuthE2EKeys, AUTH_E2E_PROJECT_REF, AUTH_E2E_ORIGIN } from '../scripts/verify-supabase-auth-live.mjs';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const CLIENT_KEY = 'sb_publishable_synthetic_test_key';
const ADMIN_KEY = 'eyJ.synthetic.service-role.test';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

assert.deepEqual(
  selectAuthE2EKeys([
    { type: 'legacy', name: 'anon', api_key: 'eyJ.anon', disabled: false },
    { type: 'publishable', name: 'default', api_key: CLIENT_KEY, disabled: false },
    { type: 'legacy', name: 'service_role', api_key: ADMIN_KEY, disabled: false }
  ]),
  { clientKey: CLIENT_KEY, adminKey: ADMIN_KEY },
  'new publishable key must be preferred for user-session calls while legacy service_role is isolated to admin cleanup/setup'
);
assert.throws(
  () => selectAuthE2EKeys([{ type: 'publishable', api_key: CLIENT_KEY }]),
  /legacy service_role/i,
  'live verifier must fail closed instead of guessing new secret-key admin semantics'
);

const calls = [];
const fetchImpl = async (url, options = {}) => {
  const method = options.method ?? 'GET';
  calls.push({ url: String(url), method, headers: { ...(options.headers ?? {}) }, body: options.body ?? null });

  if (String(url) === `https://api.supabase.com/v1/projects/${AUTH_E2E_PROJECT_REF}/api-keys?reveal=true`) {
    assert.equal(options.headers.authorization, 'Bearer management-token');
    return jsonResponse([
      { type: 'legacy', name: 'service_role', api_key: ADMIN_KEY, disabled: false },
      { type: 'publishable', name: 'default', api_key: CLIENT_KEY, disabled: false }
    ]);
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/admin/users` && method === 'POST') {
    assert.equal(options.headers.apikey, ADMIN_KEY);
    assert.equal(options.headers.authorization, `Bearer ${ADMIN_KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(body.email_confirm, true);
    assert.equal(body.app_metadata.fakturasjekk_synthetic_auth_e2e, true);
    assert.match(body.email, /^fakturasjekk-auth-e2e-/);
    assert.equal(body.email.endsWith('@example.invalid'), true);
    assert.equal(body.password.length >= 24, true);
    return jsonResponse({ id: USER_ID });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/token?grant_type=password`) {
    assert.equal(options.headers.apikey, CLIENT_KEY);
    return jsonResponse({ access_token: 'initial-access-token', refresh_token: 'refresh-token', user: { id: USER_ID } });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/user` && options.headers.authorization === 'Bearer initial-access-token') {
    assert.equal(options.headers.apikey, CLIENT_KEY);
    return jsonResponse({ id: USER_ID, role: 'authenticated', is_anonymous: false, email: 'must-not-be-projected@example.invalid' });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/token?grant_type=refresh_token`) {
    assert.equal(options.headers.apikey, CLIENT_KEY);
    assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-token' });
    return jsonResponse({ access_token: 'refreshed-access-token', refresh_token: 'rotated-refresh-token', user: { id: USER_ID } });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/user` && options.headers.authorization === 'Bearer refreshed-access-token') {
    return jsonResponse({ id: USER_ID, role: 'authenticated', is_anonymous: false });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/logout`) {
    assert.equal(options.headers.authorization, 'Bearer refreshed-access-token');
    return new Response(null, { status: 204 });
  }
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/admin/users/${USER_ID}` && method === 'DELETE') {
    assert.equal(options.headers.apikey, ADMIN_KEY);
    assert.equal(options.headers.authorization, `Bearer ${ADMIN_KEY}`);
    return jsonResponse({});
  }
  throw new Error(`Unexpected synthetic request: ${method} ${url}`);
};

const result = await runSupabaseAuthLiveE2E({
  accessToken: 'management-token',
  projectRef: AUTH_E2E_PROJECT_REF,
  fetchImpl,
  clock: () => new Date('2026-08-22T09:15:00.000Z')
});
assert.deepEqual(result, {
  ok: true,
  project_ref: AUTH_E2E_PROJECT_REF,
  user_created: true,
  password_session_verified: true,
  jwt_adapter_verified: true,
  refresh_verified: true,
  synthetic_only: true
});
assert.equal(calls.at(-1).method, 'DELETE', 'synthetic Auth user must be deleted after successful verification');
assert.equal(JSON.stringify(result).includes('access-token'), false, 'result projection must never expose session tokens');
assert.equal(JSON.stringify(result).includes('example.invalid'), false, 'result projection must never expose synthetic email');

const cleanupCalls = [];
const failingFetch = async (url, options = {}) => {
  const method = options.method ?? 'GET';
  cleanupCalls.push({ url: String(url), method });
  if (String(url).includes('/api-keys?reveal=true')) return jsonResponse([
    { type: 'legacy', name: 'service_role', api_key: ADMIN_KEY },
    { type: 'publishable', name: 'default', api_key: CLIENT_KEY }
  ]);
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/admin/users` && method === 'POST') return jsonResponse({ id: USER_ID });
  if (String(url).includes('grant_type=password')) return jsonResponse({ error: 'synthetic failure' }, 500);
  if (String(url) === `${AUTH_E2E_ORIGIN}/auth/v1/admin/users/${USER_ID}` && method === 'DELETE') return jsonResponse({});
  throw new Error(`Unexpected failure-path request: ${method} ${url}`);
};
await assert.rejects(
  runSupabaseAuthLiveE2E({ accessToken: 'management-token', projectRef: AUTH_E2E_PROJECT_REF, fetchImpl: failingFetch }),
  /HTTP 500/i
);
assert.equal(cleanupCalls.some(call => call.method === 'DELETE' && call.url.endsWith(USER_ID)), true, 'failure after user creation must still delete the synthetic user');

await assert.rejects(
  runSupabaseAuthLiveE2E({ accessToken: 'management-token', projectRef: 'wrong-project', fetchImpl }),
  /dedicated Fakturasjekk production project/i
);

console.log('OK live Supabase Auth E2E script is project-locked, session/refresh-verifying, cleanup-safe and secret-minimized');
