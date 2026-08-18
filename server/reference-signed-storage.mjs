export function createMemorySignedStorage({ clock = () => new Date() } = {}) {
  const objects = new Map();
  return {
    async reservePrivateObject({ case_id, owner_id, document_id, name, mime_type }) {
      const storage_key = `private/${owner_id}/${case_id}/${document_id}`;
      const expires_at = new Date(clock().getTime() + 10 * 60 * 1000).toISOString();
      objects.set(storage_key, { case_id, owner_id, document_id, name, mime_type, uploaded: false, expires_at });
      return {
        storage_key,
        upload_url: `https://uploads.fakturasjekk.test/${encodeURIComponent(document_id)}?signature=test-only`,
        expires_at,
        required_headers: { 'content-type': mime_type }
      };
    },
    async simulateClientUpload({ storage_key, owner_id, byte_size, mime_type, sha256 = 'test-sha', magic_bytes_verified = true, malware_safe = true }) {
      const item = objects.get(storage_key);
      if (!item || item.owner_id !== owner_id) throw new Error('Storage object not found.');
      objects.set(storage_key, { ...item, uploaded: true, byte_size, mime_type, sha256, magic_bytes_verified, malware_safe });
    },
    async finalizeUpload({ storage_key, owner_id }) {
      const item = objects.get(storage_key);
      if (!item || item.owner_id !== owner_id || !item.uploaded) throw new Error('Uploaded object not found.');
      return {
        uploaded: true,
        byte_size: item.byte_size,
        mime_type: item.mime_type,
        sha256: item.sha256,
        magic_bytes_verified: item.magic_bytes_verified,
        malware_safe: item.malware_safe
      };
    },
    async listCaseDocuments({ case_id, owner_id, records = [] }) {
      return records.map(record => {
        const item = objects.get(record.storage_key);
        if (!item || item.case_id !== case_id || item.owner_id !== owner_id || !item.uploaded) throw new Error('Uploaded object not found.');
        return { ...structuredClone(record), uploaded: true };
      });
    },
    async deleteCaseObjects({ case_id, owner_id }) {
      let deleted = 0;
      for (const [key, item] of objects.entries()) {
        if (item.case_id === case_id && item.owner_id === owner_id) { objects.delete(key); deleted += 1; }
      }
      return deleted;
    },
    _objects: objects
  };
}
