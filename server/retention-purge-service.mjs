import { purgePlan } from '../engine/retention.mjs';

function stripSourceDocuments(caseData, at) {
  return {
    ...caseData,
    updated_at: at,
    documents: (caseData.documents ?? []).map(d => ({
      id: d.id,
      role: d.role,
      name: d.name,
      mime_type: d.mime_type,
      byte_size: d.byte_size,
      status: 'purged',
      created_at: d.created_at,
      uploaded_at: d.uploaded_at,
      storage_key: null,
      sha256: null,
      purged_at: at
    })),
    events: [...(caseData.events ?? []), { type: 'SOURCE_DOCUMENTS_PURGED', at, data: {} }]
  };
}

export function createRetentionPurgeService({ caseStore, storage, policy, audit = null, clock = () => new Date() } = {}) {
  if (!caseStore?.listForRetention || !caseStore?.save || !caseStore?.deleteOwned) throw new Error('Case store lacks retention operations.');
  if (!storage?.deleteCaseObjects) throw new Error('Storage adapter requires deleteCaseObjects.');

  async function run() {
    const now = clock().toISOString();
    const candidates = await caseStore.listForRetention();
    const summary = { checked: candidates.length, source_document_purges: 0, case_content_purges: 0, deleted_objects: 0, errors: [] };

    for (const original of candidates) {
      try {
        const plan = purgePlan(original, policy, { now });
        if (!plan.actions.length) continue;

        let current = original;
        const deleteSources = plan.actions.some(a => a.type === 'DELETE_SOURCE_DOCUMENTS');
        const deleteCaseContent = plan.actions.some(a => a.type === 'DELETE_CASE_CONTENT');

        if (deleteSources) {
          const count = await storage.deleteCaseObjects({ case_id: current.id, owner_id: current.owner_id });
          summary.deleted_objects += count;
          summary.source_document_purges += 1;
          current = stripSourceDocuments(current, now);
          await caseStore.save(current);
          if (audit) await audit.record({ actor_id: null, case_id: current.id, action: 'retention.source_documents_purged', metadata: { deleted_object_count: count, retention_mode: current.retention_mode } });
        }

        if (deleteCaseContent) {
          await caseStore.deleteOwned(current.id, current.owner_id, { deleted_at: now });
          summary.case_content_purges += 1;
          if (audit) await audit.record({ actor_id: null, case_id: current.id, action: 'retention.case_content_purged', metadata: { retention_mode: current.retention_mode, status: 'expired' } });
        }
      } catch (error) {
        summary.errors.push({ case_id: original.id, error: String(error?.message ?? 'unknown') });
      }
    }

    return { ...summary, ok: summary.errors.length === 0, ran_at: now };
  }

  return { run };
}
