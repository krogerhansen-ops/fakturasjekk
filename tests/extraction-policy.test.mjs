import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtraction, toEvidenceOrigins } from '../engine/extraction-policy.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));

const valid = validateExtraction({
  fields: {
    invoice_total: { value: 146000, confidence: 0.99, source_document_id: 'invoice-1', source_page: 1, raw_text: 'Total 146 000' },
    invoice_number: { value: '12345', confidence: 0.98, source_document_id: 'invoice-1', source_page: 1 },
    supplier_name: { value: 'Demo AS', confidence: 0.91, source_document_id: 'invoice-1', source_page: 1 },
    preliminary_examination_fee: { value: 1900, confidence: 0.97, source_document_id: 'invoice-1', source_page: 2 },
    additional_work_amount: { value: 8400, confidence: 0.96, source_document_id: 'invoice-1', source_page: 2 }
  }
}, policy);
assert.equal(valid.safe_to_continue, true);
assert.equal(valid.counts.accepted, 5);
const origins = toEvidenceOrigins(valid);
assert.equal(origins.invoice_total.type, 'documented');
assert.equal(origins.invoice_total.source_id, 'invoice-1');
assert.equal(origins.preliminary_examination_fee.type, 'documented');

const lowCritical = validateExtraction({
  fields: {
    invoice_total: { value: 146000, confidence: 0.90, source_document_id: 'invoice-1', source_page: 1 },
    preliminary_examination_fee: { value: 1900, confidence: 0.94, source_document_id: 'invoice-1', source_page: 2 },
    additional_work_amount: { value: 8400, confidence: 0.93, source_document_id: 'invoice-1', source_page: 2 }
  }
}, policy);
assert.equal(lowCritical.safe_to_continue, false);
assert.equal(lowCritical.review.length, 3);
assert.equal(lowCritical.accepted.invoice_total, undefined);
assert.equal(lowCritical.accepted.preliminary_examination_fee, undefined);
assert.equal(lowCritical.accepted.additional_work_amount, undefined);

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
