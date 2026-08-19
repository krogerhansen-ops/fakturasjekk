import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { buildDraft } from '../engine/draft.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const byId = new Map(registry.rules.map(rule => [rule.id, rule]));

for (const id of [
  'HTJL_7_DUTY_TO_ADVISE',
  'HTJL_9_ADDITIONAL_WORK',
  'HTJL_34_PRELIMINARY_EXAMINATION',
  'MFL_11_UNAGREED_PAYMENT',
  'POF_13_ITEMIZED_INVOICE',
  'BOF_5_1_2_PARTIES'
]) {
  assert.equal(byId.get(id)?.status, 'active', `${id} must be active`);
  assert.match(byId.get(id)?.source_url ?? '', /^https:\/\/lovdata\.no\//);
  assert.match(byId.get(id)?.last_verified ?? '', /^2026-08-19$/);
  assert.ok((byId.get(id)?.expected_phrase ?? '').length > 12);
}

assert.equal(byId.get('HTJL_8_FAILURE_TO_ADVISE')?.status, 'candidate');
assert.match(byId.get('HTJL_8_FAILURE_TO_ADVISE')?.notes ?? '', /ikke aktiv/i);

const workshop = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  industry: 'vehicle_repair',
  price_basis: 'estimate',
  agreed_price: 10000,
  invoice_total: 18600,
  price_increase_after_start: true,
  customer_notified: false,
  additional_work_detected: true,
  additional_work_authorization_documented: false,
  additional_work_price_documented: false,
  preliminary_examination_fee: 1900,
  preliminary_fee_disclosed_beforehand: false,
  invoice_specification_sufficient: false,
  lines: [
    { description: 'Service og arbeid', quantity: 1, unit_price: 10000 },
    { description: 'Tilleggsarbeid bremser', quantity: 1, unit_price: 6700 },
    { description: 'Diagnose', quantity: 1, unit_price: 1900 }
  ]
}, registry);

assert.equal(workshop.status, 'attention');
assert.equal(workshop.facts.industry, 'vehicle_repair');
for (const code of [
  'ESTIMATE_ABOVE_15_CONTROL',
  'HANDCRAFT_PRICE_INCREASE_NO_NOTICE',
  'ADDITIONAL_WORK_NO_DOCUMENTED_AUTHORIZATION',
  'ADDITIONAL_WORK_PRICE_BASIS_MISSING',
  'PRELIMINARY_FEE_NOT_DISCLOSED',
  'SERVICE_INVOICE_NOT_ITEMIZED'
]) {
  assert.ok(workshop.findings.some(f => f.code === code), `missing workshop finding ${code}`);
}
for (const id of [
  'HTJL_7_DUTY_TO_ADVISE',
  'HTJL_9_ADDITIONAL_WORK',
  'HTJL_32_PRICE_ESTIMATE',
  'HTJL_33_SURCHARGE',
  'HTJL_34_PRELIMINARY_EXAMINATION',
  'HTJL_36_INVOICE',
  'POF_13_ITEMIZED_INVOICE'
]) {
  assert.ok(workshop.rule_ids.includes(id), `missing workshop rule ${id}`);
}
assert.equal(workshop.rule_ids.includes('HTJL_8_FAILURE_TO_ADVISE'), false, 'candidate § 8 must not reach automatic customer analysis');

const workshopDraft = buildDraft({ analysis: workshop, registry, invoice_reference: 'VERKSTED-DEMO' });
assert.equal(workshopDraft.allowed, true);
assert.match(workshopDraft.text, /håndverkertjenesteloven § 9/);
assert.match(workshopDraft.text, /håndverkertjenesteloven § 34/);
assert.doesNotMatch(workshopDraft.text, /HTJL_|MFL_|POF_|BOF_/);
assert.doesNotMatch(workshopDraft.text, /Dere har brutt loven/i);

const retail = analyzeCase({
  party_type: 'consumer',
  case_type: 'goods',
  agreed_price: 12990,
  invoice_total: 15388,
  additional_payment_amount: 2398,
  additional_payment_agreement_status: 'not_found',
  seller_mva_marker_mismatch: true,
  lines: [
    { description: 'TV', quantity: 1, unit_price: 12990 },
    { description: 'Premium levering', quantity: 1, unit_price: 899 },
    { description: 'Trygghetspakke', quantity: 1, unit_price: 1499 }
  ]
}, registry);
assert.equal(retail.status, 'review');
assert.ok(retail.findings.some(f => f.code === 'ADDITIONAL_PAYMENT_AGREEMENT_NOT_FOUND'));
assert.ok(retail.findings.some(f => f.code === 'SELLER_IDENTITY_FORMAL_MISMATCH'));
assert.ok(retail.rule_ids.includes('MFL_11_UNAGREED_PAYMENT'));
assert.ok(retail.rule_ids.includes('BOF_5_1_2_PARTIES'));
assert.match(retail.findings.find(f => f.code === 'ADDITIONAL_PAYMENT_AGREEMENT_NOT_FOUND').explanation, /Manglende dokumentasjon er ikke det samme som bevist fravær av avtale/);

const fixedPriceWithoutRequest = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  price_basis: 'fixed',
  agreed_price: 20000,
  invoice_total: 20000,
  invoice_specification_sufficient: false,
  itemized_invoice_requested: false
}, registry);
assert.equal(fixedPriceWithoutRequest.findings.some(f => f.code === 'SERVICE_INVOICE_NOT_ITEMIZED'), false, 'fixed-price handcraft exception must not be overclaimed without a request for itemization');

console.log('OK P0 rule expansion: workshop, retail, itemization exception, candidate-rule safety and controlled draft.');
