import assert from 'node:assert/strict';
import { compareDocumentLines, normalizeDescription } from '../engine/document-comparison.mjs';

assert.equal(normalizeDescription('Service-bil / oppmøte'), 'service bil oppmote');
const result = compareDocumentLines({
  agreement_lines: [
    { description: 'Arbeid elektriker', quantity: 10, unit_price: 1000, amount: 10000 },
    { description: 'Servicebil / oppmøte', quantity: 1, unit_price: 1500, amount: 1500 },
    { description: 'Materiell standard', amount: 5000 }
  ],
  invoice_lines: [
    { description: 'Arbeid elektriker', quantity: 12, unit_price: 1000, amount: 12000 },
    { description: 'Servicebil oppmøte', quantity: 1, unit_price: 1500, amount: 1500 },
    { description: 'Materiell standard', amount: 5000 },
    { description: 'Ekstra feilsøking loft', amount: 6000 }
  ]
});
assert.equal(result.summary.matched_count, 3);
assert.equal(result.summary.changed_count, 1);
assert.equal(result.changed[0].quantity_changed, true);
assert.equal(result.changed[0].amount_difference, 2000);
assert.equal(result.summary.added_count, 1);
assert.equal(result.added_on_invoice[0].description, 'Ekstra feilsøking loft');
assert.equal(result.safe_for_automatic_conclusion, true);

const ambiguous = compareDocumentLines({
  agreement_lines: [{ description: 'Montering kabel kanal' }],
  invoice_lines: [{ description: 'Montering kabel kanal liten' }, { description: 'Montering kabel kanal stor' }],
  similarity_threshold: 0.6
});
assert.equal(ambiguous.summary.ambiguous_count, 1);
assert.equal(ambiguous.safe_for_automatic_conclusion, false);
assert.equal(ambiguous.added_on_invoice.length, 0, 'Ambiguous candidates must not be mislabeled as unquoted additions');

console.log('OK deterministic document comparison');
