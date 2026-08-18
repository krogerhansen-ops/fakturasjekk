function clone(value) { return structuredClone(value); }

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
      if (!value || value.owner_id !== ownerId || value.deleted_at) {
        throw new Error('Case not found or not owned by user.');
      }
      return clone(value);
    },
    async listOwned(ownerId) {
      return [...cases.values()]
        .filter(item => item.owner_id === ownerId && !item.deleted_at)
        .map(clone);
    }
  };
}

export function createMemoryStorage() {
  const objects = new Map();
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
    async deleteCaseObjects({ case_id, owner_id }) {
      let deleted = 0;
      for (const [key, item] of objects.entries()) {
        if (item.case_id === case_id && item.owner_id === owner_id) {
          objects.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }
  };
}

export function createStaticExtractor({ output }) {
  return {
    async extract() {
      if (typeof output === 'function') return clone(await output());
      return clone(output);
    }
  };
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
