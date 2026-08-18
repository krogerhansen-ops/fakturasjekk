export function createCaseManagement({ caseStore, storage, audit = null, clock = () => new Date() } = {}) {
  if (!caseStore?.listOwned || !caseStore?.deleteOwned) throw new Error('Case store requires listOwned and deleteOwned.');
  if (!storage?.deleteCaseObjects || !storage?.recordDeletionTombstone) throw new Error('Storage adapter requires deleteCaseObjects and recordDeletionTombstone.');

  async function listCases({ owner_id }) {
    const items = await caseStore.listOwned(owner_id);
    return items.map(item => ({
      id: item.id,
      state: item.state,
      retention_mode: item.retention_mode,
      created_at: item.created_at,
      updated_at: item.updated_at,
      analysis_count: item.analyses?.length ?? 0,
      document_count: item.documents?.length ?? 0,
      payment_status: item.payments?.some(p => p.status === 'paid' && p.verified_server_side) ? 'paid' : 'unpaid'
    }));
  }

  async function deleteCase({ case_id, owner_id, reason = 'user_request' }) {
    await caseStore.getOwned(case_id, owner_id);
    const deletedAt = clock().toISOString();

    // Persist the user's deletion intent outside the database snapshot first. If a later step fails,
    // restore-safety can still re-apply the deletion before restored data is exposed.
    await storage.recordDeletionTombstone({ case_id, deleted_at: deletedAt });
    const deletedObjectCount = await storage.deleteCaseObjects({ case_id, owner_id });
    const tombstone = await caseStore.deleteOwned(case_id, owner_id, { deleted_at: deletedAt });

    if (audit) {
      await audit.record({
        actor_id: owner_id,
        case_id,
        action: 'case.delete',
        outcome: 'success',
        metadata: { status: reason, deleted_object_count: deletedObjectCount }
      });
    }
    return {
      case_id,
      deleted_at: deletedAt,
      deleted_object_count: deletedObjectCount,
      deletion_tombstone_recorded: true,
      state: tombstone.state
    };
  }

  return { listCases, deleteCase };
}
