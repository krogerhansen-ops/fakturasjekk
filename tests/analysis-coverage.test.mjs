import assert from 'node:assert/strict';
import { buildAnalysisCoverage } from '../engine/analysis-coverage.mjs';

const workshop = buildAnalysisCoverage({
  input: {
    party_type: 'consumer',
    case_type: 'handcraft_service',
    industry: 'vehicle_repair',
    agreed_price: 10000,
    invoice_total: 20300,
    invoice_specification_sufficient: true,
    additional_work_detected: true,
    preliminary_examination_fee: 1800,
    preliminary_fee_disclosed_beforehand: false,
    lines: [
      { description: 'Diagnose', quantity: 1, unit_price: 1800 },
      { description: 'Arbeid/deler', quantity: 1, unit_price: 18500 }
    ]
  },
  analysis: { rule_ids: ['HTJL_7_DUTY_TO_ADVISE'] },
  document_checks: { vat_check: { ok: true } },
  company_check: { status: 'verified' }
});

assert.deepEqual(
  workshop.checked.map(entry => entry.id).sort(),
  ['additional_work','agreement_price','company','diagnostics','invoice_itemization','invoice_math','rules','vat'].sort()
);
assert.equal(workshop.limited.length, 0);
assert.equal(workshop.not_applicable.length, 0);
assert.deepEqual(workshop.summary, { checked: 8, limited: 0, not_applicable: 0 });

const invoiceOnly = buildAnalysisCoverage({
  input: {
    party_type: 'consumer',
    case_type: 'goods',
    invoice_total: 3490
  },
  analysis: { rule_ids: [] }
});
const invoiceOnlyChecked = new Set(invoiceOnly.checked.map(entry => entry.id));
const invoiceOnlyLimited = new Set(invoiceOnly.limited.map(entry => entry.id));
const invoiceOnlyNA = new Set(invoiceOnly.not_applicable.map(entry => entry.id));

assert.ok(invoiceOnlyChecked.has('rules'), 'rule engine run with zero matched rules is still a completed rule control');
for (const id of ['agreement_price','invoice_math','invoice_itemization','vat','company']) {
  assert.ok(invoiceOnlyLimited.has(id), `invoice-only flow must say ${id} is limited instead of implying it was checked`);
}
assert.ok(invoiceOnlyNA.has('additional_work'));
assert.ok(invoiceOnlyNA.has('diagnostics'));

const serviceWithoutExtras = buildAnalysisCoverage({
  input: {
    party_type: 'consumer',
    case_type: 'service_quote',
    agreed_price: 18000,
    invoice_total: 27600,
    missing_formal_fields: ['betalingsforfall']
  },
  analysis: { rule_ids: ['POF_12_QUOTE'] },
  company_check: { status: 'ambiguous' }
});
assert.ok(serviceWithoutExtras.checked.some(entry => entry.id === 'agreement_price'));
assert.ok(serviceWithoutExtras.checked.some(entry => entry.id === 'invoice_itemization'));
assert.ok(serviceWithoutExtras.limited.some(entry => entry.id === 'additional_work'));
assert.ok(serviceWithoutExtras.limited.some(entry => entry.id === 'company'));
assert.ok(serviceWithoutExtras.limited.some(entry => entry.id === 'vat'));

for (const result of [workshop, invoiceOnly, serviceWithoutExtras]) {
  const all = [...result.checked, ...result.limited, ...result.not_applicable];
  const ids = all.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'coverage category must appear exactly once');
  for (const entry of all) {
    assert.ok(['checked','limited','not_applicable'].includes(entry.status));
    assert.ok(entry.label && entry.explanation);
    assert.equal(/fail-closed|OCR|rule_id|HTJL_|POF_|BOF_|INK_/i.test(entry.label + entry.explanation), false, 'coverage text must stay customer-safe');
  }
}

console.log('OK analysis coverage distinguishes checked, limited and not-applicable areas without overclaiming invoice-only cases.');
