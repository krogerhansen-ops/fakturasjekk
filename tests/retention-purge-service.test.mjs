import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createMemoryCaseStore, createMemoryStorage, createMemoryAudit } from '../server/reference-adapters.mjs';
import { createAuditLogger } from '../server/audit.mjs';
import { createRetentionPurgeService } from '../server/retention-purge-service.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/retention-policy.json', import.meta.url), 'utf8'));
assert.ok(policy.backup_requirements.deletion_ledger_ttl_days > policy.backup_requirements.ordinary_rotating_backup_max_days_product_requirement);

const caseStore = createMemoryCaseStore();
const storage = createMemoryStorage();
const auditAdapter = createMemoryAudit();
const audit = createAuditLogger({ adapter: auditAdapter, clock: () => new Date('2026-08-18T13:00:00Z') });

await caseStore.save({
  id: 'source-only', owner_id: 'u1', state: 'analysis_ready', retention_mode: 'temporary',
  created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-18T10:00:00Z', deleted_at: null,
  documents: [{ id: 'doc-1', role: 'invoice', name: 'faktura.pdf', storage_key: 'private/u1/source-only/doc-1', status: 'uploaded' }],
  analyses: [{ id: 'a1', engine_version: 'x', created_at: '2026-08-17T12:00:00Z' }], payments: [], drafts: [], supplier_responses: [], follow_ups: [], events: []
});
await storage.reservePrivateObject({ case_id: 'source-only', owner_id: 'u1', document_id: 'doc-1', name: 'faktura.pdf', mime_type: 'application/pdf' });

await caseStore.save({
  id: 'full-expired', owner_id: 'u1', state: 'analysis_ready', retention_mode: 'temporary',
  created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z', deleted_at: null,
  documents: [{ id: 'doc-2', role: 'invoice', name: 'gammel.pdf', storage_key: 'private/u1/full-expired/doc-2', status: 'uploaded' }],
  analyses: [{ id: 'a2', engine_version: 'x', created_at: '2026-08-01T10:00:00Z' }], payments: [], drafts: [], supplier_responses: [], follow_ups: [], events: []
});
await storage.reservePrivateObject({ case_id: 'full-expired', owner_id: 'u1', document_id: 'doc-2', name: 'gammel.pdf', mime_type: 'application/pdf' });

// Provider token has expired, but the case itself is recent. Cleanup must remove only the orphan reservation
// and must NOT reset updated_at/extend the case retention clock.
await caseStore.save({
  id: 'orphan-upload', owner_id: 'u1', state: 'draft', retention_mode: 'temporary',
  created_at: '2026-08-18T11:00:00Z', updated_at: '2026-08-18T12:30:00Z', deleted_at: null,
  documents: [{
    id: 'doc-3', role: 'invoice', name: 'orphan.pdf', storage_key: 'private/u1/orphan-upload/doc-3',
    status: 'upload_window_expired', upload_expires_at: '2026-08-18T11:10:00Z', provider_upload_expires_at: '2026-08-18T13:00:00Z'
  }],
  analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [], events: []
});
await storage.reservePrivateObject({ case_id: 'orphan-upload', owner_id: 'u1', document_id: 'doc-3', name: 'orphan.pdf', mime_type: 'application/pdf' });

// Simulate an old deletion tombstone that is beyond the 45-day restore safety window.
await storage.recordDeletionTombstone({ case_id: 'very-old-deleted-case', deleted_at: '2026-06-01T00:00:00.000Z' });

const service = createRetentionPurgeService({ caseStore, storage, policy, audit, clock: () => new Date('2026-08-18T13:00:00Z') });
const result = await service.run();
assert.equal(result.ok, true);
assert.equal(result.expired_upload_reservations_purged, 1);
assert.equal(result.source_document_purges, 2);
assert.equal(result.case_content_purges, 1);
assert.equal(result.deletion_tombstones_recorded, 1);
assert.equal(result.expired_deletion_tombstones_purged, 1);
assert.equal(result.deleted_objects, 3);

const sourceOnly = await caseStore.getOwned('source-only', 'u1');
assert.equal(sourceOnly.documents[0].status, 'purged');
assert.equal(sourceOnly.documents[0].storage_key, null);
await assert.rejects(() => caseStore.getOwned('full-expired', 'u1'), /not found|owned/i);

const orphan = await caseStore.getOwned('orphan-upload', 'u1');
assert.equal(orphan.documents.length, 0);
assert.equal(orphan.updated_at, '2026-08-18T12:30:00Z', 'system orphan cleanup must not extend user retention clock');
assert.equal(orphan.events.at(-1).type, 'EXPIRED_UPLOAD_RESERVATIONS_PURGED');

const ledger = await storage.listDeletionTombstones();
assert.deepEqual(ledger.map(item => item.case_id), ['full-expired']);
assert.equal(ledger[0].deleted_at, '2026-08-18T13:00:00.000Z');

const audits = await auditAdapter.list();
assert.ok(audits.some(a => a.action === 'retention.expired_upload_reservations_purged'));
assert.ok(audits.some(a => a.action === 'retention.source_documents_purged'));
assert.ok(audits.some(a => a.action === 'retention.case_content_purged'));
assert.ok(audits.some(a => a.action === 'retention.deletion_tombstones_purged'));
assert.equal(JSON.stringify(audits).includes('orphan.pdf'), false);
assert.equal(JSON.stringify(audits).includes('faktura.pdf'), false);
assert.equal(JSON.stringify(audits).includes('gammel.pdf'), false);

console.log('OK retention purge removes provider-expired orphan uploads without extending case retention');
