const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function toMs(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${value}`);
  return ms;
}

function iso(ms) { return new Date(ms).toISOString(); }

export function computeRetention(caseData, policy, { now = new Date().toISOString() } = {}) {
  const mode = caseData.retention_mode ?? 'temporary';
  const config = policy.modes?.[mode];
  if (!config) throw new Error(`Unknown retention mode: ${mode}`);

  const nowMs = toMs(now);
  const lastActivityMs = toMs(caseData.updated_at ?? caseData.created_at);
  const analysisCompletedAt = caseData.analyses?.at(-1)?.created_at ?? caseData.updated_at ?? caseData.created_at;
  const analysisMs = toMs(analysisCompletedAt);

  if (mode === 'temporary') {
    const sourceDeleteAt = analysisMs + Number(config.source_documents_ttl_hours_after_completed_analysis) * HOUR;
    const caseDeleteAt = lastActivityMs + Number(config.case_content_ttl_days_after_last_activity) * DAY;
    return {
      mode,
      source_documents_delete_at: iso(sourceDeleteAt),
      case_content_delete_at: iso(caseDeleteAt),
      source_documents_expired: nowMs >= sourceDeleteAt,
      case_content_expired: nowMs >= caseDeleteAt,
      requires_user_action_to_extend: false
    };
  }

  const caseDeleteAt = lastActivityMs + Number(config.case_ttl_days_after_last_activity) * DAY;
  return {
    mode,
    source_documents_delete_at: iso(caseDeleteAt),
    case_content_delete_at: iso(caseDeleteAt),
    source_documents_expired: nowMs >= caseDeleteAt,
    case_content_expired: nowMs >= caseDeleteAt,
    requires_user_action_to_extend: config.renewal_requires_user_action === true
  };
}

export function purgePlan(caseData, policy, options = {}) {
  const retention = computeRetention(caseData, policy, options);
  const actions = [];
  if (retention.source_documents_expired && caseData.documents?.length) {
    actions.push({ type: 'DELETE_SOURCE_DOCUMENTS', document_ids: caseData.documents.map(d => d.id) });
  }
  if (retention.case_content_expired) {
    actions.push({
      type: 'DELETE_CASE_CONTENT',
      delete: ['documents', 'analyses', 'drafts', 'supplier_responses', 'follow_ups'],
      preserve: policy.purge_behavior?.retain_only_data_required_by_separate_legal_obligation ? ['separate_required_records_only'] : []
    });
  }
  return { retention, actions };
}

export function switchRetentionMode(caseData, nextMode, policy, { clock } = {}) {
  const config = policy.modes?.[nextMode];
  if (!config) throw new Error(`Unknown retention mode: ${nextMode}`);
  const at = typeof clock === 'function' ? clock() : new Date().toISOString();
  return {
    ...caseData,
    retention_mode: nextMode,
    updated_at: at,
    events: [...(caseData.events ?? []), { type: 'RETENTION_MODE_CHANGED', at, data: { to: nextMode, explicit_user_choice: nextMode === 'saved_case' } }]
  };
}
