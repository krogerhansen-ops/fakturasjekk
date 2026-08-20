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
  assert.ok(String(check.evidence ?? '').length > 80, `${id} must explain both implemented evidence and remaining live blocker`);
}

assert.match(byId.get('COMMERCE_CANCELLATION_IMPLEMENTATION').evidence, /durable_medium_delivered=false/);
assert.match(byId.get('COMMERCE_CANCELLATION_IMPLEMENTATION').evidence, /Actual durable-medium delivery/);
assert.match(byId.get('COMMERCE_RECEIPT_FLOW').evidence, /paid\/CAPTURED/);
assert.match(byId.get('COMMERCE_RECEIPT_FLOW').evidence, /Actual delivery on a durable medium/);

const incomplete = gate.checks.filter(check => check.required && check.status !== 'complete');
assert.ok(incomplete.some(check => check.id === 'COMMERCE_SELLER_IDENTITY'));
assert.ok(incomplete.some(check => check.id === 'COMMERCE_RECEIPT_FLOW'));
assert.ok(incomplete.some(check => check.id === 'QA_EXTERNAL_TESTERS'));

console.log('OK commerce launch gates distinguish implemented code from remaining live verification and keep launch blocked');
