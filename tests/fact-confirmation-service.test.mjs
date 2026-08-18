import assert from 'node:assert/strict';
import { createBackendServices } from '../server/services.mjs';
import { createMemoryCaseStore, createMemoryStorage } from '../server/reference-adapters.mjs';

const caseStore = createMemoryCaseStore();
const storage = createMemoryStorage();
const extractor = {
  async extract({ documents }) {
    const invoice = documents.find(d => d.role === 'invoice');
    return { fields: {
      invoice_total: { value: 1499, confidence: 0.80, source_document_id: invoice.id, source_page: 1 },
      invoice_number: { value: 'INV-LOW', confidence: 0.99, source_document_id: invoice.id, source_page: 1 }
    }};
  }
};
const registry = { engine_version: '0.61.0', rules: [] };
const product = { price_nok: 29, full_check_free: false };
const uploadPolicy = {
  max_files: 8, max_file_bytes: 1000000, max_total_bytes: 5000000,
  allowed_mime_types: ['application/pdf'], allowed_extensions: ['.pdf'],
  required_roles: ['invoice'], allowed_roles: ['invoice','other']
};
const extractionPolicy = { critical_fields: ['invoice_total','invoice_number'], min_confidence: { critical: 0.95, standard: 0.85 }, require_source_location: true };
const extractionCatalog = { fields: { invoice_total: { type: 'number' }, invoice_number: { type: 'string' } } };
const services = createBackendServices({
  registry, product, uploadPolicy, extractionPolicy, extractionCatalog,
  retentionPolicy: { modes: {} }, adapters: { caseStore, storage, extractor },
  clock: () => '2026-08-18T15:00:00.000Z'
});

let caseData = await services.createNewCase({ owner_id: 'u1', buyer_type: 'consumer', subject: 'goods' });
const upload = await services.registerUploads({ case_id: caseData.id, owner_id: 'u1', files: [{ name: 'faktura.pdf', mime_type: 'application/pdf', size: 1000, role: 'invoice' }] });
assert.equal(upload.accepted, true);
const documentId = upload.case.documents[0].id;

const first = await services.analyzeStoredCase({ case_id: caseData.id, owner_id: 'u1' });
assert.equal(first.status, 'needs_confirmation');
assert.deepEqual(first.extraction.confirmation_needs.map(x => x.field), ['invoice_total']);
assert.equal(first.case.analyses.length, 0);

const confirmation = await services.confirmFacts({
  case_id: caseData.id, owner_id: 'u1',
  items: [{ field: 'invoice_total', value: 1499, source_document_id: documentId, source_page: 1, confirmed_by_user: true }]
});
assert.equal(confirmation.confirmed, true);
assert.equal(confirmation.remaining_needs.length, 0);

const second = await services.analyzeStoredCase({ case_id: caseData.id, owner_id: 'u1' });
assert.equal(second.status, 'analysis_ready');
assert.equal(second.case.state, 'analysis_ready');
const stored = await caseStore.getOwned(caseData.id, 'u1');
const evidence = stored.analyses.at(-1).result.evidence;
const totalEvidence = evidence.find(e => e.field === 'invoice_total');
assert.equal(totalEvidence.type, 'user_provided');
assert.match(totalEvidence.note, /Ikke maskinelt dokumentert/);
const numberEvidence = evidence.find(e => e.field === 'invoice_number');
assert.equal(numberEvidence.type, 'documented');

console.log('OK low-confidence confirmation service flow');
