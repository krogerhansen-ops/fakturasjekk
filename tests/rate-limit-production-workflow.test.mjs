import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/rate-limit-production-verification.yml', import.meta.url), 'utf8');

assert.match(workflow, /EXPECTED_PROJECT_REF:\s*jxmkaxwflouacuboaetg/);
assert.match(workflow, /PGHOST:\s*db\.jxmkaxwflouacuboaetg\.supabase\.co/);
assert.match(workflow, /PGSSLMODE:\s*require/);
assert.match(workflow, /SUPABASE_DB_PASSWORD/);
assert.match(workflow, /startsWith\(github\.head_ref, 'verify\/rate-limit-live-'\)/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /inputs\.confirm_project_ref/);
assert.match(workflow, /Project confirmation does not match dedicated Fakturasjekk production project/);
assert.match(workflow, /seq 1 12/);
assert.match(workflow, /pg_backend_pid\(\)/);
assert.match(workflow, /unique_pids/);
assert.match(workflow, /test "\$unique_pids" = '12'/);
assert.match(workflow, /test "\$final_count" = '12'/);
assert.match(workflow, /delete from public\.rate_limit_windows/);
assert.match(workflow, /fakturasjekk:launch:concurrency:/);
assert.match(workflow, /sql="with sync as/);
assert.equal(workflow.includes("<<'SQL'"), false, 'Production verification workflow must avoid YAML-breaking shell heredocs.');

for (const forbidden of [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE/i,
  /create\s+table/i,
  /alter\s+table/i,
  /drop\s+table/i,
  /create\s+function/i,
  /grant\s+/i,
  /revoke\s+/i,
  /customer_upload_enabled\s*[:=]\s*true/i,
  /production_api_enabled\s*[:=]\s*true/i
]) {
  assert.equal(forbidden.test(workflow), false, `Forbidden production-verification capability matched: ${forbidden}`);
}

console.log('OK production rate-limit verification workflow is project-bound, synthetic, non-DDL and heredoc-free.');
