import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/rate-limit-production-verification.yml', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../scripts/verify-rate-limit-management-api-live.mjs', import.meta.url), 'utf8');

assert.match(workflow, /EXPECTED_PROJECT_REF:\s*jxmkaxwflouacuboaetg/);
assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
assert.match(workflow, /startsWith\(github\.head_ref, 'verify\/rate-limit-live-'\)/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /inputs\.confirm_project_ref/);
assert.match(workflow, /Project confirmation does not match dedicated Fakturasjekk production project/);
assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
assert.match(workflow, /persist-credentials:\s*false/);
assert.match(workflow, /node scripts\/verify-rate-limit-management-api-live\.mjs/);
assert.equal(/\n\s*push:/.test(workflow), false, 'Production rate-limit verification must never run on push.');
assert.equal(/\n\s*schedule:/.test(workflow), false, 'Production rate-limit verification must never run on a schedule.');

assert.match(verifier, /const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg'/);
assert.match(verifier, /const MANAGEMENT_ORIGIN = 'https:\/\/api\.supabase\.com'/);
assert.match(verifier, /const CONCURRENT_CALLS = 12/);
assert.match(verifier, /Promise\.all\(Array\.from\(\{ length: CONCURRENT_CALLS \}/);
assert.match(verifier, /fakturasjekk_increment_rate_limit_window/);
assert.match(verifier, /pg_sleep\(\$\{SLEEP_SECONDS\}\)/);
assert.match(verifier, /final_count: CONCURRENT_CALLS/);
assert.match(verifier, /delete from public\.rate_limit_windows where key/);
assert.match(verifier, /select count\(\*\)::int as remaining/);
assert.match(verifier, /fakturasjekk:launch:concurrency:/);
assert.match(verifier, /customer_data_used: false/);
assert.match(verifier, /read_only: false/);
assert.equal(verifier.includes("<<'SQL'"), false, 'Production verification must avoid shell heredoc SQL entirely.');

for (const forbidden of [
  /SUPABASE_DB_PASSWORD/,
  /PGPASSWORD/,
  /PGHOST/,
  /SUPABASE_SERVICE_ROLE/i,
  /service_role/i,
  /create\s+table/i,
  /alter\s+table/i,
  /drop\s+table/i,
  /create\s+function/i,
  /grant\s+/i,
  /revoke\s+/i,
  /customer_upload_enabled\s*[:=]\s*true/i,
  /production_api_enabled\s*[:=]\s*true/i
]) {
  assert.equal(forbidden.test(`${workflow}\n${verifier}`), false, `Forbidden production-verification capability matched: ${forbidden}`);
}

console.log('OK production rate-limit verification is Management-API-bound, 12-way concurrent, synthetic, non-DDL and DB-password-free.');
