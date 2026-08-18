import assert from 'node:assert/strict';
import { createValidatedAiAdapters } from '../server/ai-adapter-factory.mjs';

const catalog = { fields: { invoice_total: { type: 'number' }, invoice_number: { type: 'string' } } };
const client = {
  async runStructured(request) {
    if (request.task.includes('document')) {
      return { fields: {
        invoice_total: { value: 1000, confidence: 0.99, source_document_id: 'doc-1', source_page: 1 },
        illegal_rule: { value: '§ 999', confidence: 1, source_document_id: 'doc-1', source_page: 1 }
      }};
    }
    return { items: [{ finding_code: 'F1', coverage: 'partial', answer_text: 'Vi undersøker.', documentation_required: false, documentation_provided: false }] };
  }
};
const adapters = createValidatedAiAdapters({ documentClient: client, extractionCatalog: catalog });
const extracted = await adapters.extractor.extract({ case_id: 'case-1', documents: [{ id: 'doc-1', role: 'invoice', object_bucket: 'private', object_key: 'k' }] });
assert.equal(extracted.fields.invoice_total.value, 1000);
assert.equal('illegal_rule' in extracted.fields, false);
assert.equal(extracted.contract_errors.length, 1);

const interpreted = await adapters.responseInterpreter.interpret({ original_findings: [{ code: 'F1', title: 'Pris', explanation: 'Forklar' }], response_text: 'Vi undersøker.' });
assert.equal(interpreted.items.length, 1);
assert.equal(interpreted.items[0].finding_code, 'F1');

console.log('OK validated AI adapter composition');
