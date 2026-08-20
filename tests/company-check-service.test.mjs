import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createBackendServices } from '../server/services.mjs';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const registry = readJson('../rules/rules.json');
const product = readJson('../config/product.json');
const uploadPolicy = readJson('../config/upload-policy.json');
const extractionPolicy = readJson('../config/extraction-policy.json');
const extractionCatalog = readJson('../config/extraction-fields.json');
const retentionPolicy = readJson('../config/retention-policy.json');

const db = new Map();
let seq = 0;
const clock = () => new Date('2026-08-19T20:00:00+02:00');
const caseStore = {
  async nextId(prefix) { return `${prefix}-${++seq}`; },
  async save(value) { db.set(value.id, structuredClone(value)); return value; },
  async getOwned(id, ownerId) {
    const value = db.get(id);
    if (!value) throw new Error('Case not found');
    if (value.owner_id !== ownerId) throw new Error('Forbidden');
    return structuredClone(value);
  }
};
const storage = {
  async reservePrivateObject({ case_id, document_id }) { return `private/${case_id}/${document_id}`; },
  async listCaseDocuments({ records }) { return records.map(r => ({ ...r, uploaded: true })); }
};
const extractor = {
  async extract({ documents }) {
    const invoice = documents.find(d => d.role === 'invoice');
    return { fields: {
      invoice_total: { value: 12990, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      invoice_number: { value: 'BUTIKK-1', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      invoice_date: { value: '2024-03-15', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      seller_name: { value: 'Demo Butikk AS', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      seller_org_number: { value: '509100675', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      seller_mva_marker_present: { value: true, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      lines: { value: [{ description: 'TV', quantity: 1, unit_price: 12990 }], confidence: 0.99, source_document_id: invoice.id, source_page: 1 }
    }};
  }
};
const companyRegistry = {
  async lookupByOrganizationNumber(org) {
    assert.equal(org, '509100675');
    return {
      status: 'verified',
      entity: {
        organization_number: '509100675',
        name: 'Demo Butikk AS',
        organization_form: { code: 'AS', description: 'Aksjeselskap' },
        registered_in_vat: false,
        registered_in_business_register: true,
        bankrupt: false,
        under_liquidation: false,
        under_forced_liquidation_or_dissolution: false,
        deleted_date: null,
        registration_date: '2020-01-01',
        business_code: { code: '47.400', description: 'Detaljhandel' },
        business_address: null,
        source: 'brreg_enhetsregisteret',
        source_version: 'v2'
      }
    };
  },
  async searchByExactName() { throw new Error('org number lookup should have priority'); }
};

const services = createBackendServices({
  registry,
  product,
  uploadPolicy,
  extractionPolicy,
  extractionCatalog,
  retentionPolicy,
  adapters: { caseStore, storage, extractor, companyRegistry },
  clock
});

const owner = 'consumer-1';
const created = await services.createNewCase({ owner_id: owner, buyer_type: 'consumer', subject: 'goods' });
const uploads = await services.registerUploads({
  case_id: created.id,
  owner_id: owner,
  files: [{ name: 'faktura.pdf', mime_type: 'application/pdf', size: 50000, role: 'invoice' }]
});
assert.equal(uploads.accepted, true);

const analyzed = await services.analyzeStoredCase({ case_id: created.id, owner_id: owner });
assert.equal(analyzed.status, 'analysis_ready');
assert.equal(analyzed.preview.company_check_status, 'verified');

const stored = await caseStore.getOwned(created.id, owner);
const result = stored.analyses.at(-1).result;
assert.equal(result.company_check.status, 'verified');
assert.equal(result.company_check.comparison.organization_number, 'matches');
assert.equal(result.company_check.comparison.vat_marker, 'historical_status_unresolved');
assert.equal(result.company_check.comparison.vat_marker_basis, 'current_status_only');
assert.ok(result.company_check.flags.includes('seller_mva_historical_status_unresolved'));
assert.equal(result.company_check.flags.includes('seller_mva_marker_mismatch'), false);
assert.match(result.company_check.customer_note, /historisk MVA-status på fakturadato er ikke verifisert/i);
assert.equal(result.analysis.findings.some(f => f.code === 'SELLER_IDENTITY_FORMAL_MISMATCH'), false);
assert.ok(result.evidence.some(item => item.type === 'registry' && item.field === 'registry_seller_mva_registered'));
assert.equal(result.evidence.some(item => item.type === 'calculated' && item.field === 'seller_mva_marker_mismatch'), false);

console.log('OK backend keeps current Brreg MVA status separate from historical invoice-date status and does not create a false VAT mismatch.');
