import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runCase } from '../engine/case-service.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const caseResult = runCase({
  intake: {
    buyer_type: 'consumer',
    subject: 'handcraft_service',
    documents: ['invoice', 'quote']
  },
  facts: {
    price_basis: 'estimate',
    agreed_price: 120000,
    invoice_total: 146000,
    invoice_fee: 500,
    surcharge_documented: false
  },
  origins: {
    agreed_price: { type: 'documented', source_id: 'quote-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' },
    invoice_fee: { type: 'documented', source_id: 'invoice-1' },
    price_basis: { type: 'documented', source_id: 'quote-1' },
    surcharge_documented: { type: 'user_provided' }
  },
  registry,
  user_note: 'Jeg fikk ikke beskjed om ekstraarbeid.',
  invoice_reference: '12345'
});

assert.equal(caseResult.intake.supported, true);
assert.equal(caseResult.analysis.status, 'attention');
assert.equal(caseResult.analysis.calculations.difference, 26000);
assert.ok(caseResult.evidence_summary.documented >= 4);
assert.ok(caseResult.evidence_summary.user_provided >= 2);
assert.equal(caseResult.draft.allowed, true);
assert.ok(caseResult.draft.text.includes('faktura 12345'));
assert.equal(/HTJL_|FKJL_|POF_|BOF_/.test(caseResult.draft.text), false);

const clean = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice', 'order_confirmation'] },
  facts: { agreed_price: 3490, invoice_total: 3490 },
  origins: {
    agreed_price: { type: 'documented', source_id: 'order-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' }
  },
  registry
});
assert.equal(clean.status, 'clean');
assert.equal(clean.draft.allowed, false);

const b2b = runCase({
  intake: { buyer_type: 'business', subject: 'goods', documents: ['invoice'] },
  facts: { agreed_price: 1000, invoice_total: 1500 },
  registry
});
assert.equal(b2b.intake.supported, false);
assert.equal(b2b.analysis, null);
assert.equal(b2b.draft.allowed, false);

console.log('OK: case service orchestrates intake, analysis, evidence and controlled draft with fail-closed scope handling.');
