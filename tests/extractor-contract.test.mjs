import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtractorEnvelope, createValidatedExtractor, extractorInstructions } from '../server/extractor-contract.mjs';
import { validateExtraction } from '../engine/extraction-policy.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));

const valid = validateExtractorEnvelope({ fields: {
  invoice_total: { value: 12345, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
  invoice_number: { value: 'INV-1', confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
  lines: { value: [{ description: 'Arbeid', quantity: 2, unit_price: 1000 }], confidence: 0.9, source_document_id: 'doc-1', source_page: 1 }
}}, catalog);
assert.equal(valid.valid, true);
assert.equal(Object.keys(valid.fields).length, 3);

const invalid = validateExtractorEnvelope({ fields: {
  legal_conclusion: { value: 'Kravet er ugyldig', confidence: 1, source_document_id: 'doc-1', source_page: 1 },
  customer_notified: { value: 'probably not', confidence: 0.99, source_document_id: 'doc-1', source_page: 1 }
}}, catalog);
assert.equal(invalid.valid, false);
assert.equal(invalid.contract_errors.length, 2);

const provider = { async extract() { return { fields: { invoice_total: { value: 1000, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 }, made_up_rule: { value: '§ 99', confidence: 1, source_document_id: 'doc-1', source_page: 1 } } }; } };
const wrapped = createValidatedExtractor({ provider, catalog });
const output = await wrapped.extract({});
assert.equal('made_up_rule' in output.fields, false);
assert.equal(output.contract_errors.length, 1);
const confidenceResult = validateExtraction(output, policy);
assert.equal(confidenceResult.safe_to_continue, false);
assert.ok(confidenceResult.rejected.some(x => x.field === 'extractor_contract'));

const instructions = extractorInstructions(catalog);
assert.match(instructions, /Ikke gjør juridiske vurderinger/);
assert.match(instructions, /Ikke gjett/);
assert.match(instructions, /Ingen lovnavn, paragrafer/);

console.log('OK extractor contract');
