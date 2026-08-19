import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const publicRoots = [path.join(root, 'site')];
const publicFiles = [path.join(root, 'index.html'), path.join(root, '.github', 'workflows', 'pages.yml')];
const texts = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:html|js|mjs|json|css|md|txt|ya?ml)$/i.test(entry.name)) texts.push({ file: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
  }
}
for (const dir of publicRoots) walk(dir);
for (const file of publicFiles) texts.push({ file: path.relative(root, file), text: fs.readFileSync(file, 'utf8') });

const forbiddenPublicMarkers = [
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'private_key_id',
  'client_secret',
  'VIPPS_CLIENT_SECRET',
  'VIPPS_SUBSCRIPTION_KEY',
  'VIPPS_WEBHOOK_SECRET',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL=postgresql://'
];
for (const { file, text } of texts) {
  for (const marker of forbiddenPublicMarkers) {
    assert.equal(text.includes(marker), false, `Public asset/workflow unexpectedly contains server-secret marker ${marker}: ${file}`);
  }
}

const envTemplate = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
assert.match(envTemplate, /GOOGLE_SERVICE_ACCOUNT_JSON=SET_ONLY_IN_SERVER_SECRET_STORE/);
assert.match(envTemplate, /GOOGLE_CLOUD_LOCATION=eu/);
assert.match(envTemplate, /GOOGLE_STRUCTURED_AI_MODEL=gemini-3\.1-flash-lite/);
assert.match(envTemplate, /VIPPS_CLIENT_SECRET=SET_ONLY_IN_SERVER_SECRET_STORE/);
assert.equal(envTemplate.includes('"private_key"'), false, 'Environment template must never embed service-account JSON material.');

const target = JSON.parse(fs.readFileSync(path.join(root, 'config', 'google-cloud-target.json'), 'utf8'));
assert.equal(target.project_scope, 'fakturasjekk_only');
assert.equal(target.project_id, null, 'Do not invent or reuse a Google project id before the separate Fakturasjekk project exists.');
assert.equal(target.location, 'eu');
assert.equal(target.customer_data_live_enabled, false);
assert.ok(target.auth_preference.includes('workload_identity_federation'));
assert.ok(target.auth_preference.includes('service_account_key_fallback'));
assert.equal(JSON.stringify(target).includes('Karriere'), false);

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.match(gitignore, /^\.env$/m);
assert.match(gitignore, /^\.env\.\*$/m);
assert.match(gitignore, /^!\.env\.example$/m);

console.log('OK Google/Vipps/Supabase server credentials are excluded from the public Pages boundary and Google Cloud target is Fakturasjekk-only');
