import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260819201018_cross_reference_owner_integrity.sql', import.meta.url), 'utf8');

for (const unique of [
  ['analyses', 'analyses_id_case_owner_key'],
  ['documents', 'documents_id_case_owner_key'],
  ['supplier_responses', 'supplier_responses_id_case_owner_key']
]) {
  assert.match(migration, new RegExp(`alter table public\\.${unique[0]}[\\s\\S]*${unique[1]} unique \\(id, case_id, owner_id\\)`, 'i'));
}

const relations = [
  {
    table: 'drafts',
    constraint: 'drafts_analysis_case_owner_fkey',
    local: 'analysis_id',
    target: 'analyses',
    index: 'idx_drafts_analysis_case_owner'
  },
  {
    table: 'supplier_responses',
    constraint: 'supplier_responses_document_case_owner_fkey',
    local: 'document_id',
    target: 'documents',
    index: 'idx_supplier_responses_document_case_owner'
  },
  {
    table: 'followups',
    constraint: 'followups_supplier_response_case_owner_fkey',
    local: 'supplier_response_id',
    target: 'supplier_responses',
    index: 'idx_followups_supplier_response_case_owner'
  }
];

for (const relation of relations) {
  assert.match(
    migration,
    new RegExp(`${relation.constraint}[\\s\\S]*foreign key \\(${relation.local}, case_id, owner_id\\)[\\s\\S]*references public\\.${relation.target}\\(id, case_id, owner_id\\)[\\s\\S]*on delete set null \\(${relation.local}\\)`, 'i'),
    `${relation.constraint} must enforce same case+owner while nulling only the optional reference`
  );
  assert.match(
    migration,
    new RegExp(`create index if not exists ${relation.index}[\\s\\S]*on public\\.${relation.table}\\(${relation.local}, case_id, owner_id\\)`, 'i'),
    `${relation.constraint} must have an exact covering index`
  );
}

assert.equal(/grant\s+/i.test(migration), false);
assert.equal(/disable row level security/i.test(migration), false);

console.log('OK optional analysis/document/response references are case+owner-bound and preserve nullable-reference delete semantics.');
