import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtraction, toEvidenceOrigins } from '../engine/extraction-policy.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));

const valid = validateExtraction({
  fields: {
    invoice_total: { value: 146000, confidence: 0.99, source_document_id: 'invoice-1', source_page: 1, raw_text: 'Total 146 000' },
    invoice_number: { value: '12345', confidence: 0.98, source_document_id: 'invoice-1', source_page: 1 },
    supplier_name: { value: 'Demo AS', confidence: 0.91, source_document_id: 'invoice-1', source_page: 1 }
  }
}, policy);
assert.equal(valid.safe_to_continue, true);
assert.equal(valid.counts.accepted, 3);
const origins = toEvidenceOrigins(valid);
assert.equal(origins.invoice_total.type, 'documented');
assert.equal(origins.invoice_total.source_id, 'invoice-1');

const lowCritical = validateExtraction({
  fields: {
    invoice_total: { value: 146000, confidence: 0.90, source_document_id: 'invoice-1', source_page: 1 }
  }
}, policy);
assert.equal(lowCritical.safe_to_continue, false);
assert.equal(lowCritical.review.length, 1);
assert.equal(lowCritical.accepted.invoice_total, undefined);

const missingSource = validateExtraction({
  fields: {
    invoice_total: { value: 146000, confidence: 0.99 }
  }
}, policy);
assert.equal(missingSource.safe_to_continue, false);
assert.equal(missingSource.rejected.length, 1);

const missingValue = validateExtraction({
  fields: {
    agreed_price: { value: null, confidence: 0.99, source_document_id: 'quote-1', source_page: 1 }
  }
}, policy);
assert.equal(missingValue.rejected.length, 1);
assert.ok(missingValue.rejected[0].reason.includes('ikke gjettes'));

console.log('OK: extraction policy requires source location, high confidence for critical fields and never fills missing values.');
