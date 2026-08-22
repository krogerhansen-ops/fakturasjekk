import crypto from 'node:crypto';
import { createSupabaseServerRest, createSupabaseCaseStore } from '../server/supabase-data-adapters.mjs';
import { createSupabaseStorageProvider } from '../server/supabase-storage-provider.mjs';
import { createPrivateObjectStorageAdapter } from '../server/private-storage-adapter.mjs';
import { createCaseManagement } from '../server/case-management.mjs';
import { selectStorageE2EKey } from './verify-supabase-storage-live.mjs';

export const DELETE_E2E_PROJECT_REF = 'jxmkaxwflouacuboaetg';
export const DELETE_E2E_ORIGIN = `https://${DELETE_E2E_PROJECT_REF}.supabase.co`;
export const DELETE_E2E_BUCKET = 'case-documents-private';
const CHILD_TABLES = Object.freeze(['followups', 'supplier_responses', 'drafts', 'analyses', 'documents', 'case_events']);

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function iso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Delete E2E clock is invalid.');
  return date.toISOString();
}

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function casePrefix(ownerId, caseId) {
  return `cases/${encodeURIComponent(ownerId)}/${encodeURIComponent(caseId)}/`;
}

function tombstoneKey(caseId) {
  return `deletion-ledger/${encodeURIComponent(caseId)}.json`;
}

async function managementKeyPayload(fetchImpl, accessToken) {
  let response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${DELETE_E2E_PROJECT_REF}/api-keys?reveal=true`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    const error = new Error('Live delete E2E Management API request failed.');
    error.code = 'delete_e2e_management_network_failed';
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`Live delete E2E Management API failed with HTTP ${response.status}.`);
    error.code = 'delete_e2e_management_http_failed';
    throw error;
  }
  return payload;
}

async function rowsForCase(rest, table, caseId, ownerId, select = '*') {
  const rows = await rest.request(table, {
    query: { case_id: `eq.${caseId}`, owner_id: `eq.${ownerId}`, select }
  });
  return Array.isArray(rows) ? rows : [];
}

async function seedChildRows({ rest, caseId, ownerId, documentId, analysisId, draftId, storageKey, at }) {
  await rest.request('documents', {
    method: 'POST',
    body: {
      id: documentId,
      case_id: caseId,
      owner_id: ownerId,
      role: 'invoice',
      original_name: 'synthetic-delete-e2e.pdf',
      mime_type: 'application/pdf',
      byte_size: 87,
      storage_key: storageKey,
      sha256: 'synthetic-delete-e2e-sha256',
      upload_status: 'uploaded',
      created_at: at,
      uploaded_at: at
    },
    prefer: 'return=minimal'
  });
  await rest.request('analyses', {
    method: 'POST',
    body: {
      id: analysisId,
      case_id: caseId,
      owner_id: ownerId,
      engine_version: 'synthetic-delete-e2e',
      rule_registry_version: 'synthetic-delete-e2e',
      status: 'complete',
      result: { synthetic_delete_e2e: true, marker: 'SYNTHETIC_DELETE_CONTENT' },
      created_at: at
    },
    prefer: 'return=minimal'
  });
  await rest.request('drafts', {
    method: 'POST',
    body: {
      id: draftId,
      case_id: caseId,
      owner_id: ownerId,
      analysis_id: analysisId,
      mode: 'synthetic-delete-e2e',
      body: 'SYNTHETIC_DELETE_DRAFT_CONTENT',
      created_at: at
    },
    prefer: 'return=minimal'
  });
  await rest.request('case_events', {
    method: 'POST',
    body: {
      case_id: caseId,
      owner_id: ownerId,
      event_type: 'SYNTHETIC_DELETE_E2E_SEEDED',
      event_version: 1,
      payload: { synthetic_delete_e2e: true, marker: 'SYNTHETIC_DELETE_EVENT_CONTENT' },
      created_at: at
    },
    prefer: 'return=minimal'
  });
}

async function hardCleanup({ rest, provider, caseId, ownerId }) {
  const errors = [];
  for (const prefix of [casePrefix(ownerId, caseId), tombstoneKey(caseId)]) {
    try { await provider.deletePrefix({ bucket: DELETE_E2E_BUCKET, prefix }); } catch { errors.push(`storage:${prefix}`); }
  }
  for (const table of CHILD_TABLES) {
    try {
      await rest.request(table, {
        method: 'DELETE',
        query: { case_id: `eq.${caseId}`, owner_id: `eq.${ownerId}` },
        prefer: 'return=minimal'
      });
    } catch { errors.push(`table:${table}`); }
  }
  try {
    await rest.request('cases', {
      method: 'DELETE',
      query: { id: `eq.${caseId}`, owner_id: `eq.${ownerId}` },
      prefer: 'return=minimal'
    });
  } catch { errors.push('table:cases'); }
  return errors;
}

export async function runDeleteE2EWithAdapters({
  rest,
  caseStore,
  provider,
  clock = () => new Date(),
  ids = null
} = {}) {
  if (!rest?.request) throw new Error('Delete E2E requires server REST adapter.');
  if (!caseStore?.save || !caseStore?.getOwned || !caseStore?.listOwned || !caseStore?.deleteOwned) throw new Error('Delete E2E requires case store.');
  if (!provider?.putObject || !provider?.headObject || !provider?.getObject || !provider?.deletePrefix || !provider?.listPrefix) throw new Error('Delete E2E requires private Storage provider.');

  const caseId = ids?.case_id ?? unique('synthetic-delete-case');
  const ownerId = ids?.owner_id ?? unique('synthetic-delete-owner');
  const documentId = ids?.document_id ?? unique('synthetic-delete-document');
  const analysisId = ids?.analysis_id ?? unique('synthetic-delete-analysis');
  const draftId = ids?.draft_id ?? unique('synthetic-delete-draft');
  const at = iso(clock);
  const storageKey = `${casePrefix(ownerId, caseId)}${encodeURIComponent(documentId)}.pdf`;
  const ledgerKey = tombstoneKey(caseId);
  let scannerCalled = false;
  let cleanupErrors = [];

  const storage = createPrivateObjectStorageAdapter({
    provider,
    bucket: DELETE_E2E_BUCKET,
    scanner: {
      async scanObject() {
        scannerCalled = true;
        throw new Error('Delete E2E must never scan document contents.');
      }
    }
  });
  const management = createCaseManagement({ caseStore, storage, clock: () => new Date(at) });

  try {
    const caseData = {
      id: caseId,
      owner_id: ownerId,
      state: 'draft_ready',
      retention_mode: 'temporary',
      created_at: at,
      updated_at: at,
      closed_at: null,
      deleted_at: null,
      intake_request: {
        buyer_type: 'consumer',
        subject: 'SYNTHETIC_DELETE_CASE_CONTENT'
      },
      documents: [{ id: documentId, role: 'invoice', storage_key: storageKey, status: 'uploaded' }],
      analyses: [{ id: analysisId, engine_version: 'synthetic-delete-e2e', marker: 'SYNTHETIC_DELETE_ANALYSIS_CONTENT' }],
      drafts: [{ id: draftId, body: 'SYNTHETIC_DELETE_DRAFT_CONTENT' }],
      events: [{ type: 'SYNTHETIC_DELETE_E2E_SEEDED', marker: 'SYNTHETIC_DELETE_EVENT_CONTENT' }]
    };
    await caseStore.save(caseData);
    await seedChildRows({ rest, caseId, ownerId, documentId, analysisId, draftId, storageKey, at });
    await provider.putObject({
      bucket: DELETE_E2E_BUCKET,
      key: storageKey,
      body: '%PDF-1.4\n% SYNTHETIC_DELETE_STORAGE_CONTENT\n%%EOF\n',
      content_type: 'application/pdf',
      cache_control: 'no-store'
    });

    const beforeObject = await provider.headObject({ bucket: DELETE_E2E_BUCKET, key: storageKey });
    if (!beforeObject?.exists) throw new Error('Synthetic delete E2E Storage object was not created.');
    for (const table of ['documents', 'analyses', 'drafts', 'case_events']) {
      const beforeRows = await rowsForCase(rest, table, caseId, ownerId, 'id');
      if (beforeRows.length !== 1) throw new Error(`Synthetic delete E2E expected one seeded ${table} row.`);
    }

    const deleted = await management.deleteCase({ case_id: caseId, owner_id: ownerId, reason: 'synthetic_e2e' });
    if (deleted.state !== 'deleted' || deleted.deletion_tombstone_recorded !== true) throw new Error('Delete E2E did not return deleted+tombstone state.');
    if (deleted.deleted_object_count !== 1) throw new Error('Delete E2E did not delete exactly one private case object.');
    if (scannerCalled) throw new Error('Delete E2E unexpectedly invoked document scanning.');

    const afterObject = await provider.headObject({ bucket: DELETE_E2E_BUCKET, key: storageKey });
    if (afterObject?.exists) throw new Error('Private case object still exists after deletion.');

    const ledgerObject = await provider.getObject({ bucket: DELETE_E2E_BUCKET, key: ledgerKey });
    const ledgerRaw = typeof ledgerObject === 'string' ? ledgerObject : ledgerObject?.body;
    let ledger;
    try { ledger = JSON.parse(ledgerRaw); } catch { throw new Error('Deletion ledger object was missing or invalid JSON.'); }
    if (ledger?.version !== 1 || ledger.case_id !== caseId || Number.isNaN(Date.parse(ledger.deleted_at))) {
      throw new Error('Deletion ledger object did not preserve the synthetic deletion intent.');
    }

    for (const table of CHILD_TABLES) {
      const rows = await rowsForCase(rest, table, caseId, ownerId, 'id');
      if (rows.length !== 0) throw new Error(`Personal child table ${table} still contains synthetic case content after deletion.`);
    }

    const caseRows = await rest.request('cases', {
      query: { id: `eq.${caseId}`, owner_id: `eq.${ownerId}`, select: 'id,owner_id,state,retention_mode,buyer_type,subject,engine_version,snapshot,created_at,updated_at,deleted_at' }
    });
    if (!Array.isArray(caseRows) || caseRows.length !== 1) throw new Error('Minimal database deletion tombstone was not preserved.');
    const caseRow = caseRows[0];
    if (caseRow.state !== 'deleted' || !caseRow.deleted_at) throw new Error('Database deletion tombstone has invalid state.');
    if (caseRow.buyer_type != null || caseRow.subject != null || caseRow.engine_version != null) throw new Error('Personal case metadata was not nulled during deletion.');
    const snapshot = typeof caseRow.snapshot === 'string' ? JSON.parse(caseRow.snapshot) : caseRow.snapshot;
    const allowedSnapshotKeys = ['created_at', 'deleted_at', 'id', 'retention_mode', 'state', 'updated_at'];
    if (JSON.stringify(Object.keys(snapshot ?? {}).sort()) !== JSON.stringify(allowedSnapshotKeys)) {
      throw new Error('Database deletion snapshot contains fields beyond the minimal tombstone contract.');
    }
    if (JSON.stringify(caseRow).includes('SYNTHETIC_DELETE_')) throw new Error('Synthetic personal marker survived in database tombstone.');

    await assertRejectsOwnedRead(caseStore, caseId, ownerId);
    const visibleCases = await caseStore.listOwned(ownerId);
    if (visibleCases.length !== 0) throw new Error('Deleted synthetic case remained visible to owner listing.');

    return {
      ok: true,
      project_ref: DELETE_E2E_PROJECT_REF,
      storage_object_deleted: true,
      deletion_ledger_verified: true,
      child_content_purged: true,
      minimal_db_tombstone_verified: true,
      owner_visibility_removed: true,
      scanner_not_invoked: true,
      synthetic_only: true
    };
  } finally {
    cleanupErrors = await hardCleanup({ rest, provider, caseId, ownerId });
    if (cleanupErrors.length) {
      const error = new Error(`Live delete E2E cleanup failed for ${cleanupErrors.length} synthetic resource(s).`);
      error.code = 'delete_e2e_cleanup_failed';
      error.cleanup_targets = cleanupErrors;
      throw error;
    }
  }
}

async function assertRejectsOwnedRead(caseStore, caseId, ownerId) {
  try {
    await caseStore.getOwned(caseId, ownerId);
  } catch {
    return true;
  }
  throw new Error('Deleted synthetic case remained readable through owner-bound case store.');
}

export async function runSupabaseDeleteLiveE2E({
  accessToken = process.env.SUPABASE_ACCESS_TOKEN,
  projectRef = process.env.SUPABASE_PROJECT_REF ?? DELETE_E2E_PROJECT_REF,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
} = {}) {
  const managementToken = required(accessToken, 'SUPABASE_ACCESS_TOKEN');
  if (projectRef !== DELETE_E2E_PROJECT_REF) throw new Error('Live delete E2E is locked to the dedicated Fakturasjekk production project.');
  if (typeof fetchImpl !== 'function') throw new Error('Live delete E2E requires fetch.');

  const keyPayload = await managementKeyPayload(fetchImpl, managementToken);
  const serverKey = selectStorageE2EKey(keyPayload);
  const rest = createSupabaseServerRest({ supabaseUrl: DELETE_E2E_ORIGIN, secretKey: serverKey, fetchImpl, timeoutMs: 10000 });
  const caseStore = createSupabaseCaseStore({ rest });
  const provider = createSupabaseStorageProvider({ supabaseUrl: DELETE_E2E_ORIGIN, secretKey: serverKey, fetchImpl });
  return runDeleteE2EWithAdapters({ rest, caseStore, provider, clock });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupabaseDeleteLiveE2E()
    .then(result => console.log(`OK Supabase deletion live E2E: ${JSON.stringify(result)}`))
    .catch(error => {
      console.error(`FAIL Supabase deletion live E2E: ${error?.code ?? 'delete_e2e_failed'}: ${error?.message ?? 'unknown error'}`);
      process.exitCode = 1;
    });
}
