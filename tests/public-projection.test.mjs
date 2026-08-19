import assert from 'node:assert/strict';
import { projectFullResult, assertNoPrivateFields } from '../server/public-projection.mjs';

const registry = { rules: [
  { id: 'HTJL_32_PRICE_ESTIMATE', law: 'håndverkertjenesteloven', section: '§ 32', title: 'Prisoverslag', source_url: 'https://lovdata.no/test', last_verified: '2026-08-18', status: 'active' },
  { id: 'MFL_11_UNAGREED_PAYMENT', law: 'markedsføringsloven', section: '§ 11', title: 'Betalingskrav uten avtale', source_url: 'https://lovdata.no/test2', last_verified: '2026-08-19', status: 'active' }
] };
const internal = {
  status: 'attention',
  engine: '0.44.0',
  rule_package: { id: 'goods', allowed_rule_count: 4 },
  analysis: {
    rule_package: 'goods',
    calculations: { difference: 26000 },
    findings: [
      { code: 'ESTIMATE_ABOVE_15_CONTROL', severity: 'high', title: 'Fakturaen overstiger kontrollnivået', explanation: 'Må vurderes mot mulig pristillegg.', rule_ids: ['HTJL_32_PRICE_ESTIMATE'] },
      { code: 'ADDITIONAL_PAYMENT_AGREEMENT_NOT_FOUND', severity: 'medium', title: 'Vi finner ikke avtalegrunnlag for tilleggsbetalingen', explanation: 'Manglende dokumentasjon må avklares.', rule_ids: ['MFL_11_UNAGREED_PAYMENT'] }
    ],
    rule_ids: ['HTJL_32_PRICE_ESTIMATE', 'MFL_11_UNAGREED_PAYMENT'],
    questions: ['Er tilleggsarbeidet dokumentert?']
  },
  evidence: [
    { type: 'documented', field: 'invoice_total', value: 146000, source_id: 'doc-1', confidence: 0.99, note: 'Dokumentside 1' },
    { type: 'rule', field: 'rule_reference', value: 'HTJL_32_PRICE_ESTIMATE', source_id: 'HTJL_32_PRICE_ESTIMATE', note: 'intern' },
    { type: 'rule', field: 'rule_reference', value: 'MFL_11_UNAGREED_PAYMENT', source_id: 'MFL_11_UNAGREED_PAYMENT', note: 'intern' }
  ],
  evidence_summary: { documented: 1, rule: 2 },
  draft: { allowed: true, text: 'Hei, jeg ber om en forklaring.', reason: null }
};

const out = projectFullResult(internal, registry);
const text = JSON.stringify(out);
assert.equal(out.rules.length, 2);
assert.equal(out.rules[0].law, 'håndverkertjenesteloven');
assert.equal(out.rules[1].law, 'markedsføringsloven');
assert.equal(out.analysis.findings[0].title, 'Fakturaen overstiger kontrollnivået');
assert.equal(out.evidence.length, 1);
assert.equal(text.includes('HTJL_'), false);
assert.equal(text.includes('MFL_'), false);
assert.equal(text.includes('ESTIMATE_ABOVE_'), false);
assert.equal(text.includes('ADDITIONAL_PAYMENT_'), false);
assert.equal(text.includes('rule_package'), false);
assert.equal(text.includes('code'), false);
assertNoPrivateFields(out);

console.log('OK public paid-result projection');
