import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtractorEnvelope, createValidatedExtractor, extractorInstructions } from '../server/extractor-contract.mjs';
import { validateExtraction } from '../engine/extraction-policy.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));
const documents = [
  { id: 'doc-1', role: 'invoice' },
  { id: 'quote-1', role: 'quote' },
  { id: 'message-1', role: 'correspondence' }
];

const valid = validateExtractorEnvelope({ fields: {
  invoice_total: { value: 12345, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
  invoice_number: { value: 'INV-1', confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
  lines: { value: [{ description: 'Arbeid', quantity: 2, unit_price: 1000 }], confidence: 0.9, source_document_id: 'doc-1', source_page: 1 },
  preliminary_examination_fee: { value: 1900, confidence: 0.99, source_document_id: 'doc-1', source_page: 2 },
  preliminary_fee_disclosed_beforehand: { value: true, confidence: 0.94, source_document_id: 'quote-1', source_page: 1 },
  additional_work_detected: { value: true, confidence: 0.93, source_document_id: 'doc-1', source_page: 2 },
  additional_work_authorization_documented: { value: true, confidence: 0.92, source_document_id: 'message-1', source_page: 1 }
}}, catalog, { documents });
assert.equal(valid.valid, true);
assert.equal(Object.keys(valid.fields).length, 7);

const invalid = validateExtractorEnvelope({ fields: {
  legal_conclusion: { value: 'Kravet er ugyldig', confidence: 1, source_document_id: 'doc-1', source_page: 1 },
  customer_notified: { value: 'probably not', confidence: 0.99, source_document_id: 'message-1', source_page: 1 }
}}, catalog, { documents });
assert.equal(invalid.valid, false);
assert.equal(invalid.contract_errors.length, 2);

const wrongRole = validateExtractorEnvelope({ fields: {
  customer_notified: { value: true, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 }
}}, catalog, { documents });
assert.equal(wrongRole.valid, false);
assert.match(wrongRole.contract_errors[0], /kan ikke dokumenteres fra dokumentrollen invoice/);

const unknownDocument = validateExtractorEnvelope({ fields: {
  invoice_total: { value: 12345, confidence: 0.99, source_document_id: 'not-supplied', source_page: 1 }
}}, catalog, { documents });
assert.equal(unknownDocument.valid, false);
assert.match(unknownDocument.contract_errors[0], /ukjent kildedokument/);

const negativeFromAbsence = validateExtractorEnvelope({ fields: {
  additional_work_authorization_documented: { value: false, confidence: 0.99, source_document_id: 'message-1', source_page: 1 }
}}, catalog, { documents });
assert.equal(negativeFromAbsence.valid, false);
assert.match(negativeFromAbsence.contract_errors[0], /positive-only/);

const provider = {
  async extract() {
    return { fields: {
      invoice_total: { value: 1000, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
      customer_notified: { value: true, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
      made_up_rule: { value: '§ 99', confidence: 1, source_document_id: 'doc-1', source_page: 1 }
    } };
  }
};
const wrapped = createValidatedExtractor({ provider, catalog });
const output = await wrapped.extract({ documents });
assert.equal('made_up_rule' in output.fields, false);
assert.equal('customer_notified' in output.fields, false);
assert.equal(output.fields.invoice_total.value, 1000);
assert.equal(output.contract_errors.length, 2);
const confidenceResult = validateExtraction(output, policy);
assert.equal(confidenceResult.safe_to_continue, false);
assert.ok(confidenceResult.rejected.some(x => x.field === 'extractor_contract'));

const instructions = extractorInstructions(catalog);
assert.match(instructions, /Ikke gjør juridiske vurderinger/);
assert.match(instructions, /Ikke gjett/);
assert.match(instructions, /Ingen lovnavn, paragrafer/);
assert.match(instructions, /kilderoller=/);
assert.match(instructions, /positive-only/i);
assert.match(instructions, /preliminary_examination_fee/);
assert.match(instructions, /additional_work_authorization_documented/);

console.log('OK extractor contract with source-role provenance and positive-only evidence boundaries');
