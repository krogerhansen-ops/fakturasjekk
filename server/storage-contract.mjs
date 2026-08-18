export function normalizeStorageReservation(value) {
  if (typeof value === 'string' && value) {
    return { storage_key: value, upload_url: null, expires_at: null, provider_expires_at: null, required_headers: {} };
  }
  if (!value || typeof value !== 'object' || typeof value.storage_key !== 'string' || !value.storage_key) {
    throw new Error('Storage reservation must contain storage_key.');
  }
  return {
    storage_key: value.storage_key,
    upload_url: value.upload_url ?? null,
    expires_at: value.expires_at ?? null,
    provider_expires_at: value.provider_expires_at ?? value.expires_at ?? null,
    required_headers: value.required_headers ?? {}
  };
}

export function publicUploadTarget({ document_id, reservation }) {
  const normalized = normalizeStorageReservation(reservation);
  if (!normalized.upload_url) return null;
  return {
    document_id,
    upload_url: normalized.upload_url,
    expires_at: normalized.expires_at,
    required_headers: normalized.required_headers
  };
}

export function assertUploadTargetSafe(target) {
  if (!target) return true;
  const text = JSON.stringify(target);
  if (text.includes('storage_key')) throw new Error('storage_key must not be exposed in upload target.');
  if (text.includes('provider_expires_at')) throw new Error('provider upload-token lifetime must not be exposed in upload target.');
  if (!/^https:\/\//i.test(target.upload_url)) throw new Error('Signed upload URL must use HTTPS.');
  if (target.expires_at && Number.isNaN(Date.parse(target.expires_at))) throw new Error('Upload acceptance expiry must be a valid date.');
  return true;
}
