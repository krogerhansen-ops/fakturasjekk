import { purgePlan } from '../engine/retention.mjs';

const DAY = 24 * 60 * 60 * 1000;

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

function deletionLedgerPolicy(policy) {
  const backupDays = Number(policy?.backup_requirements?.ordinary_rotating_backup_max_days_product_requirement);
  const ledgerDays = Number(policy?.backup_requirements?.deletion_ledger_ttl_days);
  if (!Number.isFinite(backupDays) || backupDays <= 0) throw new Error('Retention policy requires a positive backup window.');
  if (!Number.isFinite(ledgerDays) || ledgerDays <= backupDays) {
    throw new Error('Deletion ledger TTL must be longer than the maximum rotating backup window.');
  }
  return { backupDays, ledgerDays };
}

export function createRetentionPurgeService({ caseStore, storage, policy, audit = null, clock = () => new Date() } = {}) {
  if (!caseStore?.listForRetention || !caseStore?.save || !caseStore?.deleteOwned) throw new Error('Case store lacks retention operations.');
  if (!storage?.deleteCaseObjects || !storage?.recordDeletionTombstone || !storage?.purgeDeletionTombstonesBefore) {
    throw new Error('Storage adapter requires case deletion and restore-safety tombstone operations.');
  }
  const { ledgerDays } = deletionLedgerPolicy(policy);

  async function run() {
    const nowDate = clock();
    const now = nowDate.toISOString();
    const candidates = await caseStore.listForRetention();
    const summary = {
      checked: candidates.length,
      source_document_purges: 0,
      case_content_purges: 0,
      deletion_tombstones_recorded: 0,
      expired_deletion_tombstones_purged: 0,
      deleted_objects: 0,
      errors: []
    };

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
          await storage.recordDeletionTombstone({ case_id: current.id, deleted_at: now });
          summary.deletion_tombstones_recorded += 1;
          await caseStore.deleteOwned(current.id, current.owner_id, { deleted_at: now });
          summary.case_content_purges += 1;
          if (audit) await audit.record({ actor_id: null, case_id: current.id, action: 'retention.case_content_purged', metadata: { retention_mode: current.retention_mode, status: 'expired' } });
        }
      } catch (error) {
        summary.errors.push({ case_id: original.id, error: String(error?.message ?? 'unknown') });
      }
    }

    try {
      const cutoff = new Date(nowDate.getTime() - ledgerDays * DAY).toISOString();
      const ledgerPurge = await storage.purgeDeletionTombstonesBefore({ cutoff });
      summary.expired_deletion_tombstones_purged = Number(ledgerPurge?.purged ?? 0);
      if (audit && summary.expired_deletion_tombstones_purged > 0) {
        await audit.record({
          actor_id: null,
          case_id: null,
          action: 'retention.deletion_tombstones_purged',
          metadata: { status: 'expired', deleted_object_count: summary.expired_deletion_tombstones_purged }
        });
      }
    } catch (error) {
      summary.errors.push({ case_id: null, error: `deletion_ledger: ${String(error?.message ?? 'unknown')}` });
    }

    return { ...summary, ok: summary.errors.length === 0, ran_at: now };
  }

  return { run };
}
