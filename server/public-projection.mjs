export function projectCase(caseData) {
  if (!caseData) return null;
  return {
    id: caseData.id,
    state: caseData.state,
    retention_mode: caseData.retention_mode,
    created_at: caseData.created_at,
    updated_at: caseData.updated_at,
    documents: (caseData.documents ?? []).map(d => ({
      id: d.id,
      role: d.role,
      name: d.name,
      mime_type: d.mime_type,
      byte_size: d.byte_size,
      status: d.status,
      uploaded_at: d.uploaded_at,
      created_at: d.created_at
    })),
    analyses: (caseData.analyses ?? []).map(a => ({
      id: a.id,
      engine_version: a.engine_version,
      status: a.status,
      created_at: a.created_at
    })),
    payments: (caseData.payments ?? []).map(p => ({
      status: p.status,
      amount_minor: p.amount_minor,
      currency: p.currency,
      provider: p.provider,
      paid_at: p.paid_at
    })),
    drafts: (caseData.drafts ?? []).map(d => ({ id: d.id, mode: d.mode, analysis_id: d.analysis_id, created_at: d.created_at })),
    supplier_responses: (caseData.supplier_responses ?? []).map(r => ({ id: r.id, received_at: r.received_at, created_at: r.created_at })),
    followups: (caseData.follow_ups ?? caseData.followups ?? []).map(f => ({ id: f.id, response_id: f.response_id, created_at: f.created_at }))
  };
}

export function projectAnalysisResponse(output) {
  if (output?.status === 'needs_confirmation') {
    return {
      status: 'needs_confirmation',
      confirmation: {
        counts: output.extraction?.counts ?? {},
        review: (output.extraction?.review ?? []).map(item => ({
          field: item.field,
          value: item.value,
          confidence: item.confidence,
          source_document_id: item.source_document_id,
          source_page: item.source_page,
          reason: item.reason
        })),
        rejected: (output.extraction?.rejected ?? []).map(item => ({ field: item.field, reason: item.reason }))
      },
      case: projectCase(output.case)
    };
  }
  return { status: output.status, preview: output.preview, case: projectCase(output.case) };
}

export function projectPaymentConfirmation(output) {
  return { paid: output.paid, case: projectCase(output.case), errors: output.validation?.errors ?? [] };
}

export function projectDraftResponse(output) {
  return { draft: output.draft, case: projectCase(output.case) };
}

export function projectSupplierResponse(output) {
  return { review: output.review, follow_up: output.follow_up, case: projectCase(output.case) };
}

export function assertNoPrivateFields(value) {
  const text = JSON.stringify(value ?? {});
  const forbidden = ['storage_key', 'provider_reference', 'structured_response', 'raw_text'];
  for (const key of forbidden) {
    if (text.includes(`\"${key}\"`)) throw new Error(`Private field leaked: ${key}`);
  }
  return true;
}
