const ALLOWED_METADATA = new Set([
  'state', 'engine_version', 'rule_registry_version', 'finding_count', 'document_count',
  'document_roles', 'payment_provider', 'amount_minor', 'currency', 'error_code',
  'duration_ms', 'retention_mode', 'deleted_object_count', 'status'
]);

export function sanitizeAuditMetadata(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!ALLOWED_METADATA.has(key)) continue;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) output[key] = value;
    else if (Array.isArray(value)) output[key] = value.filter(v => typeof v === 'string').slice(0, 20);
  }
  return output;
}

export function createAuditLogger({ adapter, clock = () => new Date() } = {}) {
  if (!adapter?.write) throw new Error('Audit adapter requires write.');
  return {
    async record({ actor_id = null, case_id = null, action, outcome = 'success', metadata = {} }) {
      if (!action) throw new Error('Audit action is required.');
      const entry = {
        actor_id,
        case_id,
        action,
        outcome,
        metadata: sanitizeAuditMetadata(metadata),
        at: clock().toISOString()
      };
      await adapter.write(entry);
      return entry;
    }
  };
}
