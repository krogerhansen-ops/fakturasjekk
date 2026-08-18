import crypto from 'node:crypto';

export function createPrivateObjectStorageAdapter({
  provider,
  scanner,
  bucket,
  upload_ttl_seconds = 600,
  key_prefix = 'cases',
  deletion_ledger_prefix = 'deletion-ledger',
  clock = () => new Date()
} = {}) {
  if (!provider?.createSignedPut || !provider?.headObject || !provider?.deletePrefix || !provider?.putObject || !provider?.listPrefix || !provider?.getObject) {
    throw new Error('Private storage provider requires createSignedPut, headObject, deletePrefix, putObject, listPrefix and getObject.');
  }
  if (!scanner?.scanObject) throw new Error('Private storage scanner requires scanObject.');
  if (!bucket) throw new Error('Private storage bucket is required.');
  if (upload_ttl_seconds < 60 || upload_ttl_seconds > 900) throw new Error('Signed upload TTL must be between 60 and 900 seconds.');

  function prefix({ owner_id, case_id }) {
    return `${key_prefix}/${encodeURIComponent(owner_id)}/${encodeURIComponent(case_id)}/`;
  }

  function deletionTombstoneKey(caseId) {
    return `${deletion_ledger_prefix}/${encodeURIComponent(caseId)}.json`;
  }

  return {
    async reservePrivateObject({ case_id, owner_id, document_id, mime_type, byte_size }) {
      const storage_key = `${prefix({ owner_id, case_id })}${encodeURIComponent(document_id)}-${crypto.randomUUID()}`;
      const expires_at = new Date(clock().getTime() + upload_ttl_seconds * 1000).toISOString();
      const signed = await provider.createSignedPut({
        bucket,
        key: storage_key,
        content_type: mime_type,
        max_bytes: byte_size,
        expires_in_seconds: upload_ttl_seconds
      });
      if (!signed?.url || !/^https:\/\//i.test(signed.url)) throw new Error('Storage provider must return HTTPS signed PUT URL.');
      return {
        storage_key,
        upload_url: signed.url,
        expires_at,
        required_headers: signed.required_headers ?? { 'content-type': mime_type }
      };
    },

    async finalizeUpload({ case_id, owner_id, storage_key, max_file_bytes, allowed_mime_types }) {
      const expectedPrefix = prefix({ owner_id, case_id });
      if (!storage_key?.startsWith(expectedPrefix)) throw new Error('Storage key does not belong to case owner.');
      const head = await provider.headObject({ bucket, key: storage_key });
      if (!head?.exists) throw new Error('Uploaded object not found.');
      const byteSize = Number(head.byte_size);
      if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > Number(max_file_bytes)) throw new Error('Uploaded object size is invalid.');

      const scan = await scanner.scanObject({ bucket, key: storage_key, declared_mime_type: head.content_type ?? null });
      if (scan?.malware_safe !== true) throw new Error('Uploaded object failed malware scan.');
      if (scan?.magic_bytes_verified !== true) throw new Error('Uploaded object failed magic-byte verification.');
      const mimeType = scan.detected_mime_type ?? head.content_type;
      if (!allowed_mime_types.includes(mimeType)) throw new Error('Uploaded object detected MIME type is not allowed.');

      return {
        uploaded: true,
        byte_size: byteSize,
        mime_type: mimeType,
        sha256: scan.sha256 ?? head.sha256 ?? null,
        magic_bytes_verified: true,
        malware_safe: true
      };
    },

    async listCaseDocuments({ case_id, owner_id, records = [] }) {
      const expectedPrefix = prefix({ owner_id, case_id });
      const output = [];
      for (const record of records) {
        if (!record.storage_key?.startsWith(expectedPrefix)) throw new Error('Stored document does not belong to case owner.');
        const head = await provider.headObject({ bucket, key: record.storage_key });
        if (!head?.exists) throw new Error('Stored document is missing.');
        output.push({ ...structuredClone(record), object_bucket: bucket, object_key: record.storage_key });
      }
      return output;
    },

    async deleteCaseObjects({ case_id, owner_id }) {
      const result = await provider.deletePrefix({ bucket, prefix: prefix({ owner_id, case_id }) });
      return Number(result?.deleted_count ?? 0);
    },

    async recordDeletionTombstone({ case_id, deleted_at }) {
      if (!case_id || !deleted_at || Number.isNaN(Date.parse(deleted_at))) throw new Error('Deletion tombstone requires case_id and valid deleted_at.');
      const key = deletionTombstoneKey(case_id);
      const body = JSON.stringify({ version: 1, case_id, deleted_at });
      await provider.putObject({
        bucket,
        key,
        body,
        content_type: 'application/json',
        cache_control: 'no-store'
      });
      return { key, case_id, deleted_at };
    },

    async listDeletionTombstones() {
      const listed = await provider.listPrefix({ bucket, prefix: `${deletion_ledger_prefix}/` });
      const items = Array.isArray(listed) ? listed : (listed?.items ?? []);
      const output = [];
      for (const item of items) {
        const key = typeof item === 'string' ? item : item?.key;
        if (!key?.startsWith(`${deletion_ledger_prefix}/`)) continue;
        const object = await provider.getObject({ bucket, key });
        const raw = typeof object === 'string' ? object : object?.body;
        if (typeof raw !== 'string') throw new Error('Deletion tombstone body is missing.');
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw new Error('Deletion tombstone JSON is invalid.'); }
        if (parsed?.version !== 1 || typeof parsed.case_id !== 'string' || Number.isNaN(Date.parse(parsed.deleted_at))) {
          throw new Error('Deletion tombstone is invalid.');
        }
        output.push({ key, case_id: parsed.case_id, deleted_at: parsed.deleted_at });
      }
      return output.sort((a, b) => a.deleted_at.localeCompare(b.deleted_at));
    }
  };
}
