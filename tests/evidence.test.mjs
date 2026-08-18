import assert from 'node:assert/strict';
import { buildEvidenceLedger, summarizeEvidence, assertEvidenceSafety, evidenceItem } from '../engine/evidence.mjs';

const analysis = {
  calculations: { invoice_total: 146000, agreed_price: 120000, difference: 26000 },
  rule_ids: ['HTJL_32_PRICE_ESTIMATE', 'HTJL_33_SURCHARGE'],
  questions: ['Er tilleggsarbeidet dokumentert?']
};

const ledger = buildEvidenceLedger({
  facts: {
    invoice_total: 146000,
    agreed_price: 120000,
    customer_notified: false
  },
  origins: {
    invoice_total: { type: 'documented', source_id: 'invoice-1', confidence: 'high' },
    agreed_price: { type: 'documented', source_id: 'quote-1', confidence: 'high' },
    customer_notified: { type: 'user_provided' }
  },
  analysis,
  user_note: 'Jeg fikk aldri beskjed om ekstraarbeid.'
});

assert.equal(assertEvidenceSafety(ledger), true);
const summary = summarizeEvidence(ledger);
assert.equal(summary.documented, 2);
assert.ok(summary.user_provided >= 2);
assert.equal(summary.calculated, 3);
assert.equal(summary.rule, 2);
assert.equal(summary.needs_clarification, 1);

const userNote = ledger.find(item => item.field === 'user_note');
assert.equal(userNote.type, 'user_provided');
assert.equal(userNote.source_id, null);

assert.throws(() => evidenceItem({ type: 'documented', field: 'price', value: 1000 }), /source_id/);
assert.throws(() => evidenceItem({ type: 'made_up', field: 'x' }), /Invalid evidence type/);

const unknownLedger = buildEvidenceLedger({ facts: { agreed_price: 1000 }, origins: {} });
assert.equal(unknownLedger[0].type, 'needs_clarification');

console.log('OK: evidence ledger keeps document facts, user statements, calculations, rules and open questions separate.');
