import { classifyIntake } from './intake.mjs';
import { analyzeCase } from './analyzer.mjs';
import { analyzeInkasso } from './inkasso.mjs';
import { buildEvidenceLedger, summarizeEvidence, assertEvidenceSafety } from './evidence.mjs';
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

export function runCase({ intake, facts = {}, origins = {}, collection = null, registry, user_note = '', draft_mode = 'request', invoice_reference = '' } = {}) {
  const intakeResult = classifyIntake(intake ?? {});

  const base = {
    engine: registry?.engine_version ?? null,
    intake: intakeResult,
    analysis: null,
    inkasso: null,
    evidence: [],
    evidence_summary: {},
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
  const analysis = combineAnalysis(invoiceAnalysis, inkasso);

  const evidence = buildEvidenceLedger({ facts, origins, analysis, user_note });
  assertEvidenceSafety(evidence);

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
    evidence,
    evidence_summary: summarizeEvidence(evidence),
    draft
  };
}
