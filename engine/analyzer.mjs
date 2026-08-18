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

  result.rule_ids = [...new Set(result.rule_ids)].filter(id => rules.has(id));

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
