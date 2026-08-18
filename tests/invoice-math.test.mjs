import assert from 'node:assert/strict';
import { checkInvoiceMath } from '../engine/invoice-math.mjs';

const clean = checkInvoiceMath({
  lines: [
    { description: 'Arbeid', quantity: 2, unit_price: 1000, amount: 2000, vat_rate: 25, vat_amount: 500 },
    { description: 'Materiell', quantity: 1, unit_price: 800, amount: 800, vat_rate: 25, vat_amount: 200 }
  ],
  stated_subtotal: 2800,
  stated_vat: 700,
  stated_total: 3500
});
assert.equal(clean.valid, true);
assert.equal(clean.calculated_subtotal, 2800);
assert.equal(clean.calculated_vat, 700);
assert.match(clean.note, /avgjør ikke om riktig lovbestemt MVA-sats/i);

const bad = checkInvoiceMath({
  lines: [
    { description: 'Arbeid', quantity: 2, unit_price: 1000, amount: 2200, vat_rate: 25, vat_amount: 550 },
    { description: 'Materiell', quantity: 1, unit_price: 800, amount: 800, vat_rate: 25, vat_amount: 190 }
  ],
  stated_subtotal: 3000,
  stated_vat: 750,
  stated_total: 3900
});
assert.equal(bad.valid, false);
assert.ok(bad.issues.some(x => x.type === 'line_amount_mismatch'));
assert.ok(bad.issues.some(x => x.type === 'line_vat_mismatch'));
assert.ok(bad.issues.some(x => x.type === 'stated_total_mismatch'));

const incomplete = checkInvoiceMath({ lines: [{ description: 'Fast post', amount: 1000 }], stated_total: 1000 });
assert.equal(incomplete.calculated_subtotal, 1000);
assert.equal(incomplete.calculated_vat, null);
assert.equal(incomplete.valid, true);

console.log('OK invoice math');
