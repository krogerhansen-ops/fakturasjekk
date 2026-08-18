import { classifyIntake } from './intake.mjs';
import { analyzeCase } from './analyzer.mjs';
import { analyzeInkasso } from './inkasso.mjs';
import { runDocumentChecks } from './document-checks.mjs';
import { buildEvidenceLedger, summarizeEvidence, assertEvidenceSafety } from './evidence.mjs';
import { assessAssurance } from './assurance.mjs';
import { buildDraft } from './draft.mjs';

function combineAnalysis(baseAnalysis, inkasso) {
  if (!inkasso || inkasso.status === 'not_applicable') return baseAnalysis;
  const status = [baseAnalysis.status, inkasso.status].includes('attention')
    ? 'attention'
    : [baseAnalysis.status, inkasso.status].includes('review')
      ? 'review'
      : baseAnalysis.status;

  return {
    ...baseAnalysis,
    status,
    findings: [...(baseAnalysis.findings ?? []), ...(inkasso.findings ?? [])],
    rule_ids: [...new Set([...(baseAnalysis.rule_ids ?? []), ...(inkasso.rule_ids ?? [])])],
    questions: [...(baseAnalysis.questions ?? []), ...(inkasso.questions ?? [])],
    collection: inkasso
  };
}

function combineDocumentChecks(analysis, documentChecks) {
  if (!documentChecks) return analysis;
  const extraFindings = documentChecks.findings ?? [];
  const extraQuestions = documentChecks.questions ?? [];
  if (!extraFindings.length && !extraQuestions.length) return { ...analysis, document_checks: documentChecks };

  const baseFindings = extraFindings.length
    ? (analysis.findings ?? []).filter(f => f.code !== 'NO_DOCUMENTED_DEVIATION')
    : (analysis.findings ?? []);
  const findings = [...baseFindings, ...extraFindings];
  const questions = [...(analysis.questions ?? []), ...extraQuestions];
  let status = analysis.status;
  if (analysis.supported !== false && status !== 'unsupported') {
    if (findings.some(f => f.severity === 'high' || f.severity === 'stop')) status = 'attention';
    else if (findings.length || questions.length) status = 'review';
  }
  return { ...analysis, status, findings, questions, document_checks: documentChecks };
}

export function runCase({ intake, facts = {}, origins = {}, collection = null, registry, user_note = '', draft_mode = 'request', invoice_reference = '' } = {}) {
  const intakeResult = classifyIntake(intake ?? {});

  const base = {
    engine: registry?.engine_version ?? null,
    intake: intakeResult,
    analysis: null,
    inkasso: null,
    document_checks: null,
    evidence: [],
    evidence_summary: {},
    assurance: null,
    draft: { allowed: false, reason: 'Analyse er ikke kjørt.' },
    status: intakeResult.status
  };

  if (!intakeResult.supported) {
    return {
      ...base,
      status: intakeResult.status,
      draft: { allowed: false, reason: intakeResult.reason }
    };
  }

  const analysisInput = {
    ...facts,
    party_type: 'consumer',
    case_type: intakeResult.route
  };

  const invoiceAnalysis = analyzeCase(analysisInput, registry);
  const inkasso = analyzeInkasso(collection ?? {});
  const documentChecks = runDocumentChecks(facts);
  const analysis = combineDocumentChecks(combineAnalysis(invoiceAnalysis, inkasso), documentChecks);

  const evidence = buildEvidenceLedger({ facts, origins, analysis, user_note });
  assertEvidenceSafety(evidence);
  const assurance = assessAssurance({ analysis, evidence });

  const draft = buildDraft({
    analysis,
    registry,
    invoice_reference,
    user_note,
    mode: draft_mode
  });

  return {
    ...base,
    status: analysis.status,
    analysis,
    inkasso,
    document_checks: documentChecks,
    evidence,
    evidence_summary: summarizeEvidence(evidence),
    assurance,
    draft
  };
}
