import fs from 'node:fs';
import assert from 'node:assert/strict';

const fetchRuntime = fs.readFileSync(new URL('../server/fetch-runtime.mjs', import.meta.url), 'utf8');
const authAdapter = fs.readFileSync(new URL('../server/supabase-auth-adapter.mjs', import.meta.url), 'utf8');
const serverGrantMigration = fs.readFileSync(new URL('../supabase/migrations/20260818234500_service_role_boundary.sql', import.meta.url), 'utf8').toLowerCase();
const liveVerify = fs.readFileSync(new URL('../scripts/verify-supabase-live.sql', import.meta.url), 'utf8').toLowerCase();
const deployScript = fs.readFileSync(new URL('../scripts/deploy-supabase-preflight.sh', import.meta.url), 'utf8');

assert.match(fetchRuntime, /createFetchHandler/);
assert.match(fetchRuntime, /matchRoute/);
assert.match(fetchRuntime, /authenticateRequest/);
assert.match(fetchRuntime, /securityHeaders/);
assert.match(fetchRuntime, /raw_body/);
assert.match(fetchRuntime, /access-control-allow-origin/);

assert.match(authAdapter, /\/auth\/v1\/user/);
assert.match(authAdapter, /apikey/);
assert.match(authAdapter, /authorization/);
assert.match(authAdapter, /return \{ id: user\.id \}/);
assert.equal(authAdapter.includes('user_metadata'), false, 'user-editable metadata must not drive authorization');
assert.equal(authAdapter.includes('SUPABASE_SECRET_KEY'), false);

for (const marker of [
  'alter default privileges for role postgres in schema public',
  'revoke select, insert, update, delete on tables from anon, authenticated, service_role',
  'grant select, insert, update, delete on table',
  'to service_role',
  'from anon, authenticated'
]) {
  assert.ok(serverGrantMigration.includes(marker), `missing server-role boundary marker: ${marker}`);
}

for (const table of ['cases','documents','analyses','payments','drafts','supplier_responses','followups','audit_log','rate_limit_windows']) {
  assert.ok(liveVerify.includes(`'${table}'`), `live verification must cover ${table}`);
}
assert.match(liveVerify, /relrowsecurity/);
assert.match(liveVerify, /has_table_privilege\('anon'/);
assert.match(liveVerify, /has_table_privilege\('authenticated'/);
assert.match(liveVerify, /has_table_privilege\('service_role'/);
assert.match(liveVerify, /case-documents-private/);
assert.match(liveVerify, /storage\.objects/);

assert.match(deployScript, /EXPECTED_REF='jxmkaxwflouacuboaetg'/);
assert.match(deployScript, /fakturasjekk-preflight/);
assert.match(deployScript, /--use-api/);
assert.match(deployScript, /Refusing deploy/);
assert.equal(deployScript.includes('SUPABASE_SECRET_KEY='), false);

console.log('OK Supabase Edge runtime preserves app security and server-only Data API boundary');
