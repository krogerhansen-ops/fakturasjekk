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
    analyses: (caseData.analyses ?? []).map(a => ({ id: a.id, engine_version: a.engine_version, status: a.status, created_at: a.created_at })),
    payments: (caseData.payments ?? []).map(p => ({ status: p.status, amount_minor: p.amount_minor, currency: p.currency, provider: p.provider, paid_at: p.paid_at })),
    drafts: (caseData.drafts ?? []).map(d => ({ id: d.id, mode: d.mode, analysis_id: d.analysis_id, created_at: d.created_at })),
    supplier_responses: (caseData.supplier_responses ?? []).map(r => ({ id: r.id, received_at: r.received_at, created_at: r.created_at })),
    followups: (caseData.follow_ups ?? caseData.followups ?? []).map(f => ({ id: f.id, response_id: f.response_id, created_at: f.created_at }))
  };
}

export function projectAnalysisResponse(output) {
  if (output?.status === 'needs_confirmation') {
    const needs = output.extraction?.confirmation_needs ?? output.extraction?.review ?? [];
    return {
      status: 'needs_confirmation',
      confirmation: {
        counts: output.extraction?.counts ?? {},
        review: needs.map(item => ({
          field: item.field,
          value: item.suggested_value ?? item.value ?? null,
          confidence: item.confidence ?? null,
          source_document_id: item.source_document_id ?? null,
          source_page: item.source_page ?? null,
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
  const review = output.review ? {
    allowed: output.review.allowed,
    status: output.review.status,
    reason: output.review.reason ?? null,
    unanswered_count: output.review.unanswered_count ?? 0,
    partially_answered_count: output.review.partially_answered_count ?? 0,
    answered_count: output.review.answered_count ?? 0,
    items: (output.review.items ?? []).map(item => ({
      title: item.title,
      status: item.status,
      explanation: item.explanation,
      active_rule_references: item.active_rule_references ?? [],
      answer_text: item.answer_text ?? '',
      documentation_provided: item.documentation_provided === true
    }))
  } : null;
  return { review, follow_up: output.follow_up, case: projectCase(output.case) };
}

function customerFinding(finding) {
  return { severity: finding.severity, title: finding.title, explanation: finding.explanation };
}

function projectDocumentChecks(checks) {
  if (!checks) return null;
  return {
    arithmetic: checks.math ? {
      valid: checks.math.valid,
      calculated_subtotal: checks.math.calculated_subtotal,
      calculated_vat: checks.math.calculated_vat,
      calculated_total_from_stated: checks.math.calculated_total_from_stated,
      calculated_total_from_lines: checks.math.calculated_total_from_lines,
      issue_count: checks.math.issues?.length ?? 0,
      note: checks.math.note
    } : null,
    comparison: checks.comparison ? {
      ...checks.comparison.summary,
      safe_for_automatic_conclusion: checks.comparison.safe_for_automatic_conclusion
    } : null,
    safe_for_automatic_conclusion: checks.safe_for_automatic_conclusion !== false
  };
}

export function projectFullResult(result, registry) {
  const ruleMap = new Map((registry?.rules ?? []).map(rule => [rule.id, rule]));
  const ruleIds = [...new Set(result?.analysis?.rule_ids ?? [])];
  const rules = ruleIds
    .map(id => ruleMap.get(id))
    .filter(rule => rule?.status === 'active')
    .map(rule => ({ law: rule.law, section: rule.section, title: rule.title, source_url: rule.source_url, last_verified: rule.last_verified, status: rule.status }));

  const evidence = (result?.evidence ?? [])
    .filter(item => item.type !== 'rule')
    .map(item => ({
      type: item.type,
      field: item.field,
      value: item.value,
      ...(item.type === 'documented' ? { source_document_id: item.source_id, confidence: item.confidence } : {}),
      note: item.note
    }));

  const projected = {
    status: result?.status,
    engine_version: result?.engine ?? null,
    analysis: result?.analysis ? {
      calculations: result.analysis.calculations ?? {},
      findings: (result.analysis.findings ?? []).map(customerFinding),
      questions: result.analysis.questions ?? []
    } : null,
    document_checks: projectDocumentChecks(result?.document_checks),
    assurance: result?.assurance ? {
      level: result.assurance.level,
      counts: result.assurance.counts,
      message: result.assurance.message
    } : null,
    rules,
    evidence,
    evidence_summary: result?.evidence_summary ?? {},
    draft: result?.draft ? { allowed: result.draft.allowed, reason: result.draft.reason ?? null, text: result.draft.text ?? null } : null
  };
  assertNoPrivateFields(projected);
  const text = JSON.stringify(projected);
  if (/HTJL_|FKJL_|MFL_|POF_|BOF_|INK_|ESTIMATE_ABOVE_|HANDCRAFT_INVOICE_FEE|GOODS_INVOICE_FEE/.test(text)) throw new Error('Internal rule/finding code leaked to customer result.');
  return projected;
}

export function assertNoPrivateFields(value) {
  const text = JSON.stringify(value ?? {});
  const forbidden = ['storage_key', 'provider_reference', 'structured_response', 'raw_text', 'finding_code', 'rule_package'];
  for (const key of forbidden) {
    if (text.includes(`\"${key}\"`)) throw new Error(`Private field leaked: ${key}`);
  }
  return true;
}
