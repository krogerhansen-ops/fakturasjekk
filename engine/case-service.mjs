import { classifyIntake } from './intake.mjs';
import { analyzeCase } from './analyzer.mjs';
import { analyzeInkasso } from './inkasso.mjs';
import { runDocumentChecks } from './document-checks.mjs';
import { buildAnalysisCoverage, assertAnalysisCoverageSafe } from './analysis-coverage.mjs';
import { buildEvidenceLedger, summarizeEvidence, assertEvidenceSafety } from './evidence.mjs';
import { assessAssurance } from './assurance.mjs';
import { buildDraft } from './draft.mjs';
import { resolveRulePackage, assertRulePackageCompatibility } from './rule-packages.mjs';
import { resolveRegulatedSectorGuard } from './regulated-sector-guard.mjs';
import { resolveServiceLegalProfile } from './service-legal-router.mjs';

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

export function runCase({
  intake,
  facts = {},
  origins = {},
  collection = null,
  company_check = null,
  registry,
  user_note = '',
  draft_mode = 'request',
  invoice_reference = ''
} = {}) {
  const intakeResult = classifyIntake(intake ?? {});

  const base = {
    engine: registry?.engine_version ?? null,
    intake: intakeResult,
    legal_profile: null,
    rule_package: null,
    analysis: null,
    inkasso: null,
    document_checks: null,
    company_check: company_check ?? null,
    coverage: null,
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

  const regulatedProfile = resolveRegulatedSectorGuard(facts);
  if (regulatedProfile) {
    return {
      ...base,
      legal_profile: regulatedProfile,
      status: 'needs_clarification',
      intake: {
        ...intakeResult,
        questions: [...new Set([...(intakeResult.questions ?? []), ...(regulatedProfile.questions ?? [])])]
      },
      draft: { allowed: false, reason: regulatedProfile.reason }
    };
  }

  const legalProfile = resolveServiceLegalProfile({ route: intakeResult.route, facts });
  if (legalProfile.status !== 'ready') {
    return {
      ...base,
      legal_profile: legalProfile,
      status: 'needs_clarification',
      intake: {
        ...intakeResult,
        questions: [...new Set([...(intakeResult.questions ?? []), ...(legalProfile.questions ?? [])])]
      },
      draft: { allowed: false, reason: legalProfile.reason ?? 'Riktig juridisk hovedspor må avklares før regelanalyse.' }
    };
  }

  const rulePackage = resolveRulePackage({ route: intakeResult.route, facts, legalProfile });
  if (!rulePackage) {
    return {
      ...base,
      legal_profile: legalProfile,
      status: 'needs_clarification',
      draft: { allowed: false, reason: 'Saken kunne ikke knyttes sikkert til en aktiv regelpakke.' }
    };
  }

  const analysisInput = {
    ...facts,
    party_type: 'consumer',
    case_type: rulePackage.base_routes?.[0] ?? intakeResult.route
  };

  const invoiceAnalysis = analyzeCase(analysisInput, registry);
  const inkasso = analyzeInkasso(collection ?? {});
  const collectionOverlay = inkasso?.status && inkasso.status !== 'not_applicable';
  const documentChecks = runDocumentChecks(facts);
  const analysis = combineDocumentChecks(combineAnalysis(invoiceAnalysis, inkasso), documentChecks);
  const packageSafety = assertRulePackageCompatibility({
    analysis,
    rulePackage,
    collection: collectionOverlay
  });
  const packagedAnalysis = {
    ...analysis,
    rule_package: packageSafety.id
  };

  const coverage = buildAnalysisCoverage({
    facts: analysisInput,
    analysis: packagedAnalysis,
    document_checks: documentChecks,
    company_check
  });
  assertAnalysisCoverageSafe(coverage);

  const evidence = buildEvidenceLedger({ facts, origins, analysis: packagedAnalysis, user_note });
  assertEvidenceSafety(evidence);
  const assurance = assessAssurance({ analysis: packagedAnalysis, evidence });

  const draft = buildDraft({
    analysis: packagedAnalysis,
    registry,
    invoice_reference,
    user_note,
    mode: draft_mode
  });

  return {
    ...base,
    legal_profile: legalProfile,
    status: packagedAnalysis.status,
    rule_package: packageSafety,
    analysis: packagedAnalysis,
    inkasso,
    document_checks: documentChecks,
    company_check: company_check ?? null,
    coverage,
    evidence,
    evidence_summary: summarizeEvidence(evidence),
    assurance,
    draft
  };
}
