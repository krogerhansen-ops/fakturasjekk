import assert from 'node:assert/strict';
import { evaluateLegalPreactivation } from '../engine/legal-preactivation.mjs';

const none = evaluateLegalPreactivation({ case_type: 'goods', itemized_invoice_requested: true });
assert.equal(none.checks.length, 0);
assert.equal(none.questions.length, 0);

const missingTimeline = evaluateLegalPreactivation({
  case_type: 'handcraft_service',
  itemized_invoice_requested: true
});
assert.equal(missingTimeline.checks.length, 1);
assert.equal(missingTimeline.checks[0].id, 'HTJL_37_ITEMIZED_INVOICE_TIMELINE');
assert.equal(missingTimeline.checks[0].legal_conclusion, false);
assert.ok(missingTimeline.questions.some(q => /Når ba du/i.test(q)));
assert.ok(missingTimeline.questions.some(q => /forfallsdato/i.test(q)));

const documented = evaluateLegalPreactivation({
  case_type: 'handcraft_service',
  itemized_invoice_requested: true,
  itemized_invoice_request_date: '2026-08-01',
  due_date: '2026-08-15',
  itemized_invoice_received_date: '2026-08-12'
});
assert.equal(documented.checks[0].status, 'timeline_documented');
assert.equal(documented.checks[0].request_days_before_due, 14);
assert.match(documented.checks[0].note, /ingen egen automatisk daggrense/i);
assert.ok(documented.questions.some(q => /14 dag\(er\)/i.test(q)));
assert.ok(documented.questions.some(q => /må vurderes konkret/i.test(q)));

const afterDue = evaluateLegalPreactivation({
  case_type: 'handcraft_service',
  itemized_invoice_request_date: '2026-08-20',
  due_date: '2026-08-15'
});
assert.equal(afterDue.checks[0].request_days_before_due, -5);
assert.ok(afterDue.questions.some(q => /etter oppgitt forfall/i.test(q)));

console.log('OK HTJL § 37 is preactivated from a documented timeline without inventing an automatic day threshold.');
