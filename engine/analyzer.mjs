const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function sumLines(lines = []) {
  return round2(lines.reduce((sum, line) => sum + Number(line.quantity ?? 1) * Number(line.unit_price ?? line.amount ?? 0), 0));
}

export function detectExactDuplicates(lines = []) {
  const seen = new Map();
  const duplicates = [];
  lines.forEach((line, index) => {
    const key = [norm(line.description), Number(line.quantity ?? 1), Number(line.unit_price ?? line.amount ?? 0)].join('|');
    if (seen.has(key)) duplicates.push({ first_index: seen.get(key), duplicate_index: index, line });
    else seen.set(key, index);
  });
  return duplicates;
}

export function analyzeCase(input, registry) {
  const rules = new Map((registry?.rules ?? []).map(rule => [rule.id, rule]));
  const result = {
    status: 'ok',
    supported: true,
    facts: {},
    calculations: {},
    findings: [],
    rule_ids: [],
    questions: []
  };

  if (input.party_type !== 'consumer') {
    result.status = 'unsupported';
    result.supported = false;
    result.findings.push({
      code: 'B2B_NOT_SUPPORTED',
      severity: 'stop',
      title: 'Bedriftsfaktura er ikke støttet i forbruker-V1',
      explanation: 'Regelmotoren skal ikke bruke forbrukerregler på et B2B-forhold.'
    });
    return result;
  }

  const invoiceTotal = Number(input.invoice_total ?? 0);
  const agreed = Number(input.agreed_price ?? 0);
  const lineSum = sumLines(input.lines);
  const diff = round2(invoiceTotal - agreed);

  result.facts.party_type = input.party_type;
  result.facts.case_type = input.case_type ?? 'unknown';
  if (input.industry) result.facts.industry = input.industry;
  result.calculations.invoice_total = invoiceTotal;
  result.calculations.agreed_price = agreed;
  result.calculations.difference = diff;
  result.calculations.line_sum = lineSum;

  if (input.lines?.length && Math.abs(lineSum - invoiceTotal) > 0.01) {
    result.findings.push({
      code: 'LINE_SUM_MISMATCH',
      severity: 'high',
      title: 'Fakturalinjene summerer ikke til oppgitt total',
      explanation: `Linjesum ${lineSum} avviker fra fakturatotal ${invoiceTotal}.`
    });
  }

  const duplicates = detectExactDuplicates(input.lines);
  if (duplicates.length) {
    result.findings.push({
      code: 'EXACT_DUPLICATE_LINES',
      severity: 'medium',
      title: 'Mulig dobbeltføring',
      explanation: `${duplicates.length} identisk(e) fakturalinje(r) er funnet. Dette er et dokumentavvik som bør forklares før juridisk vurdering.`,
      evidence: duplicates
    });
  }

  if (input.case_type === 'handcraft_service' && input.price_basis === 'estimate' && agreed > 0) {
    const ceiling = round2(agreed * 1.15);
    result.calculations.estimate_control_ceiling_15pct = ceiling;
    if (invoiceTotal > ceiling) {
      result.findings.push({
        code: 'ESTIMATE_ABOVE_15_CONTROL',
        severity: 'high',
        title: 'Fakturaen overstiger 15 %-kontrollnivået for prisoverslaget',
        explanation: 'Dette er ikke alene en endelig konklusjon. Mulig rett til pristillegg etter § 33 må vurderes før kravet kan klassifiseres.',
        rule_ids: ['HTJL_32_PRICE_ESTIMATE', 'HTJL_33_SURCHARGE']
      });
      result.rule_ids.push('HTJL_32_PRICE_ESTIMATE', 'HTJL_33_SURCHARGE');
      if (input.surcharge_documented !== true) {
        result.questions.push('Er tilleggsarbeidet eller det uforutsette forholdet dokumentert og avtalt/utført innenfor vilkårene for pristillegg?');
      }
    }
  }

  if (input.case_type === 'handcraft_service' && input.price_increase_after_start === true && input.customer_notified === false) {
    result.findings.push({
      code: 'HANDCRAFT_PRICE_INCREASE_NO_NOTICE',
      severity: 'medium',
      title: 'Prisøkning underveis uten dokumentert varsling',
      explanation: 'Materialet viser en prisøkning etter oppstart og manglende dokumentert varsling. Håndverkertjenesteloven § 7 blir relevant dersom prisen ble betydelig høyere enn forbrukeren måtte vente. Fakturasjekk setter ingen egen prosentgrense for dette.',
      rule_ids: ['HTJL_7_DUTY_TO_ADVISE']
    });
    result.rule_ids.push('HTJL_7_DUTY_TO_ADVISE');
    result.questions.push('Hva var det dokumenterte prisgrunnlaget før prisøkningen, og når fikk kunden eventuelt beskjed om den nye kostnaden?');
  }

  if (input.case_type === 'handcraft_service' && input.additional_work_detected === true) {
    if (input.additional_work_authorization_documented === false) {
      result.findings.push({
        code: 'ADDITIONAL_WORK_NO_DOCUMENTED_AUTHORIZATION',
        severity: 'high',
        title: 'Tilleggsarbeid uten dokumentert avklaring',
        explanation: 'Vi finner tilleggsarbeid i materialet, men ingen dokumentasjon som viser at kunden ble kontaktet eller at arbeidet ble avklart. Lovens unntak må fortsatt vurderes før det kan trekkes en endelig konklusjon.',
        rule_ids: ['HTJL_9_ADDITIONAL_WORK', 'HTJL_33_SURCHARGE']
      });
      result.rule_ids.push('HTJL_9_ADDITIONAL_WORK', 'HTJL_33_SURCHARGE');
    } else if (input.additional_work_authorization_documented !== true) {
      result.findings.push({
        code: 'ADDITIONAL_WORK_AUTHORIZATION_UNCLEAR',
        severity: 'medium',
        title: 'Avtalegrunnlaget for tilleggsarbeidet er uklart',
        explanation: 'Tilleggsarbeid er identifisert, men materialet er ikke tydelig nok til å fastslå hvordan arbeidet ble avklart med kunden.',
        rule_ids: ['HTJL_9_ADDITIONAL_WORK', 'HTJL_33_SURCHARGE']
      });
      result.rule_ids.push('HTJL_9_ADDITIONAL_WORK', 'HTJL_33_SURCHARGE');
      result.questions.push('Finnes det SMS, e-post, arbeidsordre eller annen dokumentasjon som viser hvordan tilleggsarbeidet ble avklart?');
    }

    if (input.additional_work_price_documented === false) {
      result.findings.push({
        code: 'ADDITIONAL_WORK_PRICE_BASIS_MISSING',
        severity: 'medium',
        title: 'Prisgrunnlaget for tilleggsarbeidet mangler',
        explanation: 'Tilleggsarbeidet er fakturert, men vi finner ikke et dokumentert prisgrunnlag for tillegget i materialet som er kontrollert.',
        rule_ids: ['HTJL_33_SURCHARGE']
      });
      result.rule_ids.push('HTJL_33_SURCHARGE');
    }
  }

  const preliminaryFee = Number(input.preliminary_examination_fee ?? 0);
  if (input.case_type === 'handcraft_service' && preliminaryFee > 0) {
    result.calculations.preliminary_examination_fee = preliminaryFee;
    if (input.preliminary_fee_disclosed_beforehand === false) {
      result.findings.push({
        code: 'PRELIMINARY_FEE_NOT_DISCLOSED',
        severity: 'high',
        title: 'Betaling for diagnose eller forundersøkelse var ikke dokumentert på forhånd',
        explanation: 'Det er fakturert for en forundersøkelse/diagnose, mens materialet ikke dokumenterer at betaling for dette ble opplyst om eller tatt forbehold om på forhånd.',
        rule_ids: ['HTJL_34_PRELIMINARY_EXAMINATION']
      });
      result.rule_ids.push('HTJL_34_PRELIMINARY_EXAMINATION');
    } else if (input.preliminary_fee_disclosed_beforehand !== true) {
      result.findings.push({
        code: 'PRELIMINARY_FEE_DISCLOSURE_UNCLEAR',
        severity: 'medium',
        title: 'Det er uklart om diagnosekostnaden ble opplyst på forhånd',
        explanation: 'Fakturaen inneholder en diagnose-/forundersøkelsespost, men dokumentasjonen er ikke tydelig nok til å avgjøre om betalingsplikten ble opplyst om på forhånd.',
        rule_ids: ['HTJL_34_PRELIMINARY_EXAMINATION']
      });
      result.rule_ids.push('HTJL_34_PRELIMINARY_EXAMINATION');
      result.questions.push('Finnes det bestilling, arbeidsordre eller annen dokumentasjon som viser at diagnose-/forundersøkelseskostnaden ble opplyst på forhånd?');
    }
  }

  const invoiceFee = Number(input.invoice_fee ?? 0);
  if (invoiceFee > 0 && input.case_type === 'handcraft_service') {
    result.findings.push({
      code: 'HANDCRAFT_INVOICE_FEE',
      severity: 'high',
      title: 'Fakturagebyr i håndverkertjeneste',
      explanation: 'Et særskilt gebyr for skriving/sending av regning skal kontrolleres mot håndverkertjenesteloven § 36.',
      rule_ids: ['HTJL_36_INVOICE']
    });
    result.rule_ids.push('HTJL_36_INVOICE');
  }

  if (invoiceFee > 0 && input.case_type === 'goods') {
    const severity = input.invoice_fee_agreed === false ? 'high' : 'medium';
    result.findings.push({
      code: 'GOODS_INVOICE_FEE',
      severity,
      title: 'Fakturagebyr må være klart avtalt',
      explanation: input.invoice_fee_agreed === false
        ? 'Testgrunnlaget sier at gebyret ikke er avtalt.'
        : 'Det må avklares om gebyret klart følger av avtalen.',
      rule_ids: ['FKJL_37_PRICE_AND_FEE']
    });
    result.rule_ids.push('FKJL_37_PRICE_AND_FEE');
  }

  const extraPaymentAmount = Number(input.additional_payment_amount ?? 0);
  if (extraPaymentAmount > 0 && ['not_found', 'contradicted'].includes(input.additional_payment_agreement_status)) {
    const contradicted = input.additional_payment_agreement_status === 'contradicted';
    result.calculations.additional_payment_amount = extraPaymentAmount;
    result.findings.push({
      code: contradicted ? 'ADDITIONAL_PAYMENT_CONTRADICTS_AGREEMENT' : 'ADDITIONAL_PAYMENT_AGREEMENT_NOT_FOUND',
      severity: contradicted ? 'high' : 'medium',
      title: contradicted ? 'Tilleggsbetalingen avviker fra dokumentert avtale' : 'Vi finner ikke avtalegrunnlag for tilleggsbetalingen',
      explanation: contradicted
        ? 'Dokumentene som er kontrollert peker på at den separate tilleggsbetalingen ikke inngår i avtalen. Dette må avklares mot markedsføringsloven § 11 før det trekkes en endelig konklusjon.'
        : 'Det kreves en separat tilleggsbetaling, men vi finner ikke dokumentasjon i materialet som viser at den ble avtalt. Manglende dokumentasjon er ikke det samme som bevist fravær av avtale.',
      rule_ids: ['MFL_11_UNAGREED_PAYMENT']
    });
    result.rule_ids.push('MFL_11_UNAGREED_PAYMENT');
  }

  if (input.case_type === 'service_quote' && input.price_increase_after_start === true) {
    result.findings.push({
      code: 'SERVICE_QUOTE_PRICE_INCREASE',
      severity: input.customer_notified === false ? 'high' : 'medium',
      title: 'Prisøkning etter oppstart må kontrolleres mot pristilbudet',
      explanation: input.customer_notified === false
        ? 'Testgrunnlaget dokumenterer at kunden ikke ble varslet.'
        : 'Det må avklares når og hvordan kunden ble orientert om prisøkningen.',
      rule_ids: ['POF_12_QUOTE']
    });
    result.rule_ids.push('POF_12_QUOTE');
  }

  if (input.invoice_specification_sufficient === false) {
    const fixedHandcraftWithoutRequest = input.case_type === 'handcraft_service' && input.price_basis === 'fixed' && input.itemized_invoice_requested !== true;
    if (!fixedHandcraftWithoutRequest && ['handcraft_service', 'service_quote', 'service'].includes(input.case_type)) {
      const ids = input.case_type === 'handcraft_service'
        ? ['HTJL_36_INVOICE', 'POF_13_ITEMIZED_INVOICE']
        : ['POF_13_ITEMIZED_INVOICE'];
      result.findings.push({
        code: 'SERVICE_INVOICE_NOT_ITEMIZED',
        severity: 'medium',
        title: 'Regningen er ikke spesifisert godt nok til sikker kontroll',
        explanation: 'Materialet er ikke tilstrekkelig spesifisert til at varer/tjenester og beregnede priser kan kontrolleres sikkert. Fakturasjekk konkluderer derfor ikke om de underliggende postene.',
        rule_ids: ids
      });
      result.rule_ids.push(...ids);
    }
  }

  const sellerIdentityIssues = [];
  if (input.seller_org_number_missing === true) sellerIdentityIssues.push('selgers organisasjonsnummer mangler');
  if (input.seller_org_number_mismatch === true) sellerIdentityIssues.push('organisasjonsnummeret samsvarer ikke med registeropplysningen');
  if (input.seller_mva_marker_mismatch === true) sellerIdentityIssues.push('MVA-angivelsen samsvarer ikke med registerstatusen');
  if (sellerIdentityIssues.length) {
    result.findings.push({
      code: 'SELLER_IDENTITY_FORMAL_MISMATCH',
      severity: 'medium',
      title: 'Opplysninger om fakturautsteder bør kontrolleres',
      explanation: `${sellerIdentityIssues.join('; ')}. Dette er et dokument-/registeravvik og betyr ikke i seg selv at hovedkravet bortfaller.`,
      rule_ids: ['BOF_5_1_2_PARTIES']
    });
    result.rule_ids.push('BOF_5_1_2_PARTIES');
  }

  const missingFormal = input.missing_formal_fields ?? [];
  if (missingFormal.length) {
    result.findings.push({
      code: 'FORMAL_INVOICE_FIELDS',
      severity: 'medium',
      title: 'Mulige formelle mangler i salgsdokumentet',
      explanation: `Mangler/uklare felt: ${missingFormal.join(', ')}. Dette skal ikke automatisk behandles som at hovedkravet bortfaller.`,
      rule_ids: ['BOF_5_1_1_SALES_DOC']
    });
    result.rule_ids.push('BOF_5_1_1_SALES_DOC');
  }

  result.rule_ids = [...new Set(result.rule_ids)].filter(id => rules.get(id)?.status === 'active');

  if (!result.findings.length) {
    result.status = 'clean';
    result.findings.push({
      code: 'NO_DOCUMENTED_DEVIATION',
      severity: 'ok',
      title: 'Ingen dokumenterte avvik funnet',
      explanation: 'Kontrollen fant ikke et dokumentert pris-, regne- eller regelavvik i testgrunnlaget.'
    });
  } else if (result.findings.some(f => f.severity === 'high' || f.severity === 'stop')) {
    result.status = 'attention';
  } else {
    result.status = 'review';
  }

  return result;
}
