import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/rate-limit-production-verification.yml', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../scripts/verify-rate-limit-management-api-live.mjs', import.meta.url), 'utf8');

assert.match(workflow, /startsWith\(github\.head_ref, 'verify\/rate-limit-live-'\)/);
assert.match(workflow, /EXPECTED_PROJECT_REF:\s*jxmkaxwflouacuboaetg/);
assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(workflow, /SUPABASE_DB_PASSWORD/);
assert.doesNotMatch(workflow, /PGPASSWORD|psql|postgresql-client/);
assert.match(workflow, /No production Management API query was attempted/);
assert.match(workflow, /Run 12 concurrent synthetic Management API increments/);
assert.match(workflow, /node scripts\/verify-rate-limit-management-api-live\.mjs/);
assert.match(workflow, /actions\/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8/);
assert.equal(/\n\s*push:/.test(workflow), false, 'live verifier must not run on push');
assert.equal(/\n\s*schedule:/.test(workflow), false, 'live verifier must not run on a schedule');

assert.match(verifier, /https:\/\/api\.supabase\.com/);
assert.match(verifier, /\/v1\/projects\/\$\{EXPECTED_PROJECT_REF\}\/database\/query/);
assert.match(verifier, /Promise\.all\(Array\.from\(\{ length: CONCURRENT_CALLS \}/);
assert.match(verifier, /const CONCURRENT_CALLS = 12/);
assert.match(verifier, /customer_data_used: false/);
assert.match(verifier, /finally \{/);
assert.match(verifier, /delete from public\.rate_limit_windows where key/);
assert.match(verifier, /select count\(\*\)::int as remaining/);
assert.match(verifier, /fakturasjekk:launch:concurrency:/);
assert.doesNotMatch(verifier, /service_role|SUPABASE_SECRET_KEY|SUPABASE_DB_PASSWORD/);

console.log('OK live rate-limit workflow uses the project-locked Supabase Management API, 12-way concurrency and verified synthetic cleanup');
