function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finiteNumber(value);
  return number != null && number > 0;
}

function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function item(id, label, status, explanation) {
  return { id, label, status, explanation };
}

function serviceLike(caseType) {
  return ['handcraft_service', 'service', 'service_quote'].includes(caseType);
}

function companyCoverage(companyCheck) {
  if (!companyCheck) {
    return item('company', 'Fakturautsteder', 'limited', 'Virksomhetsopplysninger er ikke kontrollert mot offentlig register i denne analysen.');
  }

  if (['verified', 'deleted'].includes(companyCheck.status) && companyCheck.registry) {
    return item('company', 'Fakturautsteder', 'checked', 'Virksomhetsopplysninger er kontrollert mot Brønnøysundregistrene.');
  }

  const reasons = {
    not_found: 'Virksomheten kunne ikke bekreftes sikkert mot offentlig register.',
    removed: 'Registeropplysningen var ikke tilgjengelig for sikker kontroll.',
    ambiguous: 'Firmanavnet ga ikke ett sikkert registertreff.',
    no_exact_match: 'Firmanavnet ga ikke ett sikkert registertreff.',
    invalid_organization_number: 'Organisasjonsnummeret kunne ikke valideres for sikkert registeroppslag.',
    unavailable: 'Virksomhetsregisteret var ikke tilgjengelig under kontrollen.',
    not_checked: 'Virksomhetsopplysninger er ikke kontrollert mot offentlig register i denne analysen.'
  };
  return item('company', 'Fakturautsteder', 'limited', reasons[companyCheck.status] ?? 'Virksomhetsopplysninger kunne ikke bekreftes sikkert mot offentlig register.');
}

function vatCoverage(facts, documentChecks) {
  const invoiceLines = Array.isArray(facts.invoice_lines) ? facts.invoice_lines : Array.isArray(facts.lines) ? facts.lines : [];
  const lineVatBasis = invoiceLines.some(line =>
    finiteNumber(line?.vat_rate) != null || finiteNumber(line?.vat_amount) != null || finiteNumber(line?.vat) != null
  );
  const statedVatBasis = finiteNumber(facts.stated_vat) != null || finiteNumber(facts.vat_total) != null;

  if (documentChecks?.math && (lineVatBasis || statedVatBasis)) {
    return item('vat', 'MVA', 'checked', 'MVA-regnestykket er kontrollert mot dokumenterte fakturatall.');
  }
  return item('vat', 'MVA', 'limited', 'Det er ikke nok strukturert MVA-grunnlag til å markere MVA-kontrollen som fullført.');
}

function resultMessage(summary) {
  if (summary.limited === 0) return 'Alle relevante kontrollområder har tilstrekkelig dokumentert grunnlag i denne analysen.';
  if (summary.checked === 0) return 'Dokumentgrunnlaget er for begrenset til å markere noen kontrollområder som fullført.';
  return 'Noen kontrollområder er fullført, mens andre er begrenset av dokumentasjonen som er tilgjengelig.';
}

export function buildAnalysisCoverage({ facts = {}, analysis = {}, document_checks = null, company_check = null } = {}) {
  const checked = [];
  const limited = [];
  const notApplicable = [];
  const put = entry => {
    if (entry.status === 'checked') checked.push(entry);
    else if (entry.status === 'limited') limited.push(entry);
    else notApplicable.push(entry);
  };

  const caseType = facts.case_type ?? analysis?.facts?.case_type ?? 'unknown';
  const industry = facts.industry ?? analysis?.facts?.industry ?? null;
  const invoiceLines = Array.isArray(facts.invoice_lines) ? facts.invoice_lines : Array.isArray(facts.lines) ? facts.lines : [];
  const agreementLines = Array.isArray(facts.agreement_lines) ? facts.agreement_lines : [];

  const hasAgreementBasis = positive(facts.agreed_price) || nonEmptyArray(agreementLines) || document_checks?.comparison != null;
  put(hasAgreementBasis
    ? item('agreement_price', 'Avtale og pris', 'checked', 'Dokumentert pris- eller avtalegrunnlag kan sammenlignes med fakturaen.')
    : item('agreement_price', 'Avtale og pris', 'limited', 'Avtalt pris eller annet prisgrunnlag er ikke dokumentert godt nok til full sammenligning.'));

  put(document_checks?.math
    ? item('invoice_math', 'Regnestykke og fakturalinjer', 'checked', 'Fakturalinjer og oppgitte summer er kontrollert matematisk.')
    : item('invoice_math', 'Regnestykke og fakturalinjer', 'limited', 'Fakturalinjene er ikke strukturert godt nok til full matematisk linjekontroll.'));

  const specificationObserved = hasOwn(facts, 'invoice_specification_sufficient') || Array.isArray(facts.missing_formal_fields) || nonEmptyArray(invoiceLines);
  put(specificationObserved
    ? item('invoice_itemization', 'Fakturaspesifikasjon', 'checked', 'Fakturaens spesifikasjon er vurdert ut fra dokumentgrunnlaget.')
    : item('invoice_itemization', 'Fakturaspesifikasjon', 'limited', 'Det er ikke nok strukturert grunnlag til å markere spesifikasjonskontrollen som fullført.'));

  if (serviceLike(caseType)) {
    put(hasOwn(facts, 'additional_work_detected')
      ? item('additional_work', 'Tilleggsarbeid og endringer', 'checked', 'Materialet inneholder eksplisitt grunnlag for å vurdere tilleggsarbeid og endringer.')
      : item('additional_work', 'Tilleggsarbeid og endringer', 'limited', 'Tilleggsarbeid og endringer er ikke kartlagt tydelig nok i dokumentgrunnlaget.'));
  } else {
    put(item('additional_work', 'Tilleggsarbeid og endringer', 'not_applicable', 'Denne kontrollen er ikke relevant for den klassifiserte sakstypen.'));
  }

  const preliminaryFee = positive(facts.preliminary_examination_fee);
  const diagnosticsRelevant = industry === 'vehicle_repair' || preliminaryFee;
  if (!diagnosticsRelevant) {
    put(item('diagnostics', 'Diagnose og forundersøkelse', 'not_applicable', 'Ingen relevant diagnose- eller forundersøkelseskostnad er identifisert.'));
  } else if (preliminaryFee && hasOwn(facts, 'preliminary_fee_disclosed_beforehand')) {
    put(item('diagnostics', 'Diagnose og forundersøkelse', 'checked', 'Dokumentert diagnose- eller forundersøkelseskostnad er vurdert mot opplysninger før arbeidet.'));
  } else {
    put(item('diagnostics', 'Diagnose og forundersøkelse', 'limited', 'Dokumentasjonen er ikke tydelig nok til å fullføre kontrollen av diagnose eller forundersøkelse.'));
  }

  put(vatCoverage(facts, document_checks));
  put(companyCoverage(company_check));

  put(Array.isArray(analysis?.rule_ids) && analysis?.supported !== false
    ? item(
        'rules',
        'Regel- og paragrafkontroll',
        'checked',
        analysis.rule_ids.length
          ? 'Dokumenterte funn er vurdert mot aktive, kontrollerte regelspor.'
          : 'Regelmotoren er kjørt, men ingen paragraf var nødvendig eller sikkert relevant for resultatet.'
      )
    : item('rules', 'Regel- og paragrafkontroll', 'limited', 'Regelmotorens vurdering mangler i analysegrunnlaget.'));

  const summary = {
    checked: checked.length,
    limited: limited.length,
    not_applicable: notApplicable.length
  };

  return {
    checked,
    limited,
    not_applicable: notApplicable,
    summary,
    message: resultMessage(summary)
  };
}

export function assertAnalysisCoverageSafe(coverage) {
  const entries = [...(coverage?.checked ?? []), ...(coverage?.limited ?? []), ...(coverage?.not_applicable ?? [])];
  const ids = entries.map(entry => entry.id);
  if (ids.length !== new Set(ids).size) throw new Error('Analysis coverage contains duplicate categories.');
  for (const entry of entries) {
    if (!['checked', 'limited', 'not_applicable'].includes(entry.status)) throw new Error('Analysis coverage contains invalid status.');
    if (!entry.label || !entry.explanation) throw new Error('Analysis coverage entry requires customer-safe label and explanation.');
    if (/HTJL_|FKJL_|MFL_|POF_|BOF_|INK_|rule_id|finding_code|fail-closed|OCR/i.test(`${entry.label} ${entry.explanation}`)) {
      throw new Error('Internal implementation language leaked into analysis coverage.');
    }
  }
  return true;
}
