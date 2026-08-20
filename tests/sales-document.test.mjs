import assert from 'node:assert/strict';
import { salesDocumentReadiness, assertSalesDocumentReady, calculateGrossVat, buildSalesDocument } from '../server/sales-document.mjs';

const basePolicy = {
  version: 'sales-v1',
  enabled: true,
  currency: 'NOK',
  numbering: { mode: 'adapter_controlled_sequence', require_atomic_next_number: true },
  seller: {
    ready: true,
    legal_name: 'Fakturasjekk Test AS',
    organization_number: '999999999',
    postal_address: 'Testveien 1, 0001 Oslo',
    organization_form: 'AS',
    registered_in_business_register: true,
    registered_in_vat: true
  },
  vat_treatment: { status: 'registered_standard', rate_percent: 25 },
  retention: {
    class: 'primary_accounting_material',
    minimum_years_after_financial_year_end: 5,
    must_be_separate_from_case_retention: true,
    immutable_after_issue: true
  }
};

assert.equal(salesDocumentReadiness(basePolicy).ready, true);
const unresolved = structuredClone(basePolicy);
unresolved.vat_treatment.status = 'unresolved';
assert.equal(salesDocumentReadiness(unresolved).ready, false);
assert.ok(salesDocumentReadiness(unresolved).missing.includes('vat_treatment.status'));
assert.throws(() => assertSalesDocumentReady(unresolved), error => error?.code === 'sales_document_not_ready');

const vat = calculateGrossVat({ gross_minor: 2900, rate_percent: 25 });
assert.deepEqual(vat, { gross_minor: 2900, net_minor: 2320, vat_minor: 580, rate_percent: 25 });

const document = buildSalesDocument({
  policy: basePolicy,
  document_number: 'FS-2026-000001',
  issued_at: '2026-08-20T09:10:00+02:00',
  service_delivered_at: '2026-08-20T09:09:59+02:00',
  payment_due_at: '2026-08-20T09:00:00+02:00',
  paid_at: '2026-08-20T09:01:00+02:00',
  payment_provider: 'vipps',
  payment_provider_reference: 'pay-123',
  buyer: { name: 'Ola Nordmann', postal_address: 'Storgata 1, 0001 Oslo' },
  product_name: 'Full Fakturasjekk + utkast til innsigelse',
  amount_minor: 2900,
  case_reference: 'case-1'
});
assert.equal(document.document_number, 'FS-2026-000001');
assert.equal(document.payment.amount_nok, 29);
assert.equal(document.vat.vat_minor, 580);
assert.equal(document.vat.net_minor, 2320);
assert.equal(document.seller.registered_in_vat, true);
assert.equal(document.buyer.name, 'Ola Nordmann');
assert.equal(document.retention.separate_from_case_retention, true);
assert.equal(document.retention.minimum_years_after_financial_year_end, 5);
assert.ok(Object.isFrozen(document));

const notRegisteredPolicy = structuredClone(basePolicy);
notRegisteredPolicy.seller.registered_in_vat = false;
notRegisteredPolicy.vat_treatment = { status: 'not_registered', rate_percent: null };
const noVatDocument = buildSalesDocument({
  policy: notRegisteredPolicy,
  document_number: 'FS-2026-000002',
  issued_at: '2026-08-20T09:10:00+02:00',
  service_delivered_at: '2026-08-20T09:09:59+02:00',
  payment_due_at: '2026-08-20T09:00:00+02:00',
  paid_at: '2026-08-20T09:01:00+02:00',
  payment_provider: 'vipps',
  payment_provider_reference: 'pay-124',
  buyer: { name: 'Kari Nordmann', postal_address: 'Storgata 2, 0001 Oslo' },
  amount_minor: 2900
});
assert.equal(noVatDocument.vat.treatment, 'not_registered');
assert.equal(noVatDocument.vat.vat_minor, null);
assert.equal(noVatDocument.vat.net_minor, 2900);

const conflict = structuredClone(basePolicy);
conflict.vat_treatment = { status: 'not_registered', rate_percent: null };
assert.equal(salesDocumentReadiness(conflict).ready, false);
assert.ok(salesDocumentReadiness(conflict).missing.includes('vat_treatment.conflict'));

assert.throws(() => buildSalesDocument({
  policy: basePolicy,
  document_number: 'FS-2026-000003',
  issued_at: '2026-08-20T09:10:00+02:00',
  service_delivered_at: '2026-08-20T09:09:59+02:00',
  payment_due_at: '2026-08-20T09:00:00+02:00',
  paid_at: '2026-08-20T09:01:00+02:00',
  buyer: { name: 'Mangelfull kjøper' },
  amount_minor: 2900
}), error => error?.code === 'buyer_identity_required');

console.log('OK sales document builder fails closed on VAT status and requires sequence, buyer identity and accounting retention.');
