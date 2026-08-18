import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createMemoryCaseStore, createMemoryStorage, createMemoryAudit } from '../server/reference-adapters.mjs';
import { createAuditLogger } from '../server/audit.mjs';
import { createRetentionPurgeService } from '../server/retention-purge-service.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/retention-policy.json', import.meta.url), 'utf8'));
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

const service = createRetentionPurgeService({ caseStore, storage, policy, audit, clock: () => new Date('2026-08-18T13:00:00Z') });
const result = await service.run();
assert.equal(result.ok, true);
assert.equal(result.source_document_purges, 2);
assert.equal(result.case_content_purges, 1);
assert.equal(result.deleted_objects, 2);

const sourceOnly = await caseStore.getOwned('source-only', 'u1');
assert.equal(sourceOnly.documents[0].status, 'purged');
assert.equal(sourceOnly.documents[0].storage_key, null);
await assert.rejects(() => caseStore.getOwned('full-expired', 'u1'), /not found|owned/i);

const audits = await auditAdapter.list();
assert.ok(audits.some(a => a.action === 'retention.source_documents_purged'));
assert.ok(audits.some(a => a.action === 'retention.case_content_purged'));
assert.equal(JSON.stringify(audits).includes('faktura.pdf'), false);

console.log('OK retention purge execution');
