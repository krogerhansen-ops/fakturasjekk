import assert from 'node:assert/strict';
import { createMemoryCaseStore, createMemoryStorage, createMemoryAudit } from '../server/reference-adapters.mjs';
import { createAuditLogger } from '../server/audit.mjs';
import { createCaseManagement } from '../server/case-management.mjs';

const caseStore = createMemoryCaseStore();
const storage = createMemoryStorage();
const auditAdapter = createMemoryAudit();
const audit = createAuditLogger({ adapter: auditAdapter, clock: () => new Date('2026-08-18T14:30:00Z') });
const management = createCaseManagement({ caseStore, storage, audit, clock: () => new Date('2026-08-18T14:30:00Z') });

await caseStore.save({
  id: 'case-1', owner_id: 'u1', state: 'draft', retention_mode: 'saved_case',
  documents: [{ id: 'doc-1', original_name: 'sensitive.pdf' }],
  analyses: [{ summary: 'sensitive' }], payments: [],
  created_at: '2026-08-18T12:00:00Z', updated_at: '2026-08-18T12:00:00Z', deleted_at: null
});
await caseStore.save({ id: 'case-2', owner_id: 'u2', state: 'draft', retention_mode: 'temporary', documents: [], analyses: [], payments: [], created_at: '2026-08-18T12:00:00Z', updated_at: '2026-08-18T12:00:00Z', deleted_at: null });
const key = await storage.reservePrivateObject({ case_id: 'case-1', owner_id: 'u1', document_id: 'doc-1', name: 'faktura.pdf', mime_type: 'application/pdf' });
assert.ok(key);

const list = await management.listCases({ owner_id: 'u1' });
assert.equal(list.length, 1);
assert.equal(list[0].id, 'case-1');

const deleted = await management.deleteCase({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(deleted.state, 'deleted');
assert.equal(deleted.deleted_object_count, 1);
assert.equal(deleted.deletion_tombstone_recorded, true);
const deletionLedger = await storage.listDeletionTombstones();
assert.deepEqual(deletionLedger, [{ key: 'deletion-ledger/case-1.json', case_id: 'case-1', deleted_at: '2026-08-18T14:30:00.000Z' }]);
await assert.rejects(() => caseStore.getOwned('case-1', 'u1'), /not found|owned/i);
await assert.rejects(() => management.deleteCase({ case_id: 'case-2', owner_id: 'u1' }), /not found|owned/i);
const auditEntries = await auditAdapter.list();
assert.equal(auditEntries.at(-1).action, 'case.delete');

console.log('OK case management records deletion tombstone before purging case content');
