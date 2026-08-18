function normalizedOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Supabase URL must be valid.'); }
  if (url.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS.');
  return url.origin;
}

function requireSecret(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Supabase secret key is required.');
  return value.trim();
}

function clone(value) { return structuredClone(value); }

function asIso(value) {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function hydrateCase(row) {
  const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : clone(row.snapshot ?? {});
  return {
    ...snapshot,
    id: row.id,
    owner_id: row.owner_id,
    state: row.state,
    retention_mode: row.retention_mode,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    deleted_at: row.deleted_at ? asIso(row.deleted_at) : null
  };
}

export function createSupabaseServerRest({
  supabaseUrl,
  secretKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000
} = {}) {
  const origin = normalizedOrigin(supabaseUrl);
  const key = requireSecret(secretKey);
  if (typeof fetchImpl !== 'function') throw new Error('Supabase Data API adapter requires fetch.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 20000) throw new Error('Supabase Data API timeout must be between 500 and 20000 ms.');

  async function request(path, { method = 'GET', query = null, body = undefined, prefer = null } = {}) {
    const url = new URL(`${origin}/rest/v1/${String(path).replace(/^\/+/, '')}`);
    if (query) {
      for (const [name, value] of Object.entries(query)) {
        if (value != null) url.searchParams.set(name, String(value));
      }
    }

    const headers = {
      apikey: key,
      accept: 'application/json'
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;

    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      throw new Error(`Supabase Data API request failed: ${String(error?.message ?? 'network error')}`);
    }

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    if (!response.ok) {
      const code = typeof payload === 'object' && payload ? payload.code ?? payload.message : null;
      throw new Error(`Supabase Data API ${response.status}${code ? `: ${String(code).slice(0, 120)}` : ''}`);
    }
    return payload;
  }

  return { request, origin };
}

export function createSupabaseCaseStore({ rest } = {}) {
  if (!rest?.request) throw new Error('Supabase case store requires REST client.');
  const select = 'id,owner_id,state,retention_mode,snapshot,created_at,updated_at,deleted_at';

  async function getOwned(caseId, ownerId) {
    const rows = await rest.request('cases', {
      query: { id: `eq.${caseId}`, owner_id: `eq.${ownerId}`, deleted_at: 'is.null', select, limit: 1 }
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('Case not found or not owned by user.');
    return hydrateCase(rows[0]);
  }

  async function getForSystem(caseId) {
    const rows = await rest.request('cases', { query: { id: `eq.${caseId}`, deleted_at: 'is.null', select, limit: 1 } });
    if (!Array.isArray(rows) || !rows.length) throw new Error('Case not found.');
    return hydrateCase(rows[0]);
  }

  return {
    async nextId(kind) { return `${kind}-${crypto.randomUUID()}`; },

    async save(caseData) {
      const row = {
        id: caseData.id,
        owner_id: caseData.owner_id,
        state: caseData.state,
        retention_mode: caseData.retention_mode,
        buyer_type: caseData.intake_request?.buyer_type ?? null,
        subject: caseData.intake_request?.subject ?? null,
        engine_version: caseData.analyses?.at(-1)?.engine_version ?? null,
        snapshot: caseData,
        created_at: caseData.created_at,
        updated_at: caseData.updated_at,
        closed_at: caseData.closed_at ?? null,
        deleted_at: caseData.deleted_at ?? null
      };
      const rows = await rest.request('cases', {
        method: 'POST',
        query: { on_conflict: 'id' },
        body: row,
        prefer: 'resolution=merge-duplicates,return=representation'
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error('Supabase case upsert returned no row.');
      return hydrateCase(rows[0]);
    },

    getOwned,
    getForSystem,

    async listOwned(ownerId) {
      const rows = await rest.request('cases', {
        query: { owner_id: `eq.${ownerId}`, deleted_at: 'is.null', select, order: 'updated_at.desc' }
      });
      return Array.isArray(rows) ? rows.map(hydrateCase) : [];
    },

    async listForRetention() {
      const rows = await rest.request('cases', { query: { deleted_at: 'is.null', select, order: 'updated_at.asc' } });
      return Array.isArray(rows) ? rows.map(hydrateCase) : [];
    },

    async deleteOwned(caseId, ownerId, { deleted_at = new Date().toISOString() } = {}) {
      const current = await getOwned(caseId, ownerId);
      for (const table of ['followups', 'supplier_responses', 'drafts', 'analyses', 'documents', 'case_events']) {
        await rest.request(table, {
          method: 'DELETE',
          query: { case_id: `eq.${caseId}`, owner_id: `eq.${ownerId}` },
          prefer: 'return=minimal'
        });
      }

      const minimalSnapshot = {
        id: current.id,
        state: 'deleted',
        retention_mode: current.retention_mode,
        created_at: current.created_at,
        updated_at: deleted_at,
        deleted_at
      };
      const rows = await rest.request('cases', {
        method: 'PATCH',
        query: { id: `eq.${caseId}`, owner_id: `eq.${ownerId}`, deleted_at: 'is.null' },
        body: {
          state: 'deleted',
          deleted_at,
          updated_at: deleted_at,
          buyer_type: null,
          subject: null,
          engine_version: null,
          snapshot: minimalSnapshot
        },
        prefer: 'return=representation'
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error('Case not found or not owned by user.');
      return hydrateCase(rows[0]);
    }
  };
}

export function createSupabaseIdempotencyStore({ rest } = {}) {
  if (!rest?.request) throw new Error('Supabase idempotency store requires REST client.');
  return {
    async get(namespace) {
      const rows = await rest.request('idempotency_keys', {
        query: { namespace: `eq.${namespace}`, select: 'state,response,expires_at,owner_id,operation', limit: 1 }
      });
      if (!Array.isArray(rows) || !rows.length) return null;
      const row = rows[0];
      return {
        state: row.state,
        response: clone(row.response),
        expires_at: asIso(row.expires_at),
        owner_id: row.owner_id,
        operation: row.operation
      };
    },
    async put(namespace, value) {
      await rest.request('idempotency_keys', {
        method: 'POST',
        query: { on_conflict: 'namespace' },
        body: {
          namespace,
          owner_id: value.owner_id ?? null,
          operation: value.operation ?? null,
          state: value.state,
          response: value.response ?? null,
          expires_at: value.expires_at,
          updated_at: new Date().toISOString()
        },
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
    }
  };
}

export function createSupabasePaymentEventStore({ rest } = {}) {
  if (!rest?.request) throw new Error('Supabase payment event store requires REST client.');
  return {
    async claim({ provider, provider_reference, case_id }) {
      const rows = await rest.request('rpc/fakturasjekk_claim_payment_event', {
        method: 'POST',
        body: { p_provider: provider, p_provider_reference: provider_reference, p_case_id: case_id }
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || !['new', 'duplicate_same_case', 'conflict'].includes(row.status)) {
        throw new Error('Supabase payment claim RPC returned invalid state.');
      }
      return { status: row.status, ...(row.existing_case_id ? { existing_case_id: row.existing_case_id } : {}) };
    }
  };
}

export function createSupabaseAuditAdapter({ rest } = {}) {
  if (!rest?.request) throw new Error('Supabase audit adapter requires REST client.');
  return {
    async write(entry) {
      await rest.request('audit_log', {
        method: 'POST',
        body: {
          actor_id: entry.actor_id ?? null,
          case_id: entry.case_id ?? null,
          action: entry.action,
          outcome: entry.outcome,
          metadata: entry.metadata ?? {},
          created_at: entry.at ?? new Date().toISOString()
        },
        prefer: 'return=minimal'
      });
    }
  };
}

export function createSupabaseAtomicCounterStore({ rest } = {}) {
  if (!rest?.request) throw new Error('Supabase rate-limit counter requires REST client.');
  return {
    async incrementWindow({ key, window_ms }) {
      if (!key || !Number.isFinite(Number(window_ms)) || Number(window_ms) <= 0) throw new Error('Invalid rate-limit window input.');
      const rows = await rest.request('rpc/fakturasjekk_increment_rate_limit_window', {
        method: 'POST',
        body: { p_key: key, p_window_ms: Number(window_ms) }
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      const count = Number(row?.count);
      const resetAt = Number(row?.reset_at_ms);
      if (!Number.isInteger(count) || !Number.isFinite(resetAt)) throw new Error('Supabase rate-limit RPC returned invalid state.');
      return { count, reset_at: resetAt };
    }
  };
}
