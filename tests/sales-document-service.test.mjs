import assert from 'node:assert/strict';
import { createSalesDocumentService } from '../server/sales-document-service.mjs';

const policy = {
  version: 'sales-v1', enabled: true, currency: 'NOK',
  numbering: { mode: 'adapter_controlled_sequence', require_atomic_next_number: true, sequence_prefix: 'FS' },
  seller: {
    ready: true, legal_name: 'Fakturasjekk Test AS', organization_number: '999999999', postal_address: 'Testveien 1, 0001 Oslo',
    organization_form: 'AS', registered_in_business_register: true, registered_in_vat: true
  },
  vat_treatment: { status: 'registered_standard', rate_percent: 25 },
  retention: { class: 'primary_accounting_material', minimum_years_after_financial_year_end: 5, must_be_separate_from_case_retention: true, immutable_after_issue: true }
};

function harness({ deliveryResult = { delivered: true, medium_type: 'email_pdf', delivered_at: '2026-08-20T08:10:00.000Z', provider_reference: 'mail-1' } } = {}) {
  const ledgerState = { reservation: null, finalized: [], deliveries: [] };
  const ledger = {
    async reserve(input) {
      if (!ledgerState.reservation) ledgerState.reservation = { status: 'new', document_number: 'FS-2026-000001', issued_at: '2026-08-20T08:09:00.000Z', document: null, delivery: null, key: input.idempotency_key };
      return structuredClone(ledgerState.reservation);
    },
    async finalizeImmutable({ document }) {
      ledgerState.finalized.push(document);
      ledgerState.reservation.document = document;
    },
    async markDelivered(input) {
      ledgerState.deliveries.push(input);
      ledgerState.reservation.delivery = { delivered: true, ...input };
    }
  };
  let deliveryCalls = 0;
  const service = createSalesDocumentService({
    caseStore: {
      async getOwned() {
        return {
          id: 'case-1', owner_id: 'u1',
          payments: [{ status: 'paid', verified_server_side: true, provider: 'vipps', provider_reference: 'pay-1', amount_minor: 2900, currency: 'NOK', paid_at: '2026-08-20T08:01:00.000Z' }]
        };
      }
    },
    checkoutConsentService: {
      async getLatestCompatible() {
        return { record: {
          accepted_at: '2026-08-20T08:00:00.000Z', product_name: 'Full Fakturasjekk + utkast til innsigelse',
          buyer_identity_snapshot: { name: 'Ola Nordmann', postal_address: 'Storgata 1, 0001 Oslo' }
        }};
      }
    },
    ledger,
    deliveryAdapter: {
      async deliverSalesDocument() { deliveryCalls += 1; return deliveryResult; }
    },
    policy,
    clock: () => '2026-08-20T08:09:00.000Z'
  });
  return { service, ledgerState, getDeliveryCalls: () => deliveryCalls };
}

{
  const { service, ledgerState, getDeliveryCalls } = harness();
  const result = await service.issueAndDeliver({ case_id: 'case-1', owner_id: 'u1', service_delivered_at: '2026-08-20T08:08:59.000Z' });
  assert.equal(result.issued, true);
  assert.equal(result.delivered, true);
  assert.equal(result.document_number, 'FS-2026-000001');
  assert.equal(result.medium_type, 'email_pdf');
  assert.equal(ledgerState.finalized.length, 1);
  assert.equal(ledgerState.finalized[0].payment.provider_reference, 'pay-1');
  assert.equal(ledgerState.finalized[0].buyer.name, 'Ola Nordmann');
  assert.equal(ledgerState.finalized[0].vat.vat_minor, 580);
  assert.equal(ledgerState.deliveries.length, 1);
  assert.equal(getDeliveryCalls(), 1);
}

{
  const { service, ledgerState, getDeliveryCalls } = harness();
  await service.issueAndDeliver({ case_id: 'case-1', owner_id: 'u1' });
  const second = await service.issueAndDeliver({ case_id: 'case-1', owner_id: 'u1' });
  assert.equal(second.duplicate, true);
  assert.equal(second.document_number, 'FS-2026-000001');
  assert.equal(ledgerState.finalized.length, 1, 'same payment must not create a second immutable document');
  assert.equal(ledgerState.deliveries.length, 1);
  assert.equal(getDeliveryCalls(), 1);
}

{
  const { service, ledgerState } = harness({ deliveryResult: { delivered: false, medium_type: 'email_pdf' } });
  await assert.rejects(() => service.issueAndDeliver({ case_id: 'case-1', owner_id: 'u1' }), error => error?.code === 'sales_document_delivery_not_confirmed');
  assert.equal(ledgerState.finalized.length, 1, 'issued accounting document remains immutable even if customer delivery must be retried');
  assert.equal(ledgerState.deliveries.length, 0);
}

{
  const { service, ledgerState } = harness({ deliveryResult: { delivered: true, medium_type: 'web_link' } });
  await assert.rejects(() => service.issueAndDeliver({ case_id: 'case-1', owner_id: 'u1' }), error => error?.code === 'invalid_durable_medium');
  assert.equal(ledgerState.finalized.length, 1);
  assert.equal(ledgerState.deliveries.length, 0);
}

console.log('OK sales document service reserves one number per paid provider reference, persists immutable accounting material and retries delivery without duplicate issuance.');
