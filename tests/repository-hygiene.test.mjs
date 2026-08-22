import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const textExtensions = new Set(['.mjs', '.js', '.json', '.yml', '.yaml', '.md', '.html', '.txt', '.sql', '.sh', '.toml']);
const skipDirs = new Set(['.git', 'node_modules', '_site']);
const files = [];

function isTextCandidate(entryName) {
  const lower = entryName.toLowerCase();
  return textExtensions.has(path.extname(lower)) || lower === '.env' || lower.startsWith('.env.');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      assert.notEqual(entry.name.toLowerCase(), '.claude', `Unexpected Claude config directory: ${rel}`);
      walk(full);
      continue;
    }
    assert.notEqual(entry.name.toLowerCase(), 'claude.md', `Unexpected Claude instruction file: ${rel}`);
    if (isTextCandidate(entry.name)) files.push({ full, rel });
  }
}
walk(root);

const patterns = [
  ['Anthropic API key', new RegExp(`${['sk','ant'].join('-')}-[A-Za-z0-9_-]{12,}`, 'i')],
  ['GitHub classic token', new RegExp(`${['ghp',''].join('_')}[A-Za-z0-9]{20,}`)],
  ['GitHub fine-grained token', new RegExp(`${['github','pat',''].join('_')}[A-Za-z0-9_]{20,}`)],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9._-]{40,}/],
  ['private key material', new RegExp(['BEGIN', 'PRIVATE', 'KEY'].join(' '), 'i')],
  ['credential-bearing PostgreSQL URL', /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]{8,}@[^\s/]+/i],
  ['Claude web domain', new RegExp(['claude', 'ai'].join('\\.'), 'i')],
  ['Anthropic domain', new RegExp(['anthropic', 'com'].join('\\.'), 'i')]
];

const sensitiveAssignments = /^(SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|GOOGLE_SERVICE_ACCOUNT_JSON|VIPPS_(?:CLIENT_SECRET|SUBSCRIPTION_KEY|WEBHOOK_SECRET)|BREVO_(?:API_KEY|WEBHOOK_SECRET)|SUPABASE_DB_PASSWORD)\s*=\s*(.+)$/gm;
const safeAssignmentPrefixes = ['SET_', '${{', '${', '<', 'REDACTED', 'EXAMPLE', 'TEST_ONLY'];

for (const { full, rel } of files) {
  if (rel === 'tests/repository-hygiene.test.mjs') continue;
  const text = fs.readFileSync(full, 'utf8');
  const markedSecurityFixture = rel.startsWith('tests/') && text.includes('SECURITY_TEST_FIXTURE');

  for (const [name, re] of patterns) {
    const matched = re.test(text);
    const explicitFakeDbFixture = name === 'credential-bearing PostgreSQL URL' && markedSecurityFixture;
    assert.equal(matched && !explicitFakeDbFixture, false, `${name} found in ${rel}`);
  }

  for (const match of text.matchAll(sensitiveAssignments)) {
    const value = String(match[2] ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!value) continue;
    const placeholder = safeAssignmentPrefixes.some(prefix => value.startsWith(prefix));
    assert.equal(placeholder, true, `Possible committed secret in ${rel}: ${match[1]} must use a documented placeholder, never a credential value.`);
  }
}

const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => /\.ya?ml$/i.test(name)).sort();
assert.deepEqual(
  workflows,
  ['backup-restore-synthetic-verification.yml', 'brevo-live-verification.yml', 'google-ai-live-verification.yml', 'legal-source-watch.yml', 'pages.yml', 'quality.yml', 'rate-limit-production-verification.yml', 'supabase-production.yml'],
  'Unexpected GitHub Actions workflow added; review explicitly before allowlisting.'
);

// The synthetic backup/restore workflow is explicitly allowlisted only while it remains local-only,
// manually dispatched and unable to receive production credentials or publish backup artifacts.
const backupWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'backup-restore-synthetic-verification.yml'), 'utf8');
assert.match(backupWorkflow, /workflow_dispatch:/, 'Synthetic backup workflow must remain manually dispatched.');
assert.equal(/\n\s*push:/.test(backupWorkflow), false, 'Synthetic backup workflow must not run on push.');
assert.equal(/\n\s*pull_request:/.test(backupWorkflow), false, 'Synthetic backup workflow must not run on pull requests.');
assert.match(backupWorkflow, /postgres:16-alpine/, 'Synthetic backup workflow must keep an isolated local PostgreSQL service.');
assert.equal(backupWorkflow.includes('secrets.'), false, 'Synthetic backup workflow must not receive repository or production secrets.');
assert.equal(backupWorkflow.includes('actions/upload-artifact'), false, 'Synthetic backup files must never be published as GitHub artifacts.');
assert.match(backupWorkflow, /validate-isolated-restore-target\.mjs/, 'Production restore target guard must remain part of the synthetic round-trip.');
assert.match(backupWorkflow, /db\.jxmkaxwflouacuboaetg\.supabase\.co/, 'Synthetic round-trip must explicitly prove the production project is rejected as a restore target.');

// Brevo verification is allowlisted only while it remains manual, synthetic-only and fail-closed.
// Read-only config verification may operate in zero-cost mode, but an email send requires independent
// funded + paid-services approval and an unmistakably synthetic recipient stored only as a secret.
const brevoWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'brevo-live-verification.yml'), 'utf8');
assert.match(brevoWorkflow, /workflow_dispatch:/, 'Brevo live verification must remain manually dispatched.');
assert.equal(/\n\s*push:/.test(brevoWorkflow), false, 'Brevo live verification must not run on push.');
assert.equal(/\n\s*pull_request:/.test(brevoWorkflow), false, 'Brevo live verification must not run on pull requests.');
assert.equal(/\n\s*schedule:/.test(brevoWorkflow), false, 'Brevo live verification must not be scheduled.');
assert.match(brevoWorkflow, /default:\s*config-only/, 'Brevo verification must default to config-only mode.');
assert.match(brevoWorkflow, /default:\s*zero/, 'Brevo verification cost mode must default to zero.');
assert.match(brevoWorkflow, /I_APPROVE_SYNTHETIC_BREVO_NETWORK_CALLS/, 'Brevo verification requires an exact synthetic network-call phrase.');
assert.match(brevoWorkflow, /confirm_webhook_url/, 'Brevo verification must require reviewed webhook URL confirmation.');
assert.match(brevoWorkflow, /validateBrevoLiveTarget/, 'Brevo verification must validate the version-controlled target before reading provider credentials.');
assert.ok(
  brevoWorkflow.indexOf('validateBrevoLiveTarget') < brevoWorkflow.indexOf('secrets.BREVO_API_KEY'),
  'Brevo target validation must occur before provider credentials are exposed to a step.'
);
assert.match(brevoWorkflow, /secrets\.BREVO_API_KEY/, 'Brevo verification may use only a server-side API-key secret.');
assert.match(brevoWorkflow, /secrets\.BREVO_WEBHOOK_SECRET/, 'Brevo verification must compare the live custom webhook authentication header to a server-side secret.');
assert.match(brevoWorkflow, /secrets\.BREVO_SYNTHETIC_RECIPIENT_EMAIL/, 'Synthetic send recipient must be stored as a secret, never a workflow input.');
assert.match(brevoWorkflow, /inputs\.mode == 'send-acceptance'/, 'Synthetic recipient secret must only be used in explicit send-acceptance mode.');
assert.match(brevoWorkflow, /inputs\.cost_mode.*funded|cost_mode.*funded/s, 'Brevo send mode must require funded cost mode.');
assert.match(brevoWorkflow, /paid_services_approved/, 'Brevo send mode must require explicit paid-services approval.');
assert.equal(brevoWorkflow.includes('SUPABASE_SECRET_KEY'), false, 'Brevo verification must not receive Supabase server credentials.');
assert.equal(brevoWorkflow.includes('GOOGLE_SERVICE_ACCOUNT_JSON'), false, 'Brevo verification must not receive Google credentials.');
assert.equal(brevoWorkflow.includes('VIPPS_'), false, 'Brevo verification must not receive Vipps credentials.');
assert.equal(brevoWorkflow.includes('actions/upload-artifact'), false, 'Brevo verification must not publish provider output as artifacts.');
assert.match(brevoWorkflow, /customer_data_live_enabled/, 'Brevo verification must re-check that customer processing remains disabled.');

// Google provider verification may incur external-service cost. It is allowlisted only while it remains
// manual, synthetic-only, project-confirmed and protected by three independent cost/network confirmations.
const googleWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'google-ai-live-verification.yml'), 'utf8');
assert.match(googleWorkflow, /workflow_dispatch:/, 'Google live verification must remain manually dispatched.');
assert.equal(/\n\s*push:/.test(googleWorkflow), false, 'Google live verification must not run on push.');
assert.equal(/\n\s*pull_request:/.test(googleWorkflow), false, 'Google live verification must not run on pull requests.');
assert.equal(/\n\s*schedule:/.test(googleWorkflow), false, 'Google live verification must not be scheduled.');
assert.match(googleWorkflow, /default:\s*zero/, 'Google verification cost mode must default to zero.');
assert.match(googleWorkflow, /I_APPROVE_SYNTHETIC_GOOGLE_NETWORK_CALLS/, 'Google verification requires an explicit synthetic network-call phrase.');
assert.match(googleWorkflow, /confirm_project_id/, 'Google verification must require reviewed project-id confirmation.');
assert.match(googleWorkflow, /validateGoogleLiveTarget/, 'Google verification must validate the version-controlled target before reading provider credentials.');
assert.match(googleWorkflow, /secrets\.GOOGLE_SERVICE_ACCOUNT_JSON/, 'Google verification may use only the dedicated server-side service-account secret.');
assert.equal(googleWorkflow.includes('SUPABASE_SECRET_KEY'), false, 'Google verification must not receive Supabase server credentials.');
assert.equal(googleWorkflow.includes('VIPPS_'), false, 'Google verification must not receive Vipps credentials.');
assert.equal(googleWorkflow.includes('actions/upload-artifact'), false, 'Google verification must not publish provider output as artifacts.');
assert.match(googleWorkflow, /customer_data_live_enabled/, 'Google verification must re-check that customer processing remains disabled.');

// The production Supabase workflow is intentionally special-cased here because it can mutate infrastructure.
// Keep this defense in depth even though tests/supabase-production-workflow.test.mjs performs deeper checks.
const supabaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'supabase-production.yml'), 'utf8');
assert.match(supabaseWorkflow, /workflow_dispatch:/, 'Supabase production workflow must remain manually dispatched.');
assert.equal(/\n\s*push:/.test(supabaseWorkflow), false, 'Supabase production workflow must not run on push.');
assert.equal(/\n\s*pull_request:/.test(supabaseWorkflow), false, 'Supabase production workflow must not run on pull requests.');
assert.match(supabaseWorkflow, /EXPECTED_PROJECT_REF:\s*jxmkaxwflouacuboaetg/, 'Supabase workflow must remain locked to Fakturasjekk production project.');
assert.equal(supabaseWorkflow.includes('supabase@latest'), false, 'Supabase CLI version must remain pinned/reviewed.');
assert.equal(supabaseWorkflow.includes('functions deploy fakturasjekk-api'), false, 'Real customer API must not be deployable from the preflight workflow.');

console.log(`OK repository hygiene: ${files.length} textfiler kontrollert, provider secrets screened, workflows allowlistet.`);
