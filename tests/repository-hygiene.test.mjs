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

const sensitiveAssignments = /^(SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|GOOGLE_SERVICE_ACCOUNT_JSON|VIPPS_(?:CLIENT_SECRET|SUBSCRIPTION_KEY|WEBHOOK_SECRET)|SUPABASE_DB_PASSWORD)\s*=\s*(.+)$/gm;
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
  ['legal-source-watch.yml', 'pages.yml', 'quality.yml', 'rate-limit-production-verification.yml', 'supabase-production.yml'],
  'Unexpected GitHub Actions workflow added; review explicitly before allowlisting.'
);

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
