import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createBackendServices } from '../server/services.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createMemorySignedStorage } from '../server/reference-signed-storage.mjs';
import { createApi } from '../server/api.mjs';

const readJson = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const registry = readJson('../rules/rules.json');
const product = readJson('../config/product.json');
const uploadPolicy = readJson('../config/upload-policy.json');
const extractionPolicy = readJson('../config/extraction-policy.json');
const retentionPolicy = readJson('../config/retention-policy.json');
const caseStore = createMemoryCaseStore();
const storage = createMemorySignedStorage({ clock: () => new Date('2026-08-18T15:00:00Z') });
const extractor = {
  async extract({ documents }) {
    const invoice = documents.find(d => d.role === 'invoice');
    const quote = documents.find(d => d.role === 'quote');
    return { fields: {
      invoice_total: { value: 146000, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      invoice_number: { value: 'S-1', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      agreed_price: { value: 120000, confidence: 0.99, source_document_id: quote.id, source_page: 1 },
      price_basis: { value: 'estimate', confidence: 0.99, source_document_id: quote.id, source_page: 1 },
      surcharge_documented: { value: false, confidence: 0.99, source_document_id: quote.id, source_page: 1 }
    }};
  }
};
const services = createBackendServices({ registry, product, uploadPolicy, extractionPolicy, retentionPolicy, adapters: { caseStore, storage, extractor } });
const api = createApi({ services });
const auth = { user: { id: 'u1' } };

const created = await api.invoke('create_case', { auth, body: { buyer_type: 'consumer', subject: 'handcraft_service', retention_mode: 'temporary' } });
const caseId = created.body.id;
const registered = await api.invoke('register_uploads', {
  auth,
  params: { case_id: caseId },
  body: { files: [
    { name: 'faktura.pdf', mime_type: 'application/pdf', size: 100000, role: 'invoice' },
    { name: 'tilbud.pdf', mime_type: 'application/pdf', size: 100000, role: 'quote' }
  ] }
});
assert.equal(registered.status, 200);
assert.equal(registered.body.upload_targets.length, 2);
assert.ok(registered.body.upload_targets.every(t => t.upload_url.startsWith('https://')));
assert.equal(JSON.stringify(registered.body).includes('storage_key'), false);
assert.ok(registered.body.case.documents.every(d => d.status === 'awaiting_upload'));

const blocked = await api.invoke('analyze_case', { auth, params: { case_id: caseId }, body: {} });
assert.equal(blocked.status, 500);

for (const target of registered.body.upload_targets) {
  const entry = [...storage._objects.entries()].find(([, item]) => item.document_id === target.document_id);
  assert.ok(entry);
  await storage.simulateClientUpload({ storage_key: entry[0], owner_id: 'u1', byte_size: 100000, mime_type: 'application/pdf' });
  const confirmed = await api.invoke('confirm_document_upload', { auth, params: { case_id: caseId, document_id: target.document_id } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.document.status, 'uploaded');
  assert.equal(JSON.stringify(confirmed.body).includes('storage_key'), false);
}

const analyzed = await api.invoke('analyze_case', { auth, params: { case_id: caseId }, body: { user_note: 'Ikke varslet om tillegg.' } });
assert.equal(analyzed.status, 200);
assert.equal(analyzed.body.status, 'analysis_ready');
assert.equal(analyzed.body.preview.price_nok, 29);
assert.equal('extraction' in analyzed.body, false);
assert.equal(JSON.stringify(analyzed.body).includes('raw_text'), false);

console.log('OK signed upload privacy flow');
