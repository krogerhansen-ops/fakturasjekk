import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260819200000_customer_ownership_integrity.sql', import.meta.url), 'utf8');

assert.match(migration, /unique\s*\(id,\s*owner_id\)/i);
for (const table of ['case_events','documents','analyses','payments','drafts','supplier_responses','followups']) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table}[\\s\\S]*foreign key \\(case_id, owner_id\\) references public\\.cases\\(id, owner_id\\)`, 'i'),
    `${table} must be constrained to its case owner`
  );
}
assert.match(migration, /payments_case_owner_fkey[\s\S]*on delete restrict/i);
for (const table of ['case_events','documents','analyses','drafts','supplier_responses','followups']) {
  assert.match(migration, new RegExp(`${table}_case_owner_fkey[\\s\\S]*on delete cascade`, 'i'));
}
assert.match(migration, /fakturasjekk_reject_case_owner_change/i);
assert.match(migration, /new\.owner_id is distinct from old\.owner_id/i);
assert.match(migration, /before update of owner_id on public\.cases/i);
assert.match(migration, /security invoker/i);
assert.match(migration, /revoke all on function public\.fakturasjekk_reject_case_owner_change\(\) from public, anon, authenticated/i);
assert.equal(/grant\s+.+authenticated/i.test(migration), false);
assert.equal(/grant\s+.+anon/i.test(migration), false);
assert.equal(/disable row level security/i.test(migration), false);

console.log('OK database ownership migration makes case owner immutable and child ownership case-bound without widening browser access.');
