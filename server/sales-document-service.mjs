import { buildSalesDocument, assertSalesDocumentReady } from './sales-document.mjs';
import { isApprovedDurableMediumType } from './checkout-consent.mjs';

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Sales document clock is invalid.'), { code: 'sales_document_invalid_input' });
  return date.toISOString();
}

function paymentKey(payment) {
  if (!payment?.provider || !payment?.provider_reference) return null;
  return `${payment.provider}:${payment.provider_reference}`;
}

export function createSalesDocumentService({ caseStore, checkoutConsentService, ledger, deliveryAdapter, policy, clock = () => new Date(), audit = null } = {}) {
  if (!caseStore?.getOwned) throw new Error('Sales document service requires case store.');
  if (!checkoutConsentService?.getLatestCompatible) throw new Error('Sales document service requires checkout consent service.');
  for (const method of ['reserve', 'finalizeImmutable', 'markDelivered']) {
    if (typeof ledger?.[method] !== 'function') throw new Error(`Sales document ledger requires ${method}.`);
  }
  if (!deliveryAdapter?.deliverSalesDocument) throw new Error('Sales document service requires sales-document delivery adapter.');
  assertSalesDocumentReady(policy);

  async function record({ case_id, owner_id, outcome, metadata = {} }) {
    if (!audit?.record) return;
    await audit.record({ actor_id: owner_id, case_id, action: 'sales_document.issue_and_deliver', outcome, metadata });
  }

  async function issueAndDeliver({ case_id, owner_id, service_delivered_at = null } = {}) {
    const caseData = await caseStore.getOwned(case_id, owner_id);
    const payment = [...(caseData.payments ?? [])].reverse().find(item => item?.status === 'paid' && item?.verified_server_side === true);
    if (!payment) throw Object.assign(new Error('Verified paid payment is required before sales document issuance.'), { code: 'payment_required' });
    const key = paymentKey(payment);
    if (!key) throw Object.assign(new Error('Payment provider reference is required.'), { code: 'sales_document_invalid_input' });

    const { record: checkout } = await checkoutConsentService.getLatestCompatible({ case_id, owner_id });
    if (!checkout?.buyer_identity_snapshot?.name || !checkout?.buyer_identity_snapshot?.postal_address) {
      throw Object.assign(new Error('Buyer identity is required for sales document issuance.'), { code: 'buyer_identity_required' });
    }

    const deliveredAt = service_delivered_at ? nowIso(() => service_delivered_at) : nowIso(clock);
    const issuedAt = nowIso(clock);
    const reservation = await ledger.reserve({
      idempotency_key: key,
      payment_provider: payment.provider,
      payment_provider_reference: payment.provider_reference,
      issued_at: issuedAt,
      sequence_prefix: policy.numbering.sequence_prefix ?? 'FS'
    });
    if (!reservation?.document_number) throw Object.assign(new Error('Accounting ledger did not reserve a document number.'), { code: 'sales_document_sequence_unavailable' });

    let document = reservation.document ?? null;
    if (!document) {
      document = buildSalesDocument({
        policy,
        document_number: reservation.document_number,
        issued_at: reservation.issued_at ?? issuedAt,
        service_delivered_at: deliveredAt,
        payment_due_at: checkout.accepted_at,
        paid_at: payment.paid_at,
        payment_provider: payment.provider,
        payment_provider_reference: payment.provider_reference,
        buyer: checkout.buyer_identity_snapshot,
        product_name: checkout.product_name,
        amount_minor: payment.amount_minor,
        case_reference: case_id
      });
      await ledger.finalizeImmutable({ idempotency_key: key, document });
    }

    if (reservation.delivery?.delivered === true) {
      return {
        issued: true,
        delivered: true,
        duplicate: true,
        document_number: document.document_number,
        medium_type: reservation.delivery.medium_type ?? null,
        delivered_at: reservation.delivery.delivered_at ?? null
      };
    }

    const delivery = await deliveryAdapter.deliverSalesDocument({
      owner_id,
      case_id,
      document_number: document.document_number,
      sales_document: document
    });
    if (delivery?.delivered !== true) {
      await record({ case_id, owner_id, outcome: 'delivery_failed', metadata: { document_number: document.document_number } });
      throw Object.assign(new Error('Sales document delivery was not confirmed.'), { code: 'sales_document_delivery_not_confirmed', document_number: document.document_number });
    }
    if (!isApprovedDurableMediumType(delivery.medium_type)) {
      throw Object.assign(new Error('Sales document delivery used an unsupported medium.'), { code: 'invalid_durable_medium' });
    }

    const providerTime = delivery.delivered_at ? new Date(delivery.delivered_at) : null;
    const deliveryTime = providerTime && !Number.isNaN(providerTime.getTime()) ? providerTime.toISOString() : nowIso(clock);
    await ledger.markDelivered({
      idempotency_key: key,
      document_number: document.document_number,
      medium_type: delivery.medium_type,
      delivered_at: deliveryTime,
      provider_reference: delivery.provider_reference ?? null
    });
    await record({
      case_id,
      owner_id,
      outcome: 'success',
      metadata: { document_number: document.document_number, medium_type: delivery.medium_type }
    });

    return {
      issued: true,
      delivered: true,
      duplicate: reservation.status === 'existing',
      document_number: document.document_number,
      medium_type: delivery.medium_type,
      delivered_at: deliveryTime
    };
  }

  return { issueAndDeliver };
}
