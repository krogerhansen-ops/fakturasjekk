import assert from 'node:assert/strict';
import { runDocumentChecks } from '../engine/document-checks.mjs';

const output = runDocumentChecks({
  invoice_total: 18750,
  stated_subtotal: 15000,
  stated_vat: 3750,
  agreement_lines: [
    { description: 'Arbeid', quantity: 10, unit_price: 1000, amount: 10000 },
    { description: 'Materiell', amount: 3000 }
  ],
  invoice_lines: [
    { description: 'Arbeid', quantity: 12, unit_price: 1000, amount: 12000, vat_rate: 25, vat_amount: 3000 },
    { description: 'Materiell', amount: 3000, vat_rate: 25, vat_amount: 750 },
    { description: 'Servicebil', amount: 1000, vat_rate: 25, vat_amount: 250 }
  ]
});
assert.ok(output.findings.some(f => /Servicebil/.test(f.title) && f.category === 'document_difference'));
assert.ok(output.findings.some(f => /Arbeid/.test(f.title) && f.category === 'document_difference'));
assert.ok(output.findings.every(f => f.legal_conclusion === false));
assert.ok(output.findings.every(f => f.rule_ids.length === 0));
assert.equal(output.comparison.summary.added_count, 1);
assert.equal(output.comparison.summary.changed_count, 1);

const ambiguous = runDocumentChecks({
  invoice_total: 1000,
  agreement_lines: [{ description: 'Montering kabel kanal' }],
  invoice_lines: [{ description: 'Montering kabel kanal liten', amount: 500 }, { description: 'Montering kabel kanal stor', amount: 500 }]
});
assert.equal(ambiguous.safe_for_automatic_conclusion, false);
assert.equal(ambiguous.questions.length, 1);

console.log('OK combined document checks');
