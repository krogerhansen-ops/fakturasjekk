export function analyzeInkasso(input = {}) {
  const result = {
    status: 'not_applicable',
    findings: [],
    rule_ids: [],
    questions: [],
    principal_claim_effect: 'not_assessed'
  };

  const stage = input.stage ?? 'none';
  if (stage === 'none' || stage === 'invoice' || stage === 'reminder') return result;

  result.status = 'ok';
  result.principal_claim_effect = 'separate_from_collection_compliance';

  if (stage === 'collection_notice') {
    if (Number.isFinite(Number(input.payment_deadline_days)) && Number(input.payment_deadline_days) < 14) {
      result.findings.push({
        code: 'INKASSO_NOTICE_SHORT_DEADLINE',
        severity: 'high',
        title: 'Inkassovarselet ser ut til å ha for kort betalingsfrist',
        explanation: 'Aktiv inkassolov § 9 krever minst 14 dagers betalingsfrist regnet fra varslet ble sendt.',
        rule_ids: ['INK_9_NOTICE']
      });
      result.rule_ids.push('INK_9_NOTICE');
    }
  }

  if (stage === 'payment_request') {
    if (Number.isFinite(Number(input.payment_deadline_days)) && Number(input.payment_deadline_days) < 14) {
      result.findings.push({
        code: 'PAYMENT_REQUEST_SHORT_DEADLINE',
        severity: 'high',
        title: 'Betalingsoppfordringen ser ut til å ha for kort frist',
        explanation: 'Aktiv inkassolov § 10 krever minst 14 dagers frist for å betale eller komme med innsigelser.',
        rule_ids: ['INK_10_PAYMENT_REQUEST']
      });
      result.rule_ids.push('INK_10_PAYMENT_REQUEST');
    }

    if (input.claim_doubt_known === true && input.doubt_assessed_before_request !== true) {
      result.findings.push({
        code: 'CLAIM_DOUBT_NOT_ASSESSED',
        severity: 'high',
        title: 'Tvil om kravet må vurderes før betalingsoppfordring',
        explanation: '§ 10 krever at forhold som gir grunn til tvil om kravet er rettmessig blir vurdert før betalingsoppfordringen sendes.',
        rule_ids: ['INK_10_PAYMENT_REQUEST']
      });
      result.rule_ids.push('INK_10_PAYMENT_REQUEST');
    }
  }

  if (input.claim_disputed === true) {
    if (!input.dispute_documentation_provided) {
      result.questions.push('Hva er innsigelsen mot hovedkravet, og finnes det dokumentasjon som støtter den?');
    }

    if (input.ordinary_collection_continues === true) {
      result.findings.push({
        code: 'DISPUTED_CLAIM_ORDINARY_COLLECTION',
        severity: 'high',
        title: 'Bestridt krav ser ut til å bli drevet videre som ordinær inkasso',
        explanation: 'Et reelt omtvistet krav skal ikke uten videre behandles som et ubestridt krav i ordinær inkasso. Dette må vurderes mot god inkassoskikk og reglene om innsigelsesbehandling.',
        rule_ids: ['INK_8_GOOD_PRACTICE', 'INK_10_PAYMENT_REQUEST']
      });
      result.rule_ids.push('INK_8_GOOD_PRACTICE', 'INK_10_PAYMENT_REQUEST');
    }

    if (input.dispute_reasonable === true && Number(input.collection_costs ?? 0) > 0) {
      result.findings.push({
        code: 'COLLECTION_COSTS_WITH_REASONABLE_DISPUTE',
        severity: 'high',
        title: 'Inkassokostnader må vurderes særskilt ved rimelig begrunnet innsigelse',
        explanation: '§ 17 sier at inndrivingskostnader ikke kan kreves erstattet dersom skyldneren hadde innsigelser som det var rimelig grunn til å få vurdert før inndrivingen ble satt i verk, med lovens nærmere forbehold.',
        rule_ids: ['INK_17_COLLECTION_COSTS']
      });
      result.rule_ids.push('INK_17_COLLECTION_COSTS');
    }
  }

  if (input.unreasonable_pressure === true) {
    result.findings.push({
      code: 'POSSIBLE_BAD_COLLECTION_PRACTICE',
      severity: 'high',
      title: 'Mulig brudd på god inkassoskikk',
      explanation: 'Inkassometoder som utsetter noen for urimelig påtrykk, skade eller ulempe skal vurderes mot inkassoloven § 8.',
      rule_ids: ['INK_8_GOOD_PRACTICE']
    });
    result.rule_ids.push('INK_8_GOOD_PRACTICE');
  }

  result.rule_ids = [...new Set(result.rule_ids)];
  if (result.findings.some(f => f.severity === 'high')) result.status = 'attention';
  else if (result.findings.length) result.status = 'review';

  return result;
}
