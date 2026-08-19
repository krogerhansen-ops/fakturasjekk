function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function item(id, label, status, explanation) {
  return { id, label, status, explanation };
}

function companyStatus(companyCheck) {
  const status = companyCheck?.status;
  if (status === 'verified' || status === 'matched') return 'checked';
  if (['not_found', 'ambiguous', 'unavailable', 'removed', 'invalid_input'].includes(status)) return 'limited';
  return companyCheck ? 'limited' : 'limited';
}

export function buildAnalysisCoverage({ input = {}, analysis = {}, document_checks = null, company_check = null } = {}) {
  const checked = [];
  const limited = [];
  const not_applicable = [];

  const agreed = finitePositive(input.agreed_price)
    ? Number(input.agreed_price)
    : (finitePositive(analysis?.calculations?.agreed_price) ? Number(analysis.calculations.agreed_price) : null);

  if (agreed != null) {
    checked.push(item('agreement_price', 'Avtale og pris', 'checked', 'Dokumentert prisgrunnlag kan sammenlignes med fakturaen.'));
  } else {
    limited.push(item('agreement_price', 'Avtale og pris', 'limited', 'Avtalt pris eller annet prisgrunnlag er ikke dokumentert godt nok til full sammenligning.'));
  }

  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (finitePositive(input.invoice_total) && lines.length > 0) {
    checked.push(item('invoice_math', 'Regnestykke og linjer', 'checked', 'Fakturatotal kan sammenlignes med dokumenterte vare-/tjenestelinjer.'));
  } else {
    limited.push(item('invoice_math', 'Regnestykke og linjer', 'limited', 'Fakturalinjene er ikke komplette nok til full linjesumkontroll.'));
  }

  if (hasOwn(input, 'invoice_specification_sufficient') || (Array.isArray(input.missing_formal_fields) && input.missing_formal_fields.length > 0)) {
    checked.push(item('invoice_itemization', 'Fakturaspesifikasjon', 'checked', 'Spesifikasjon/formelle fakturafelt er vurdert ut fra dokumentgrunnlaget.'));
  } else {
    limited.push(item('invoice_itemization', 'Fakturaspesifikasjon', 'limited', 'Det er ikke nok strukturert grunnlag til å konkludere om fullstendig spesifikasjon.'));
  }

  const serviceLike = ['handcraft_service', 'service', 'service_quote'].includes(input.case_type);
  if (serviceLike) {
    if (hasOwn(input, 'additional_work_detected')) {
      checked.push(item('additional_work', 'Tilleggsarbeid og endringer', 'checked', 'Materialet inneholder eksplisitt grunnlag for å vurdere om det finnes tilleggsarbeid/endringer.'));
    } else {
      limited.push(item('additional_work', 'Tilleggsarbeid og endringer', 'limited', 'Tilleggsarbeid er ikke eksplisitt kartlagt i det strukturerte dokumentgrunnlaget.'));
    }
  } else {
    not_applicable.push(item('additional_work', 'Tilleggsarbeid og endringer', 'not_applicable', 'Denne kontrollen er ikke relevant for den klassifiserte sakstypen.'));
  }

  const repairLike = input.industry === 'vehicle_repair' || input.case_type === 'handcraft_service';
  if (repairLike && finitePositive(input.preliminary_examination_fee)) {
    if (hasOwn(input, 'preliminary_fee_disclosed_beforehand')) {
      checked.push(item('diagnostics', 'Diagnose og forundersøkelse', 'checked', 'Dokumentert diagnose-/forundersøkelseskostnad kan vurderes mot forhåndsopplysninger.'));
    } else {
      limited.push(item('diagnostics', 'Diagnose og forundersøkelse', 'limited', 'Diagnosekostnad er funnet, men dokumentasjonen viser ikke sikkert om betaling ble opplyst på forhånd.'));
    }
  } else {
    not_applicable.push(item('diagnostics', 'Diagnose og forundersøkelse', 'not_applicable', 'Ingen relevant diagnose-/forundersøkelseskostnad er identifisert.'));
  }

  if (document_checks?.vat_check) {
    checked.push(item('vat', 'MVA', 'checked', 'MVA-grunnlag og beregning er vurdert med dokumenterte tall.'));
  } else {
    limited.push(item('vat', 'MVA', 'limited', 'MVA kan ikke markeres som fullstendig kontrollert uten et dokumentert MVA-grunnlag.'));
  }

  if (companyStatus(company_check) === 'checked') {
    checked.push(item('company', 'Fakturautsteder', 'checked', 'Virksomhetsopplysninger er kontrollert mot offentlig register.'));
  } else {
    limited.push(item('company', 'Fakturautsteder', 'limited', 'Virksomhetsopplysninger er ikke sikkert bekreftet mot offentlig register i denne analysen.'));
  }

  if (Array.isArray(analysis?.rule_ids)) {
    checked.push(item('rules', 'Regel- og paragrafkontroll', 'checked', analysis.rule_ids.length
      ? 'Dokumenterte funn er vurdert mot aktive, kontrollerte regelspor.'
      : 'Regelmotoren er kjørt, men ingen paragraf var nødvendig eller sikkert relevant for resultatet.'));
  } else {
    limited.push(item('rules', 'Regel- og paragrafkontroll', 'limited', 'Regelmotorens vurdering mangler i analysegrunnlaget.'));
  }

  return {
    checked,
    limited,
    not_applicable,
    summary: {
      checked: checked.length,
      limited: limited.length,
      not_applicable: not_applicable.length
    }
  };
}
