function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function item(id, label, status, explanation) {
  return { id, label, status, explanation };
}

function mathHasComputableEvidence(math) {
  if (!math) return false;
  if ([math.calculated_subtotal, math.calculated_total_from_stated, math.calculated_total_from_lines]
    .some(value => finiteNumber(value) != null)) return true;
  return (math.line_checks ?? []).some(line =>
    finiteNumber(line?.expected_amount) != null || finiteNumber(line?.stated_amount) != null
  );
}

function mathHasVatEvidence(math, facts) {
  if (!math) return false;
  if (finiteNumber(facts?.stated_vat) != null) return true;
  return (math.line_checks ?? []).some(line =>
    finiteNumber(line?.vat_rate) != null || finiteNumber(line?.stated_vat) != null || finiteNumber(line?.expected_vat) != null
  );
}

function companyChecked(companyCheck) {
  return ['verified', 'matched'].includes(companyCheck?.status);
}

function push(target, id, label, status, explanation) {
  target.push(item(id, label, status, explanation));
}

/**
 * Customer-facing coverage is deliberately conservative. An area is only
 * "checked" when the current run contains an explicit execution/evidence
 * signal for that control. Missing data is "limited", never silently treated
 * as a successful check.
 */
export function buildAnalysisCoverage({ facts = {}, analysis = {}, document_checks = null, company_check = null } = {}) {
  const checked = [];
  const limited = [];
  const not_applicable = [];
  const caseType = analysis?.facts?.case_type ?? facts?.case_type ?? 'unknown';

  if (document_checks?.comparison) {
    push(checked, 'agreement_comparison', 'Avtale/tilbud mot faktura', 'checked', 'Dokumentlinjer fra avtale eller tilbud er sammenlignet med dokumentlinjene på fakturaen.');
  } else {
    push(limited, 'agreement_comparison', 'Avtale/tilbud mot faktura', 'limited', 'Det finnes ikke et tilstrekkelig strukturert avtale-/tilbudsgrunnlag i denne kjøringen til full dokumentsammenligning.');
  }

  if (mathHasComputableEvidence(document_checks?.math)) {
    push(checked, 'invoice_math', 'Regnestykke og fakturalinjer', 'checked', 'Fakturalinjene har vært gjennom den deterministiske regnekontrollen med beregnbare dokumentverdier.');
  } else {
    push(limited, 'invoice_math', 'Regnestykke og fakturalinjer', 'limited', 'Dokumentdataene er ikke komplette nok til å markere fakturaregnestykket som kontrollert.');
  }

  if (typeof facts?.invoice_specification_sufficient === 'boolean' || Array.isArray(facts?.missing_formal_fields)) {
    push(checked, 'invoice_itemization', 'Fakturaspesifikasjon', 'checked', 'Strukturerte dokumentfakta inneholder et eksplisitt grunnlag for kontroll av spesifikasjon/formelle fakturafelt.');
  } else {
    push(limited, 'invoice_itemization', 'Fakturaspesifikasjon', 'limited', 'Det mangler et eksplisitt strukturert grunnlag for å markere fakturaspesifikasjonen som kontrollert.');
  }

  const serviceLike = ['handcraft_service', 'service', 'service_quote'].includes(caseType);
  if (!serviceLike) {
    push(not_applicable, 'additional_work', 'Tilleggsarbeid og endringer', 'not_applicable', 'Tilleggsarbeidskontrollen er ikke relevant for den klassifiserte sakstypen.');
  } else if (typeof facts?.additional_work_detected === 'boolean') {
    push(checked, 'additional_work', 'Tilleggsarbeid og endringer', 'checked', 'Dokumentgrunnlaget inneholder en eksplisitt vurdering av om tilleggsarbeid/endringer er identifisert.');
  } else {
    push(limited, 'additional_work', 'Tilleggsarbeid og endringer', 'limited', 'Dokumentgrunnlaget er ikke eksplisitt nok til å markere tilleggsarbeid/endringer som kontrollert.');
  }

  if (caseType !== 'handcraft_service') {
    push(not_applicable, 'preliminary_examination', 'Diagnose og forundersøkelse', 'not_applicable', 'Denne kontrollen er ikke del av det valgte hovedsporet for saken.');
  } else if (!hasOwn(facts, 'preliminary_examination_fee')) {
    push(limited, 'preliminary_examination', 'Diagnose og forundersøkelse', 'limited', 'Det finnes ikke et eksplisitt dokumentfaktum om eventuell diagnose-/forundersøkelseskostnad.');
  } else {
    const fee = finiteNumber(facts.preliminary_examination_fee);
    if (fee == null) {
      push(limited, 'preliminary_examination', 'Diagnose og forundersøkelse', 'limited', 'Opplysningen om diagnose-/forundersøkelseskostnad kan ikke brukes sikkert i kontrollen.');
    } else if (fee <= 0) {
      push(not_applicable, 'preliminary_examination', 'Diagnose og forundersøkelse', 'not_applicable', 'Dokumentgrunnlaget angir ingen positiv diagnose-/forundersøkelseskostnad å kontrollere.');
    } else if (typeof facts?.preliminary_fee_disclosed_beforehand === 'boolean') {
      push(checked, 'preliminary_examination', 'Diagnose og forundersøkelse', 'checked', 'En dokumentert diagnose-/forundersøkelseskostnad er kontrollert mot eksplisitt informasjon om forhåndsopplysning.');
    } else {
      push(limited, 'preliminary_examination', 'Diagnose og forundersøkelse', 'limited', 'En diagnose-/forundersøkelseskostnad er identifisert, men forhåndsopplysning er ikke dokumentert tydelig nok.');
    }
  }

  if (mathHasVatEvidence(document_checks?.math, facts)) {
    push(checked, 'vat_arithmetic', 'MVA-regnestykke', 'checked', 'Oppgitte MVA-verdier/satser har vært med i regnekontrollen. Dette sier ikke alene at riktig lovbestemt MVA-sats er brukt.');
  } else {
    push(limited, 'vat_arithmetic', 'MVA-regnestykke', 'limited', 'Det finnes ikke nok eksplisitte MVA-data til å markere MVA-regnestykket som kontrollert.');
  }

  if (companyChecked(company_check)) {
    push(checked, 'company', 'Fakturautsteder', 'checked', 'Virksomhetsopplysninger er kontrollert mot Brønnøysundregistrene i denne kjøringen.');
  } else {
    push(limited, 'company', 'Fakturautsteder', 'limited', company_check
      ? 'Registerkontrollen ga ikke et sikkert treff som kan markeres som kontrollert.'
      : 'Denne kjøringen inneholder ikke en bekreftet registerkontroll av fakturautsteder.');
  }

  if (Array.isArray(analysis?.rule_ids) && analysis?.supported !== false) {
    push(checked, 'rules', 'Regel- og paragrafkontroll', 'checked', analysis.rule_ids.length
      ? 'Regelmotoren er kjørt, og dokumenterte forhold er koblet til aktive kontrollerte regelspor der vilkårene traff.'
      : 'Regelmotoren er kjørt uten at et aktivt regelspor traff sikkert. Det betyr ikke at alle mulige juridiske spørsmål er avklart.');
  } else {
    push(limited, 'rules', 'Regel- og paragrafkontroll', 'limited', 'Denne kjøringen inneholder ikke et komplett signal om at regelmotoren er gjennomført.');
  }

  return {
    checked,
    limited,
    not_applicable,
    summary: {
      checked: checked.length,
      limited: limited.length,
      not_applicable: not_applicable.length,
      has_limitations: limited.length > 0
    }
  };
}
