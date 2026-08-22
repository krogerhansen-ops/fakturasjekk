function clone(value) { return structuredClone(value); }

function hasPendingOrderConfirmation(caseData) {
  const confirmations = caseData?.order_confirmations ?? [];
  const latest = Array.isArray(confirmations) && confirmations.length ? confirmations.at(-1) : null;
  return latest?.document_type === 'order_confirmation_and_payment_receipt'
    && latest?.durable_medium_delivered !== true
    && latest?.delivery_provider_accepted !== true;
}

export function createMemoryCaseStore() {
  const cases = new Map();
  const counters = new Map();
  return {
    async nextId(kind) {
      const next = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, next);
      return `${kind}-${next}`;
    },
    async save(caseData) {
      cases.set(caseData.id, clone(caseData));
      return clone(caseData);
    },
    async getOwned(caseId, ownerId) {
      const value = cases.get(caseId);
      if (!value || value.owner_id !== ownerId || value.deleted_at) throw new Error('Case not found or not owned by user.');
      return clone(value);
    },
    async getForSystem(caseId) {
      const value = cases.get(caseId);
      if (!value || value.deleted_at) throw new Error('Case not found.');
      return clone(value);
    },
    async listOwned(ownerId) {
      return [...cases.values()].filter(item => item.owner_id === ownerId && !item.deleted_at).map(clone);
    },
    async listForRetention() {
      return [...cases.values()].filter(item => !item.deleted_at).map(clone);
    },
    async listPendingOrderConfirmationDeliveries({ limit = 25 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
      return [...cases.values()]
        .filter(item => !item.deleted_at && hasPendingOrderConfirmation(item))
        .sort((a, b) => String(a.updated_at ?? '').localeCompare(String(b.updated_at ?? '')))
        .slice(0, safeLimit)
        .map(clone);
    },
    async deleteOwned(caseId, ownerId, { deleted_at = new Date().toISOString() } = {}) {
      const value = cases.get(caseId);
      if (!value || value.owner_id !== ownerId || value.deleted_at) throw new Error('Case not found or not owned by user.');
      const deleted = {
        id: value.id,
        owner_id: value.owner_id,
        state: 'deleted',
        retention_mode: value.retention_mode,
        created_at: value.created_at,
        updated_at: deleted_at,
        deleted_at
      };
      cases.set(caseId, clone(deleted));
      return clone(deleted);
    }
  };
}

export function createMemoryStorage() {
  const objects = new Map();
  const deletionLedger = new Map();
  return {
    async reservePrivateObject({ case_id, owner_id, document_id, name, mime_type }) {
      const key = `private/${owner_id}/${case_id}/${document_id}`;
      objects.set(key, { case_id, owner_id, document_id, name, mime_type, uploaded: false });
      return key;
    },
    async markUploaded({ storage_key, owner_id, byte_size = null, sha256 = null }) {
      const item = objects.get(storage_key);
      if (!item || item.owner_id !== owner_id) throw new Error('Storage object not found.');
      objects.set(storage_key, { ...item, uploaded: true, byte_size, sha256 });
    },
    async listCaseDocuments({ case_id, owner_id, records = [] }) {
      return records.map(record => {
        const item = objects.get(record.storage_key);
        if (!item || item.case_id !== case_id || item.owner_id !== owner_id) throw new Error('Storage object not found.');
        return { ...clone(record), ...clone(item) };
      });
    },
    async deleteReservedObject({ case_id, owner_id, storage_key }) {
      const item = objects.get(storage_key);
      if (!item || item.case_id !== case_id || item.owner_id !== owner_id) return 0;
      objects.delete(storage_key);
      return 1;
    },
    async deleteCaseObjects({ case_id, owner_id }) {
      let deleted = 0;
      for (const [key, item] of objects.entries()) {
        if (item.case_id === case_id && item.owner_id === owner_id) { objects.delete(key); deleted += 1; }
      }
      return deleted;
    },
    async recordDeletionTombstone({ case_id, deleted_at }) {
      const tombstone = { key: `deletion-ledger/${case_id}.json`, case_id, deleted_at };
      deletionLedger.set(case_id, tombstone);
      return clone(tombstone);
    },
    async listDeletionTombstones() {
      return [...deletionLedger.values()].map(clone).sort((a, b) => a.deleted_at.localeCompare(b.deleted_at));
    },
    async purgeDeletionTombstonesBefore({ cutoff }) {
      const cutoffMs = Date.parse(cutoff);
      if (!Number.isFinite(cutoffMs)) throw new Error('Deletion tombstone purge requires a valid cutoff.');
      const checked = deletionLedger.size;
      let purged = 0;
      for (const [caseId, item] of deletionLedger.entries()) {
        if (Date.parse(item.deleted_at) < cutoffMs) {
          deletionLedger.delete(caseId);
          purged += 1;
        }
      }
      return { checked, purged, cutoff: new Date(cutoffMs).toISOString() };
    }
  };
}

export function createStaticExtractor({ output }) {
  return { async extract() { return clone(typeof output === 'function' ? await output() : output); } };
}

export function createMemoryIdempotencyStore() {
  const values = new Map();
  return {
    async get(key) { return clone(values.get(key) ?? null); },
    async put(key, value) { values.set(key, clone(value)); }
  };
}

export function createMemoryAudit() {
  const entries = [];
  return {
    async write(entry) { entries.push({ ...clone(entry), at: entry.at ?? new Date().toISOString() }); },
    async list() { return entries.map(clone); }
  };
}
