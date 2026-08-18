import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const target = JSON.parse(fs.readFileSync(new URL('../config/supabase-target.json', import.meta.url), 'utf8'));
const product = JSON.parse(fs.readFileSync(new URL('../config/product.json', import.meta.url), 'utf8'));
const migration = fs.readFileSync(new URL('../supabase/migrations/20260818231500_fakturasjekk_core.sql', import.meta.url), 'utf8').toLowerCase();
const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

assert.equal(target.organization_name, 'Fakturasjekk');
assert.equal(target.project_name, 'fakturasjekk-prod');
assert.equal(target.region, 'eu-north-1');
assert.equal(target.dedicated_organization_required, true);
assert.equal(target.dedicated_project_required, true);
assert.equal(target.shared_with_other_products, false);
assert.equal(target.browser_direct_table_access, false);
assert.equal(target.private_storage_bucket, 'case-documents-private');
assert.equal(product.production_upload_enabled, false, 'real uploads must stay disabled until the dedicated production project is verified');

for (const table of ['cases','case_events','documents','analyses','payments','payment_event_claims','drafts','supplier_responses','followups','idempotency_keys','audit_log','rate_limit_windows']) {
  assert.ok(migration.includes(`alter table public.${table} enable row level security`), `RLS missing for ${table}`);
}
assert.ok(migration.includes('revoke all on table public.cases'));
assert.ok(migration.includes('from anon, authenticated'));
assert.ok(migration.includes("'case-documents-private'"));
assert.ok(migration.includes('false,\n  15728640'), 'storage bucket must remain private with 15 MiB limit');
assert.equal(/create policy[\s\S]+storage\.objects/i.test(migration), false, 'V1 must not add direct browser Storage policies');

assert.ok(envExample.includes('YOUR_FAKTURASJEKK_PROJECT_REF'));
assert.ok(envExample.includes('SUPABASE_SECRET_KEY=SET_ONLY_IN_SERVER_SECRET_STORE'));

function textFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...textFiles(p));
    else if (/\.(html|mjs|js|css|json)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const publicSite = path.resolve('site');
for (const file of textFiles(publicSite)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const forbidden of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'DATABASE_URL=postgres']) {
    assert.equal(text.includes(forbidden), false, `public site leaks server-only Supabase material: ${forbidden} in ${file}`);
  }
}

console.log('OK dedicated Supabase isolation, deny-by-default RLS and public secret boundary');
