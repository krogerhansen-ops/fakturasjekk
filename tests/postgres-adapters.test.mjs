import assert from 'node:assert/strict';
import { createPostgresCaseStore, createPostgresIdempotencyStore, createPostgresPaymentEventStore, createPostgresAuditAdapter } from '../server/postgres-adapters.mjs';

const now = '2026-08-18T14:00:00.000Z';
const caseRow = {
  id: 'case-1', owner_id: 'u1', state: 'draft', retention_mode: 'temporary',
  snapshot: {
    id: 'case-1', owner_id: 'u1', state: 'draft', retention_mode: 'temporary',
    intake_request: { subject: 'Privat fakturatvist', buyer_type: 'consumer' },
    documents: [{ id: 'doc-sensitive', original_name: 'faktura.pdf' }],
    analyses: [{ result: 'sensitive analysis' }],
    payments: []
  },
  created_at: now, updated_at: now, deleted_at: null
};
let deleted = false;
const purgedTables = [];
const claims = new Map();
const idem = new Map();
const audit = [];
const db = {
  async query(sql, params = []) {
    if (sql.includes('FROM cases WHERE id=$1 AND owner_id=$2')) {
      if (params[0] !== 'case-1' || params[1] !== 'u1' || deleted) return { rows: [] };
      return { rows: [caseRow] };
    }
    if (sql.startsWith('DELETE FROM ')) {
      const table = sql.split(/\s+/)[2];
      purgedTables.push(table);
      assert.deepEqual(params, ['case-1', 'u1']);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("state='deleted'") && sql.includes('buyer_type=NULL') && sql.includes('snapshot=$4::jsonb')) {
      deleted = true;
      const snapshot = JSON.parse(params[3]);
      return { rows: [{ ...caseRow, state: 'deleted', snapshot, updated_at: params[2], deleted_at: params[2] }] };
    }
    if (sql.includes('INSERT INTO payment_event_claims')) {
      const key = `${params[0]}:${params[1]}`;
      if (claims.has(key)) return { rows: [] };
      claims.set(key, params[2]);
      return { rows: [{ case_id: params[2] }] };
    }
    if (sql.includes('SELECT case_id FROM payment_event_claims')) {
      const key = `${params[0]}:${params[1]}`;
      return { rows: claims.has(key) ? [{ case_id: claims.get(key) }] : [] };
    }
    if (sql.includes('SELECT state, response, expires_at')) {
      const value = idem.get(params[0]);
      return { rows: value ? [value] : [] };
    }
    if (sql.includes('INSERT INTO idempotency_keys')) {
      idem.set(params[0], { owner_id: params[1], operation: params[2], state: params[3], response: params[4] ? JSON.parse(params[4]) : null, expires_at: params[5] });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO audit_log')) {
      audit.push({ actor_id: params[0], case_id: params[1], action: params[2], outcome: params[3], metadata: JSON.parse(params[4]), at: params[5] });
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  }
};

const caseStore = createPostgresCaseStore({ db });
const { deleteOwned } = caseStore;
const owned = await caseStore.getOwned('case-1', 'u1');
assert.equal(owned.id, 'case-1');
await assert.rejects(() => caseStore.getOwned('case-1', 'u2'), /not found|owned/i);
const tombstone = await deleteOwned('case-1', 'u1', { deleted_at: '2026-08-18T15:00:00.000Z' });
assert.equal(tombstone.state, 'deleted');
assert.equal(tombstone.deleted_at, '2026-08-18T15:00:00.000Z');
assert.deepEqual(purgedTables, ['followups', 'supplier_responses', 'drafts', 'analyses', 'documents', 'case_events']);
assert.equal('documents' in tombstone, false);
assert.equal('analyses' in tombstone, false);
assert.equal('intake_request' in tombstone, false);
assert.equal(JSON.stringify(tombstone).includes('Privat fakturatvist'), false);
assert.equal(JSON.stringify(tombstone).includes('faktura.pdf'), false);
assert.equal(JSON.stringify(tombstone).includes('sensitive analysis'), false);

const eventStore = createPostgresPaymentEventStore({ db });
assert.equal((await eventStore.claim({ provider: 'p', provider_reference: 'ref-1', case_id: 'case-a' })).status, 'new');
assert.equal((await eventStore.claim({ provider: 'p', provider_reference: 'ref-1', case_id: 'case-a' })).status, 'duplicate_same_case');
const conflict = await eventStore.claim({ provider: 'p', provider_reference: 'ref-1', case_id: 'case-b' });
assert.equal(conflict.status, 'conflict');
assert.equal(conflict.existing_case_id, 'case-a');

const idemStore = createPostgresIdempotencyStore({ db });
await idemStore.put('u1:op:key', { owner_id: 'u1', operation: 'op', state: 'completed', response: { ok: true }, expires_at: '2026-08-19T00:00:00.000Z' });
const idemRead = await idemStore.get('u1:op:key');
assert.equal(idemRead.state, 'completed');
assert.deepEqual(idemRead.response, { ok: true });

const auditAdapter = createPostgresAuditAdapter({ db });
await auditAdapter.write({ actor_id: 'u1', case_id: 'case-1', action: 'case.test', outcome: 'success', metadata: { status: 'ok' }, at: now });
assert.equal(audit.length, 1);
assert.equal(audit[0].metadata.status, 'ok');

console.log('OK PostgreSQL adapters purge personal case content on delete');
