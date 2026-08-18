import fs from 'node:fs';
import assert from 'node:assert/strict';

const canonical = fs.readFileSync(new URL('../server/db/migrations/0002_rate_limit_windows.sql', import.meta.url), 'utf8').toLowerCase();
const supabase = fs.readFileSync(new URL('../supabase/migrations/20260818235500_atomic_server_rpcs.sql', import.meta.url), 'utf8').toLowerCase();
const postgresAdapter = fs.readFileSync(new URL('../server/postgres-rate-limit.mjs', import.meta.url), 'utf8').toLowerCase();

for (const column of ['key text primary key', 'count integer', 'reset_at timestamptz', 'updated_at timestamptz']) {
  assert.ok(canonical.includes(column), `canonical rate-limit schema missing ${column}`);
  assert.ok(supabase.includes(column), `Supabase rate-limit schema missing ${column}`);
}
assert.match(postgresAdapter, /insert into rate_limit_windows \(key, count, reset_at, updated_at\)/);
assert.equal(supabase.includes('window_start_ms'), false, 'old incompatible Supabase rate-limit schema must not survive');
assert.match(supabase, /fakturasjekk_increment_rate_limit_window/);
assert.match(supabase, /fakturasjekk_claim_payment_event/);
assert.match(supabase, /security invoker/);
assert.match(supabase, /revoke all on function public\.fakturasjekk_increment_rate_limit_window[\s\S]*from public, anon, authenticated/);
assert.match(supabase, /grant execute on function public\.fakturasjekk_increment_rate_limit_window[\s\S]*to service_role/);
assert.match(supabase, /grant execute on function public\.fakturasjekk_claim_payment_event[\s\S]*to service_role/);

console.log('OK canonical and Supabase rate-limit schemas/RPC access remain aligned');
