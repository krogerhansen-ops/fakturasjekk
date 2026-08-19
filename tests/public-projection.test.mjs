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
  company_check: {
    status: 'verified',
    registry: {
      organization_number: '509100675',
      name: 'Demo AS',
      organization_form: { code: 'AS', description: 'Aksjeselskap' },
      registered_in_vat: true,
      registered_in_business_register: true,
      bankrupt: false,
      under_liquidation: false,
      under_forced_liquidation_or_dissolution: false,
      deleted_date: null,
      registration_date: '2020-01-01',
      business_code: { code: '47.400', description: 'Detaljhandel' },
      business_address: null,
      source: 'brreg_enhetsregisteret',
      source_version: 'v2'
    },
    comparison: { organization_number: 'matches', name: 'different', vat_marker: 'matches' },
    flags: ['seller_name_mismatch'],
    customer_note: 'Navnet bør kontrolleres.',
    purge_cache: false,
    error_code: null
  },
  evidence: [
    { type: 'documented', field: 'invoice_total', value: 146000, source_id: 'doc-1', confidence: 0.99, note: 'Dokumentside 1' },
    { type: 'registry', field: 'registry_seller_name', value: 'Demo AS', source_id: 'brreg:509100675', confidence: 'authoritative_public_registry', note: 'Registeroppslag' },
    { type: 'rule', field: 'rule_reference', value: 'HTJL_32_PRICE_ESTIMATE', source_id: 'HTJL_32_PRICE_ESTIMATE', note: 'intern' },
    { type: 'rule', field: 'rule_reference', value: 'MFL_11_UNAGREED_PAYMENT', source_id: 'MFL_11_UNAGREED_PAYMENT', note: 'intern' }
  ],
  evidence_summary: { documented: 1, registry: 1, rule: 2 },
  draft: { allowed: true, text: 'Hei, jeg ber om en forklaring.', reason: null }
};

const out = projectFullResult(internal, registry);
const text = JSON.stringify(out);
assert.equal(out.rules.length, 2);
assert.equal(out.rules[0].law, 'håndverkertjenesteloven');
assert.equal(out.rules[1].law, 'markedsføringsloven');
assert.equal(out.analysis.findings[0].title, 'Fakturaen overstiger kontrollnivået');
assert.equal(out.evidence.length, 2);
assert.equal(out.evidence.find(item => item.type === 'registry').source, 'Brønnøysundregistrene – Enhetsregisteret');
assert.equal(out.company_check.source, 'Brønnøysundregistrene – Enhetsregisteret');
assert.equal(out.company_check.registry.organization_number, '509100675');
assert.equal(out.company_check.comparison.name, 'different');
assert.equal(text.includes('seller_name_mismatch'), false);
assert.equal(text.includes('brreg:509100675'), false);
assert.equal(text.includes('brreg_enhetsregisteret'), false);
assert.equal(text.includes('HTJL_'), false);
assert.equal(text.includes('MFL_'), false);
assert.equal(text.includes('ESTIMATE_ABOVE_'), false);
assert.equal(text.includes('ADDITIONAL_PAYMENT_'), false);
assert.equal(text.includes('rule_package'), false);
assert.equal(text.includes('purge_cache'), false);
assert.equal(text.includes('error_code'), false);
assert.equal(text.includes('code'), false);
assertNoPrivateFields(out);

console.log('OK public paid-result projection with customer-safe company registry evidence');
