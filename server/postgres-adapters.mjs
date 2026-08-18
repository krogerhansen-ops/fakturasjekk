import crypto from 'node:crypto';

function requireDb(db) {
  if (!db?.query) throw new Error('PostgreSQL adapter requires db.query(sql, params).');
  return db;
}
function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return structuredClone(value);
}
function hydrateCase(row) {
  const snapshot = parseJson(row.snapshot) ?? {};
  return {
    ...snapshot,
    id: row.id,
    owner_id: row.owner_id,
    state: row.state,
    retention_mode: row.retention_mode,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null
  };
}

export function createPostgresCaseStore({ db } = {}) {
  db = requireDb(db);
  return {
    async nextId(kind) {
      return `${kind}-${crypto.randomUUID()}`;
    },
    async save(caseData) {
      const buyerType = caseData.intake_request?.buyer_type ?? null;
      const subject = caseData.intake_request?.subject ?? null;
      const engineVersion = caseData.analyses?.at(-1)?.engine_version ?? null;
      const result = await db.query(
        `INSERT INTO cases (id, owner_id, state, retention_mode, buyer_type, subject, engine_version, snapshot, created_at, updated_at, closed_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           owner_id=EXCLUDED.owner_id, state=EXCLUDED.state, retention_mode=EXCLUDED.retention_mode,
           buyer_type=EXCLUDED.buyer_type, subject=EXCLUDED.subject, engine_version=EXCLUDED.engine_version,
           snapshot=EXCLUDED.snapshot, updated_at=EXCLUDED.updated_at, closed_at=EXCLUDED.closed_at, deleted_at=EXCLUDED.deleted_at
         RETURNING id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at`,
        [caseData.id, caseData.owner_id, caseData.state, caseData.retention_mode, buyerType, subject, engineVersion,
          JSON.stringify(caseData), caseData.created_at, caseData.updated_at, caseData.closed_at ?? null, caseData.deleted_at ?? null]
      );
      return hydrateCase(result.rows[0]);
    },
    async getOwned(caseId, ownerId) {
      const result = await db.query(
        `SELECT id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at
           FROM cases WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL LIMIT 1`, [caseId, ownerId]
      );
      if (!result.rows.length) throw new Error('Case not found or not owned by user.');
      return hydrateCase(result.rows[0]);
    },
    async getForSystem(caseId) {
      const result = await db.query(
        `SELECT id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at
           FROM cases WHERE id=$1 AND deleted_at IS NULL LIMIT 1`, [caseId]
      );
      if (!result.rows.length) throw new Error('Case not found.');
      return hydrateCase(result.rows[0]);
    },
    async listOwned(ownerId) {
      const result = await db.query(
        `SELECT id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at
           FROM cases WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC`, [ownerId]
      );
      return result.rows.map(hydrateCase);
    },
    async listForRetention() {
      const result = await db.query(
        `SELECT id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at
           FROM cases WHERE deleted_at IS NULL ORDER BY updated_at ASC`
      );
      return result.rows.map(hydrateCase);
    },
    async deleteOwned(caseId, ownerId, { deleted_at = new Date().toISOString() } = {}) {
      const current = await this.getOwned(caseId, ownerId);
      const deleted = { ...current, state: 'deleted', deleted_at, updated_at: deleted_at };
      const result = await db.query(
        `UPDATE cases SET state='deleted', deleted_at=$3, updated_at=$3, snapshot=$4::jsonb
           WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL
         RETURNING id, owner_id, state, retention_mode, snapshot, created_at, updated_at, deleted_at`,
        [caseId, ownerId, deleted_at, JSON.stringify(deleted)]
      );
      if (!result.rows.length) throw new Error('Case not found or not owned by user.');
      return hydrateCase(result.rows[0]);
    }
  };
}

export function createPostgresIdempotencyStore({ db } = {}) {
  db = requireDb(db);
  return {
    async get(namespace) {
      const result = await db.query(`SELECT state, response, expires_at, owner_id, operation FROM idempotency_keys WHERE namespace=$1 LIMIT 1`, [namespace]);
      if (!result.rows.length) return null;
      const row = result.rows[0];
      return { state: row.state, response: parseJson(row.response), expires_at: new Date(row.expires_at).toISOString(), owner_id: row.owner_id, operation: row.operation };
    },
    async put(namespace, value) {
      await db.query(
        `INSERT INTO idempotency_keys (namespace, owner_id, operation, state, response, expires_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,now())
         ON CONFLICT (namespace) DO UPDATE SET state=EXCLUDED.state, response=EXCLUDED.response,
           expires_at=EXCLUDED.expires_at, owner_id=EXCLUDED.owner_id, operation=EXCLUDED.operation, updated_at=now()`,
        [namespace, value.owner_id ?? null, value.operation ?? null, value.state, value.response == null ? null : JSON.stringify(value.response), value.expires_at]
      );
    }
  };
}

export function createPostgresPaymentEventStore({ db } = {}) {
  db = requireDb(db);
  return {
    async claim({ provider, provider_reference, case_id }) {
      const inserted = await db.query(
        `INSERT INTO payment_event_claims (provider, provider_reference, case_id)
         VALUES ($1,$2,$3) ON CONFLICT (provider, provider_reference) DO NOTHING RETURNING case_id`,
        [provider, provider_reference, case_id]
      );
      if (inserted.rows.length) return { status: 'new' };
      const existing = await db.query(`SELECT case_id FROM payment_event_claims WHERE provider=$1 AND provider_reference=$2 LIMIT 1`, [provider, provider_reference]);
      if (!existing.rows.length) throw new Error('Payment event claim race could not be resolved.');
      if (existing.rows[0].case_id === case_id) return { status: 'duplicate_same_case' };
      return { status: 'conflict', existing_case_id: existing.rows[0].case_id };
    }
  };
}

export function createPostgresAuditAdapter({ db } = {}) {
  db = requireDb(db);
  return {
    async write(entry) {
      await db.query(
        `INSERT INTO audit_log (actor_id, case_id, action, outcome, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [entry.actor_id ?? null, entry.case_id ?? null, entry.action, entry.outcome, JSON.stringify(entry.metadata ?? {}), entry.at ?? new Date().toISOString()]
      );
    }
  };
}
