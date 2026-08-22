import crypto from 'node:crypto';
import { createSupabaseStorageProvider } from '../server/supabase-storage-provider.mjs';
import { detectDocumentMime } from '../server/document-security-scanner.mjs';

export const STORAGE_E2E_PROJECT_REF = 'jxmkaxwflouacuboaetg';
export const STORAGE_E2E_ORIGIN = `https://${STORAGE_E2E_PROJECT_REF}.supabase.co`;
export const STORAGE_E2E_BUCKET = 'case-documents-private';
const MAX_SYNTHETIC_BYTES = 1024 * 1024;

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function apiKeyValue(item) {
  for (const key of ['api_key', 'key', 'value']) {
    if (typeof item?.[key] === 'string' && item[key].trim()) return item[key].trim();
  }
  return null;
}

export function selectStorageE2EKey(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.keys) ? payload.keys : [];
  const active = items.filter(item => item?.disabled !== true);
  const modern = active.find(item => item?.type === 'secret' && /^sb_secret_/i.test(apiKeyValue(item) ?? ''));
  const legacy = active.find(item => item?.type === 'legacy' && (item?.name === 'service_role' || item?.id === 'service_role'));
  const secretKey = apiKeyValue(modern) ?? apiKeyValue(legacy);
  if (!secretKey || (!/^sb_secret_/i.test(secretKey) && !/^eyJ/i.test(secretKey))) {
    throw new Error('Live Storage E2E could not resolve a supported server-only project key.');
  }
  return secretKey;
}

async function managementJson(fetchImpl, accessToken) {
  let response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${STORAGE_E2E_PROJECT_REF}/api-keys?reveal=true`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    const error = new Error('Live Storage E2E Management API request failed.');
    error.code = 'storage_e2e_management_network_failed';
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`Live Storage E2E Management API failed with HTTP ${response.status}.`);
    error.code = 'storage_e2e_management_http_failed';
    throw error;
  }
  return payload;
}

function syntheticPdfBytes() {
  return new TextEncoder().encode('%PDF-1.4\n% Fakturasjekk synthetic private Storage E2E\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function syntheticKey(clock = () => new Date()) {
  const stamp = clock().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `synthetic-e2e/storage/${stamp}-${crypto.randomBytes(8).toString('hex')}.pdf`;
}

async function uploadSigned(fetchImpl, signed, bytes) {
  const headers = new Headers(signed.required_headers ?? {});
  headers.set('x-upsert', 'false');
  let response;
  try {
    response = await fetchImpl(signed.url, {
      method: 'PUT',
      headers,
      body: bytes,
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    const error = new Error('Live signed Storage upload request failed.');
    error.code = 'storage_e2e_signed_upload_network_failed';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Live signed Storage upload failed with HTTP ${response.status}.`);
    error.code = 'storage_e2e_signed_upload_http_failed';
    throw error;
  }
  return response;
}

async function assertPrivateWithoutCredentials(fetchImpl, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  let response;
  try {
    response = await fetchImpl(`${STORAGE_E2E_ORIGIN}/storage/v1/object/${encodeURIComponent(STORAGE_E2E_BUCKET)}/${encoded}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    // A network-level refusal is also non-disclosure; the live provider read below proves reachability.
    return true;
  }
  if (response.ok) {
    const error = new Error('Private Storage object was readable without credentials.');
    error.code = 'storage_e2e_public_read_exposed';
    throw error;
  }
  return true;
}

export async function runSupabaseStorageLiveE2E({
  accessToken = process.env.SUPABASE_ACCESS_TOKEN,
  projectRef = process.env.SUPABASE_PROJECT_REF ?? STORAGE_E2E_PROJECT_REF,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
} = {}) {
  const managementToken = required(accessToken, 'SUPABASE_ACCESS_TOKEN');
  if (projectRef !== STORAGE_E2E_PROJECT_REF) throw new Error('Live Storage E2E is locked to the dedicated Fakturasjekk production project.');
  if (typeof fetchImpl !== 'function') throw new Error('Live Storage E2E requires fetch.');

  const keyPayload = await managementJson(fetchImpl, managementToken);
  const secretKey = selectStorageE2EKey(keyPayload);
  const provider = createSupabaseStorageProvider({ supabaseUrl: STORAGE_E2E_ORIGIN, secretKey, fetchImpl });
  const key = syntheticKey(clock);
  const bytes = syntheticPdfBytes();
  const expectedSha = sha256(bytes);
  let objectMayExist = false;
  let cleanupVerified = false;

  try {
    const before = await provider.headObject({ bucket: STORAGE_E2E_BUCKET, key });
    if (before.exists) throw new Error('Synthetic Storage E2E path unexpectedly already exists.');

    const signed = await provider.createSignedPut({
      bucket: STORAGE_E2E_BUCKET,
      key,
      content_type: 'application/pdf'
    });
    if (new URL(signed.url).origin !== STORAGE_E2E_ORIGIN) throw new Error('Signed Storage URL escaped the dedicated Fakturasjekk project.');
    if (Number(signed.provider_expires_in_seconds) !== 7200) throw new Error('Signed Storage URL TTL drifted from the reviewed 2-hour provider contract.');
    if (signed.required_headers?.['content-type'] !== 'application/pdf') throw new Error('Signed Storage upload did not preserve the declared PDF MIME type.');

    objectMayExist = true;
    await uploadSigned(fetchImpl, signed, bytes);

    // Signed URL must not silently overwrite/replay the same object under the production no-upsert contract.
    const replay = await fetchImpl(signed.url, {
      method: 'PUT',
      headers: { ...signed.required_headers, 'x-upsert': 'false' },
      body: bytes,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store'
    });
    if (replay.ok) throw new Error('Signed Storage upload replay unexpectedly overwrote an existing object.');

    const head = await provider.headObject({ bucket: STORAGE_E2E_BUCKET, key });
    if (!head.exists) throw new Error('Uploaded synthetic Storage object could not be found.');
    if (head.byte_size != null && head.byte_size !== bytes.byteLength) throw new Error('Uploaded synthetic Storage byte size changed.');
    if (head.content_type && !head.content_type.toLowerCase().startsWith('application/pdf')) throw new Error('Uploaded synthetic Storage MIME type changed.');

    await assertPrivateWithoutCredentials(fetchImpl, key);

    const read = await provider.getObjectBytes({ bucket: STORAGE_E2E_BUCKET, key, max_bytes: MAX_SYNTHETIC_BYTES });
    if (read.byte_size !== bytes.byteLength) throw new Error('Private Storage byte read returned unexpected size.');
    if (sha256(read.bytes) !== expectedSha) throw new Error('Private Storage byte read failed SHA-256 integrity verification.');
    if (detectDocumentMime(read.bytes) !== 'application/pdf') throw new Error('Private Storage object failed PDF magic-byte verification.');

    const listed = await provider.listPrefix({ bucket: STORAGE_E2E_BUCKET, prefix: key });
    if (!Array.isArray(listed.items) || listed.items.length !== 1 || listed.items[0]?.key !== key) {
      throw new Error('Private Storage exact-prefix verification did not return the synthetic object.');
    }

    const deleted = await provider.deletePrefix({ bucket: STORAGE_E2E_BUCKET, prefix: key });
    if (deleted.deleted_count !== 1) throw new Error('Private Storage synthetic object deletion count was not exactly one.');
    objectMayExist = false;
    const after = await provider.headObject({ bucket: STORAGE_E2E_BUCKET, key });
    if (after.exists) throw new Error('Private Storage synthetic object still exists after deletion.');
    cleanupVerified = true;

    return {
      ok: true,
      project_ref: STORAGE_E2E_PROJECT_REF,
      bucket: STORAGE_E2E_BUCKET,
      signed_upload_verified: true,
      signed_replay_blocked: true,
      unauthenticated_read_blocked: true,
      private_read_verified: true,
      sha256_integrity_verified: true,
      magic_bytes_verified: true,
      deletion_verified: true,
      malware_scan_verified: false,
      synthetic_only: true
    };
  } finally {
    if (objectMayExist) {
      try {
        await provider.deletePrefix({ bucket: STORAGE_E2E_BUCKET, prefix: key });
        const afterCleanup = await provider.headObject({ bucket: STORAGE_E2E_BUCKET, key });
        cleanupVerified = !afterCleanup.exists;
      } catch {
        cleanupVerified = false;
      }
    }
    if (!cleanupVerified) {
      const error = new Error('Live Storage E2E cleanup failed; synthetic object may remain and must be removed before rerun.');
      error.code = 'storage_e2e_cleanup_failed';
      throw error;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupabaseStorageLiveE2E()
    .then(result => console.log(`OK Supabase private Storage live E2E: ${JSON.stringify(result)}`))
    .catch(error => {
      console.error(`FAIL Supabase private Storage live E2E: ${error?.code ?? 'storage_e2e_failed'}: ${error?.message ?? 'unknown error'}`);
      process.exitCode = 1;
    });
}
