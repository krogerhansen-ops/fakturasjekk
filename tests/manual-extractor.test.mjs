import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createManualExtractor, manualExtractorInstructions } from '../server/manual-extractor.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const extractor = createManualExtractor({ catalog });

const documents = [
  { id: 'invoice-1', role: 'invoice' },
  { id: 'quote-1', role: 'quote' }
];

const valid = await extractor.extract({
  documents,
  manual_fields: {
    invoice_number: { value: '10023', source_document_id: 'invoice-1', source_page: 1 },
    invoice_total: { value: 146000, source_document_id: 'invoice-1', source_page: 1 },
    agreed_price: { value: 120000, source_document_id: 'quote-1', source_page: 1 },
    price_basis: { value: 'estimate', source_document_id: 'quote-1', source_page: 1 }
  }
});
assert.deepEqual(valid.contract_errors, []);
assert.equal(valid.fields.invoice_total.value, 146000);
assert.equal(valid.fields.invoice_total.confidence, 1);
assert.equal(valid.fields.invoice_total.raw_text, null);

const wrongRole = await extractor.extract({
  documents,
  manual_fields: {
    agreed_price: { value: 120000, source_document_id: 'invoice-1', source_page: 1 }
  }
});
assert.equal(wrongRole.contract_errors.length, 1);
assert.match(wrongRole.contract_errors[0], /dokumentrollen invoice/);

const unknown = await extractor.extract({
  documents,
  manual_fields: {
    made_up_legal_conclusion: { value: 'invalid', source_document_id: 'invoice-1', source_page: 1 }
  }
});
assert.equal(unknown.contract_errors.length, 1);
assert.match(unknown.contract_errors[0], /Ukjent extractor-felt/);

const positiveOnlyFalse = await extractor.extract({
  documents,
  manual_fields: {
    additional_work_detected: { value: false, source_document_id: 'invoice-1', source_page: 1 }
  }
});
assert.equal(positiveOnlyFalse.contract_errors.length, 1);
assert.match(positiveOnlyFalse.contract_errors[0], /positive-only/);

await assert.rejects(
  () => extractor.extract({ documents, document_text: 'do not parse this', manual_fields: {} }),
  /does not accept document text/
);
await assert.rejects(
  () => extractor.extract({ documents, manual_fields: { invoice_total: { value: 100, source_document_id: 'invoice-1', source_page: 0 } } }),
  /source_page >= 1/
);

const instructions = manualExtractorInstructions().join(' ');
assert.match(instructions, /Ikke legg inn juridiske vurderinger/);
assert.match(instructions, /Ukjent eller tvetydig/);

console.log('manual-extractor.test.mjs passed');
