import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/supabase-production.yml', import.meta.url), 'utf8');

assert.match(workflow, /workflow_dispatch:/);
assert.equal(/\npush:/.test(workflow), false, 'Supabase production must not auto-deploy on push');
assert.equal(/\npull_request:/.test(workflow), false, 'Supabase production must not deploy from pull requests');
assert.match(workflow, /EXPECTED_PROJECT_REF:\s*jxmkaxwflouacuboaetg/);
assert.match(workflow, /confirm_project_ref/);
assert.match(workflow, /supabase@2\.111\.0/);
assert.equal(workflow.includes('supabase@latest'), false);
assert.match(workflow, /db push --dry-run/);
assert.match(workflow, /inputs\.action == 'deploy'/);
assert.match(workflow, /functions deploy fakturasjekk-preflight/);
assert.equal(workflow.includes('functions deploy fakturasjekk-api'), false, 'customer API must not be deployable by this workflow');
assert.match(workflow, /test ! -d supabase\/functions\/fakturasjekk-api/);
assert.match(workflow, /customer_upload_enabled: false/);
assert.match(workflow, /production_api_enabled: false/);
assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
assert.match(workflow, /secrets\.SUPABASE_DB_PASSWORD/);
assert.equal(workflow.includes('Karriere'), false);
assert.equal(workflow.includes('yymgqqwmcsdadxnwqbkl'), false, 'Karriere project ref must never appear in Fakturasjekk deployment workflow');

console.log('OK Supabase production workflow is manual, pinned, project-locked and preflight-only');
