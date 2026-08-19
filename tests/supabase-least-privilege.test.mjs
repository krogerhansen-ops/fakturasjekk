import fs from 'node:fs';
import assert from 'node:assert/strict';

const boundary = fs.readFileSync(
  new URL('../supabase/migrations/20260818234500_service_role_boundary.sql', import.meta.url),
  'utf8'
).toLowerCase();
const atomic = fs.readFileSync(
  new URL('../supabase/migrations/20260818235500_atomic_server_rpcs.sql', import.meta.url),
  'utf8'
).toLowerCase();

assert.match(boundary, /revoke all on tables from anon, authenticated, service_role/);
assert.match(boundary, /revoke all on table[\s\S]+from service_role/);
assert.match(boundary, /grant select, insert, update, delete on table[\s\S]+to service_role/);
assert.match(boundary, /revoke all on all sequences in schema public from service_role/);
assert.match(boundary, /grant usage, select, update on all sequences in schema public to service_role/);

assert.equal(atomic.includes('drop table'), false, 'pre-launch schema realignment must not destroy the prior table');
assert.match(atomic, /rename to rate_limit_windows_prelaunch_legacy/);
assert.match(atomic, /revoke all on table public\.rate_limit_windows_prelaunch_legacy from public, anon, authenticated, service_role/);
assert.match(atomic, /security invoker/g);
assert.match(atomic, /revoke all on function public\.fakturasjekk_increment_rate_limit_window[\s\S]+from public, anon, authenticated/);
assert.match(atomic, /grant execute on function public\.fakturasjekk_increment_rate_limit_window[\s\S]+to service_role/);
assert.match(atomic, /grant execute on function public\.fakturasjekk_claim_payment_event[\s\S]+to service_role/);

console.log('OK Supabase migrations enforce non-destructive, server-only least privilege');
