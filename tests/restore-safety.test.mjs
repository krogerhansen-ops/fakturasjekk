import assert from 'node:assert/strict';
import { createMemoryCaseStore, createMemoryStorage, createMemoryAudit } from '../server/reference-adapters.mjs';
import { createAuditLogger } from '../server/audit.mjs';
import { createRestoreSafety } from '../server/restore-safety.mjs';

const caseStore = createMemoryCaseStore();
const storage = createMemoryStorage();
const auditAdapter = createMemoryAudit();
const audit = createAuditLogger({ adapter: auditAdapter, clock: () => new Date('2026-08-19T00:00:00Z') });

// Simulate a deletion tombstone that survived outside a database backup.
await storage.recordDeletionTombstone({ case_id: 'case-restored', deleted_at: '2026-08-18T16:00:00.000Z' });

// Simulate restoring an older database backup in which the deleted case is active again.
await caseStore.save({
  id: 'case-restored',
  owner_id: 'u1',
  state: 'analysis_ready',
  retention_mode: 'saved_case',
  documents: [{ id: 'doc-sensitive', original_name: 'faktura.pdf' }],
  analyses: [{ summary: 'sensitive analysis' }],
  created_at: '2026-08-18T12:00:00.000Z',
  updated_at: '2026-08-18T14:00:00.000Z',
  deleted_at: null
});
await storage.reservePrivateObject({ case_id: 'case-restored', owner_id: 'u1', document_id: 'doc-sensitive', name: 'faktura.pdf', mime_type: 'application/pdf' });

const restoreSafety = createRestoreSafety({ caseStore, storage, audit });
const result = await restoreSafety.reapplyDeletionTombstones();
assert.deepEqual(result, {
  checked: 1,
  reapplied: 1,
  already_absent: 0,
  safe_to_open_restored_data: true
});
await assert.rejects(() => caseStore.getForSystem('case-restored'), /not found/i);
const audits = await auditAdapter.list();
assert.equal(audits.at(-1).action, 'restore.reapply_deletion');

// A second pass is idempotent and treats the already-deleted case as absent.
const second = await restoreSafety.reapplyDeletionTombstones();
assert.equal(second.checked, 1);
assert.equal(second.reapplied, 0);
assert.equal(second.already_absent, 1);
assert.equal(second.safe_to_open_restored_data, true);

console.log('OK restore safety re-applies deletion tombstones before restored data is exposed');
