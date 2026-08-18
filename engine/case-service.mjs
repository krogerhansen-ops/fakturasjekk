import { classifyIntake } from './intake.mjs';
import { analyzeCase } from './analyzer.mjs';
import { buildEvidenceLedger, summarizeEvidence, assertEvidenceSafety } from './evidence.mjs';
import { buildDraft } from './draft.mjs';

export function runCase({ intake, facts = {}, origins = {}, registry, user_note = '', draft_mode = 'request', invoice_reference = '' } = {}) {
  const intakeResult = classifyIntake(intake ?? {});

  const base = {
    engine: registry?.engine_version ?? null,
    intake: intakeResult,
    analysis: null,
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

  const analysis = analyzeCase(analysisInput, registry);
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
    evidence,
    evidence_summary: summarizeEvidence(evidence),
    draft
  };
}
