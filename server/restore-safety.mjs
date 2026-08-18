export function createRestoreSafety({ caseStore, storage, audit = null } = {}) {
  if (!caseStore?.getForSystem || !caseStore?.deleteOwned) {
    throw new Error('Restore safety requires caseStore.getForSystem and caseStore.deleteOwned.');
  }
  if (!storage?.listDeletionTombstones || !storage?.deleteCaseObjects) {
    throw new Error('Restore safety requires deletion tombstone listing and case object deletion.');
  }

  async function reapplyDeletionTombstones() {
    const tombstones = await storage.listDeletionTombstones();
    let reapplied = 0;
    let alreadyAbsent = 0;

    for (const tombstone of tombstones) {
      let restoredCase;
      try {
        restoredCase = await caseStore.getForSystem(tombstone.case_id);
      } catch (error) {
        if (/not found/i.test(String(error?.message ?? ''))) {
          alreadyAbsent += 1;
          continue;
        }
        throw error;
      }

      await storage.deleteCaseObjects({ case_id: tombstone.case_id, owner_id: restoredCase.owner_id });
      await caseStore.deleteOwned(tombstone.case_id, restoredCase.owner_id, { deleted_at: tombstone.deleted_at });
      reapplied += 1;

      if (audit) {
        await audit.record({
          actor_id: null,
          case_id: tombstone.case_id,
          action: 'restore.reapply_deletion',
          outcome: 'success',
          metadata: { status: 'deletion_tombstone_reapplied' }
        });
      }
    }

    return {
      checked: tombstones.length,
      reapplied,
      already_absent: alreadyAbsent,
      safe_to_open_restored_data: true
    };
  }

  return { reapplyDeletionTombstones };
}
