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
    customer_notified: false,
    registry_seller_name: 'Demo AS',
    seller_name_mismatch: true
  },
  origins: {
    invoice_total: { type: 'documented', source_id: 'invoice-1', confidence: 'high' },
    agreed_price: { type: 'documented', source_id: 'quote-1', confidence: 'high' },
    customer_notified: { type: 'user_provided' },
    registry_seller_name: { type: 'registry', source_id: 'brreg:509100675', confidence: 'authoritative_public_registry' },
    seller_name_mismatch: { type: 'calculated', confidence: 'deterministic' }
  },
  analysis,
  user_note: 'Jeg fikk aldri beskjed om ekstraarbeid.'
});

assert.equal(assertEvidenceSafety(ledger), true);
const summary = summarizeEvidence(ledger);
assert.equal(summary.documented, 2);
assert.equal(summary.registry, 1);
assert.ok(summary.user_provided >= 2);
assert.equal(summary.calculated, 4);
assert.equal(summary.rule, 2);
assert.equal(summary.needs_clarification, 1);

const registryItem = ledger.find(item => item.field === 'registry_seller_name');
assert.equal(registryItem.type, 'registry');
assert.equal(registryItem.source_id, 'brreg:509100675');
const comparison = ledger.find(item => item.field === 'seller_name_mismatch');
assert.equal(comparison.type, 'calculated');

const userNote = ledger.find(item => item.field === 'user_note');
assert.equal(userNote.type, 'user_provided');
assert.equal(userNote.source_id, null);

assert.throws(() => evidenceItem({ type: 'documented', field: 'price', value: 1000 }), /source_id/);
assert.throws(() => evidenceItem({ type: 'registry', field: 'company', value: 'Demo AS' }), /source_id/);
assert.throws(() => evidenceItem({ type: 'made_up', field: 'x' }), /Invalid evidence type/);

const unknownLedger = buildEvidenceLedger({ facts: { agreed_price: 1000 }, origins: {} });
assert.equal(unknownLedger[0].type, 'needs_clarification');

console.log('OK: evidence ledger keeps document facts, public-register facts, user statements, calculations, rules and open questions separate.');
