import assert from 'node:assert/strict';
import { classifyIntake } from '../engine/intake.mjs';

const handcraftReady = classifyIntake({
  buyer_type: 'consumer',
  subject: 'handcraft_service',
  documents: ['invoice', 'quote']
});
assert.equal(handcraftReady.supported, true);
assert.equal(handcraftReady.status, 'supported');
assert.equal(handcraftReady.route, 'handcraft_service');

const handcraftMissingInvoice = classifyIntake({
  buyer_type: 'consumer',
  subject: 'handcraft_service',
  documents: ['quote']
});
assert.equal(handcraftMissingInvoice.supported, false);
assert.equal(handcraftMissingInvoice.status, 'needs_document');
assert.ok(handcraftMissingInvoice.questions.some(q => q.includes('faktura')));

const b2b = classifyIntake({
  buyer_type: 'business',
  subject: 'goods',
  documents: ['invoice']
});
assert.equal(b2b.supported, false);
assert.equal(b2b.status, 'stop');
assert.equal(b2b.route, 'business_purchase');

const digital = classifyIntake({
  buyer_type: 'consumer',
  subject: 'digital_service',
  documents: ['invoice']
});
assert.equal(digital.supported, false);
assert.equal(digital.status, 'stop');

const unknownBuyer = classifyIntake({
  buyer_type: 'unknown',
  subject: 'goods',
  documents: ['invoice']
});
assert.equal(unknownBuyer.status, 'needs_clarification');
assert.ok(unknownBuyer.questions.length > 0);

const goodsWithoutOrder = classifyIntake({
  buyer_type: 'consumer',
  subject: 'goods',
  documents: ['invoice']
});
assert.equal(goodsWithoutOrder.supported, true);
assert.ok(goodsWithoutOrder.questions.some(q => q.includes('ordrebekreftelse')));

console.log('OK: intake classifier passed supported, missing-document, B2B, digital-service and clarification cases.');
