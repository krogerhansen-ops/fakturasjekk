import assert from 'node:assert/strict';
import { createSupabaseCaseStore } from '../server/supabase-data-adapters.mjs';
import { runDeleteE2EWithAdapters, runSupabaseDeleteLiveE2E, DELETE_E2E_PROJECT_REF } from '../scripts/verify-supabase-delete-live.mjs';

function eq(value) {
  return typeof value === 'string' && value.startsWith('eq.') ? value.slice(3) : value;
}

function createMemoryRest() {
  const tables = new Map([
    ['cases', []],
    ['documents', []],
    ['analyses', []],
    ['drafts', []],
    ['supplier_responses', []],
    ['followups', []],
    ['case_events', []]
  ]);

  function filterRows(rows, query = {}) {
    return rows.filter(row => {
      if (query.id != null && row.id !== eq(query.id)) return false;
      if (query.case_id != null && row.case_id !== eq(query.case_id)) return false;
      if (query.owner_id != null && row.owner_id !== eq(query.owner_id)) return false;
      if (query.deleted_at === 'is.null' && row.deleted_at != null) return false;
      return true;
    });
  }

  const rest = {
    async request(table, { method = 'GET', query = {}, body = undefined, prefer = null } = {}) {
      if (!tables.has(table)) throw new Error(`Unexpected table ${table}`);
      const rows = tables.get(table);
      if (method === 'GET') return structuredClone(filterRows(rows, query));
      if (method === 'POST') {
        if (table === 'cases') {
          const index = rows.findIndex(row => row.id === body.id);
          const next = structuredClone(body);
          if (index >= 0) rows[index] = next;
          else rows.push(next);
          return prefer?.includes('return=representation') ? [structuredClone(next)] : null;
        }
        const inserted = structuredClone(body);
        if (table === 'case_events' && inserted.id == null) inserted.id = rows.length + 1;
        rows.push(inserted);
        return prefer?.includes('return=representation') ? [structuredClone(inserted)] : null;
      }
      if (method === 'PATCH') {
        const matches = filterRows(rows, query);
        for (const match of matches) Object.assign(match, structuredClone(body));
        return prefer?.includes('return=representation') ? structuredClone(matches) : null;
      }
      if (method === 'DELETE') {
        const doomed = new Set(filterRows(rows, query));
        tables.set(table, rows.filter(row => !doomed.has(row)));
        return null;
      }
      throw new Error(`Unexpected method ${method}`);
    }
  };
  return { rest, tables };
}

function createMemoryProvider() {
  const objects = new Map();
  return {
    objects,
    provider: {
      async createSignedPut() { return { url: 'https://example.invalid/signed', provider_expires_in_seconds: 600 }; },
      async headObject({ key }) {
        const item = objects.get(key);
        return item ? { exists: true, byte_size: Buffer.byteLength(String(item.body)), content_type: item.content_type } : { exists: false };
      },
      async putObject({ key, body, content_type }) { objects.set(key, { body: String(body), content_type }); return { key }; },
      async getObject({ key }) { const item = objects.get(key); return item ? { body: item.body, content_type: item.content_type } : null; },
      async listPrefix({ prefix }) {
        return { items: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
      },
      async deletePrefix({ prefix }) {
        let deleted = 0;
        for (const key of [...objects.keys()]) {
          if (key.startsWith(prefix)) { objects.delete(key); deleted += 1; }
        }
        return { deleted_count: deleted };
      }
    }
  };
}

const { rest, tables } = createMemoryRest();
const caseStore = createSupabaseCaseStore({ rest });
const { provider, objects } = createMemoryProvider();
const ids = {
  case_id: 'synthetic-delete-case-test',
  owner_id: 'synthetic-delete-owner-test',
  document_id: 'synthetic-delete-document-test',
  analysis_id: 'synthetic-delete-analysis-test',
  draft_id: 'synthetic-delete-draft-test'
};
const result = await runDeleteE2EWithAdapters({
  rest,
  caseStore,
  provider,
  ids,
  clock: () => new Date('2026-08-22T09:50:00.000Z')
});
assert.deepEqual(result, {
  ok: true,
  project_ref: DELETE_E2E_PROJECT_REF,
  storage_object_deleted: true,
  deletion_ledger_verified: true,
  child_content_purged: true,
  minimal_db_tombstone_verified: true,
  owner_visibility_removed: true,
  scanner_not_invoked: true,
  synthetic_only: true
});
assert.equal(objects.size, 0, 'verification cleanup must remove both private object and synthetic deletion-ledger object');
for (const [table, rows] of tables.entries()) {
  assert.equal(rows.length, 0, `verification cleanup must hard-remove synthetic ${table} rows after evidence is collected`);
}
assert.equal(JSON.stringify(result).includes('SYNTHETIC_DELETE_'), false, 'result projection must not expose synthetic content markers');
assert.equal(JSON.stringify(result).includes(ids.case_id), false, 'result projection must not expose synthetic case identifiers');

await assert.rejects(
  runSupabaseDeleteLiveE2E({ accessToken: 'management-token', projectRef: 'wrong-project', fetchImpl: async () => { throw new Error('must not reach network'); } }),
  /dedicated Fakturasjekk production project/i
);

console.log('OK deletion live E2E orchestration uses canonical case deletion, purges child/storage content, verifies tombstones and cleans synthetic evidence');
