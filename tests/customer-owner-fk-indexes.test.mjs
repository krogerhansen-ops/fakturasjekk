import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260819201000_customer_owner_fk_indexes.sql', import.meta.url), 'utf8');

for (const table of ['case_events','documents','analyses','payments','drafts','supplier_responses','followups']) {
  assert.match(
    migration,
    new RegExp(`create index if not exists idx_${table}_case_owner\\s+on public\\.${table}\\(case_id, owner_id\\)`, 'i'),
    `${table} must have an exact covering (case_id, owner_id) index`
  );
}
assert.equal(/drop\s+index/i.test(migration), false, 'prelaunch ownership index migration must not delete existing indexes');
assert.equal(/grant\s+/i.test(migration), false);
assert.equal(/alter\s+table/i.test(migration), false, 'index-only migration must not change ownership constraints');

console.log('OK all seven customer ownership FKs get exact covering indexes without removing existing prelaunch indexes.');
