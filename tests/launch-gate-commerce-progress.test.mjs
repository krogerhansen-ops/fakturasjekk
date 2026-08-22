import fs from 'node:fs';
import assert from 'node:assert/strict';

const gate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));
const byId = new Map(gate.checks.map(check => [check.id, check]));

for (const id of [
  'COMMERCE_PRIVACY_AT_CHECKOUT',
  'COMMERCE_CANCELLATION_IMPLEMENTATION',
  'COMMERCE_RECEIPT_FLOW'
]) {
  const check = byId.get(id);
  assert.ok(check, `missing ${id}`);
  assert.equal(check.status, 'in_progress', `${id} has implemented code but must remain blocked until live verification is complete`);
  assert.ok(String(check.evidence ?? '').length > 120, `${id} must explain both implemented evidence and remaining live blocker`);
}

const checkoutEvidence = byId.get('COMMERCE_PRIVACY_AT_CHECKOUT').evidence;
assert.match(checkoutEvidence, /confirmed Supabase email/i, 'checkout must document server-verified receipt recipient');
assert.match(checkoutEvidence, /cannot be overridden by browser input/i, 'browser must never select receipt recipient');
assert.match(checkoutEvidence, /live checkout E2E/i, 'checkout gate must remain tied to real live verification');

const cancellationEvidence = byId.get('COMMERCE_CANCELLATION_IMPLEMENTATION').evidence;
assert.match(cancellationEvidence, /durable_medium_delivered=false/);
assert.match(cancellationEvidence, /provider acceptance/i, 'cancellation evidence must preserve provider acceptance vs delivery separation');
assert.match(cancellationEvidence, /authenticated delivered/i, 'only verified delivered status may complete durable medium');
assert.match(cancellationEvidence, /Live Vipps checkout plus Brevo send-to-delivered E2E/i, 'live commerce proof must remain open');

const receiptEvidence = byId.get('COMMERCE_RECEIPT_FLOW').evidence;
assert.match(receiptEvidence, /paid\/CAPTURED/);
assert.match(receiptEvidence, /Brevo transactional-email adapter/i);
assert.match(receiptEvidence, /server-verified recipient/i);
assert.match(receiptEvidence, /authenticated delivered-webhook/i);
assert.match(receiptEvidence, /null webhook\/sender values/i, 'fail-closed Brevo target must remain explicit');
assert.match(receiptEvidence, /synthetic live send-to-delivered verification/i, 'code must never substitute for live durable-medium evidence');
assert.equal(byId.get('COMMERCE_RECEIPT_FLOW').status, 'in_progress');

for (const id of [
  'LEGAL_DPIA_COMPLETE',
  'LEGAL_PROCESSING_BASIS_MAP',
  'LEGAL_ROPA',
  'LEGAL_PROCESSOR_REGISTER',
  'LEGAL_RETENTION_APPROVAL'
]) {
  assert.equal(byId.get(id)?.status, 'in_progress', `${id} must remain open after Brevo documentation sync`);
}
assert.equal(byId.get('LEGAL_PROCESSOR_AGREEMENTS')?.status, 'todo', 'Brevo DPA availability is not approval of the actual processor agreement');
assert.equal(byId.get('LEGAL_TRANSFER_ASSESSMENT')?.status, 'todo', 'EU database hosting alone must not close transfer/support/subprocessor review');
assert.match(byId.get('LEGAL_PROCESSOR_REGISTER').evidence, /Brevo transactional email/);
assert.match(byId.get('LEGAL_PROCESSOR_AGREEMENTS').evidence, /Brevo states that a DPA is available/);
assert.match(byId.get('LEGAL_TRANSFER_ASSESSMENT').evidence, /Brevo states that database hosting is in the EU/);

const incomplete = gate.checks.filter(check => check.required && check.status !== 'complete');
assert.ok(incomplete.some(check => check.id === 'COMMERCE_SELLER_IDENTITY'));
assert.ok(incomplete.some(check => check.id === 'COMMERCE_RECEIPT_FLOW'));
assert.ok(incomplete.some(check => check.id === 'LEGAL_PROCESSOR_AGREEMENTS'));
assert.ok(incomplete.some(check => check.id === 'QA_EXTERNAL_TESTERS'));

console.log('OK commerce/privacy launch gates record Brevo implementation evidence without confusing code, EU hosting or DPA availability with live/legal completion');
