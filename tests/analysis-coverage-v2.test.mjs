import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildAnalysisCoverage, assertAnalysisCoverageSafe } from '../engine/analysis-coverage.mjs';
import { runCase } from '../engine/case-service.mjs';
import { projectFullResult } from '../server/public-projection.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const companyCheck = {
  status: 'verified',
  registry: {
    organization_number: '509100675',
    name: 'Syntetisk Test AS',
    organization_form: { description: 'Aksjeselskap' },
    registered_in_vat: true,
    registered_in_business_register: true,
    bankrupt: false,
    under_liquidation: false,
    under_forced_liquidation_or_dissolution: false,
    deleted_date: null,
    registration_date: '2020-01-01',
    business_code: { description: 'Syntetisk testvirksomhet' },
    business_address: null
  },
  comparison: { organization_number: 'matches', name: 'matches', vat_marker: 'matches' },
  flags: [],
  customer_note: null
};

const completeFacts = {
  industry: 'construction',
  price_basis: 'fixed',
  agreed_price: 3500,
  invoice_total: 3500,
  stated_subtotal: 2800,
  stated_vat: 700,
  invoice_specification_sufficient: true,
  additional_work_detected: false,
  invoice_lines: [
    { description: 'Arbeid', quantity: 2, unit_price: 1000, amount: 2000, vat_rate: 25, vat_amount: 500 },
    { description: 'Materiell', quantity: 1, unit_price: 800, amount: 800, vat_rate: 25, vat_amount: 200 }
  ],
  agreement_lines: [
    { description: 'Arbeid', quantity: 2, unit_price: 1000, amount: 2000 },
    { description: 'Materiell', quantity: 1, unit_price: 800, amount: 800 }
  ]
};

const complete = runCase({
  intake: { buyer_type: 'consumer', subject: 'handcraft_service', documents: ['invoice', 'quote'] },
  facts: completeFacts,
  origins: {
    agreed_price: { type: 'documented', source_id: 'quote-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' },
    stated_subtotal: { type: 'documented', source_id: 'invoice-1' },
    stated_vat: { type: 'documented', source_id: 'invoice-1' },
    invoice_specification_sufficient: { type: 'documented', source_id: 'invoice-1' },
    additional_work_detected: { type: 'documented', source_id: 'quote-1' }
  },
  company_check: companyCheck,
  registry
});

assert.ok(complete.coverage, 'runCase must attach coverage to a supported analysis');
assert.equal(complete.coverage.summary.limited, 0, 'complete documented service fixture should have no limited relevant coverage areas');
assert.ok(complete.coverage.summary.checked >= 7);
assert.ok(complete.coverage.not_applicable.some(item => item.id === 'diagnostics'));
assert.ok(complete.coverage.checked.some(item => item.id === 'company'));
assert.ok(complete.coverage.checked.some(item => item.id === 'vat'));
assert.ok(complete.coverage.checked.some(item => item.id === 'rules'));
assertAnalysisCoverageSafe(complete.coverage);

const invoiceOnly = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice'] },
  facts: { invoice_total: 3490 },
  origins: { invoice_total: { type: 'documented', source_id: 'invoice-1' } },
  registry
});

assert.ok(invoiceOnly.coverage.checked.some(item => item.id === 'rules'), 'a completed rule-engine run with zero matches is still a completed control');
for (const id of ['agreement_price', 'invoice_math', 'invoice_itemization', 'vat', 'company']) {
  assert.ok(invoiceOnly.coverage.limited.some(item => item.id === id), `${id} must be limited when invoice-only data cannot prove the control was completed`);
}
assert.ok(invoiceOnly.coverage.not_applicable.some(item => item.id === 'additional_work'));
assert.ok(invoiceOnly.coverage.not_applicable.some(item => item.id === 'diagnostics'));
assert.match(invoiceOnly.coverage.message, /begrenset av dokumentasjonen/i);
assertAnalysisCoverageSafe(invoiceOnly.coverage);

const unavailableCompany = buildAnalysisCoverage({
  facts: { case_type: 'goods', invoice_total: 1000 },
  analysis: { supported: true, rule_ids: [] },
  company_check: { status: 'unavailable', registry: null }
});
assert.ok(unavailableCompany.limited.find(item => item.id === 'company')?.explanation.includes('ikke tilgjengelig'));

const projected = projectFullResult(complete, registry);
assert.ok(projected.coverage);
assert.equal(projected.coverage.summary.limited, 0);
assert.ok(projected.coverage.checked.every(entry => !Object.prototype.hasOwnProperty.call(entry, 'id')), 'internal coverage ids must not be exposed to customer result');
assert.ok(projected.coverage.checked.some(entry => entry.label === 'Regel- og paragrafkontroll'));
assert.equal(/HTJL_|FKJL_|POF_|BOF_|INK_|finding_code|rule_package/.test(JSON.stringify(projected.coverage)), false);

console.log('OK conservative result coverage is integrated, customer-safe and never overclaims invoice-only controls.');
