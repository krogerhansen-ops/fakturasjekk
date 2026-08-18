import fs from 'node:fs';
import assert from 'node:assert/strict';

const preflight = fs.readFileSync(new URL('../supabase/functions/fakturasjekk-preflight/index.ts', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

assert.match(preflight, /jxmkaxwflouacuboaetg/);
assert.match(preflight, /customer_upload_enabled:\s*false/);
assert.match(preflight, /production_api_enabled:\s*false/);
assert.match(preflight, /wrong_supabase_project/);
assert.match(preflight, /SUPABASE_URL/);
assert.match(preflight, /cache-control.*no-store/i);
assert.equal(preflight.includes('SUPABASE_SECRET_KEY'), false);
assert.equal(preflight.includes('service_role'), false);
assert.equal(preflight.includes('DATABASE_URL'), false);
assert.equal(preflight.includes('document'), false, 'preflight must not process customer documents');

assert.match(config, /\[functions\.fakturasjekk-preflight\]/);
assert.match(config, /verify_jwt\s*=\s*false/);
assert.equal(config.includes('[functions.fakturasjekk-api]'), false, 'real customer API must not be enabled prematurely');

console.log('OK Supabase Edge preflight is project-bound and cannot enable customer processing');
