import { isApprovedDurableMediumType } from './checkout-consent.mjs';

function deliveryError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createAgreementConfirmationDeliveryService({ checkoutConsentService, deliveryAdapter, clock = () => new Date(), audit = null } = {}) {
  if (!checkoutConsentService?.getConfirmationForDelivery || !checkoutConsentService?.markConfirmationDelivered) {
    throw new Error('Agreement confirmation delivery requires checkout consent service.');
  }
  if (!deliveryAdapter?.deliverAgreementConfirmation) {
    throw new Error('Agreement confirmation delivery requires durable-medium delivery adapter.');
  }

  async function record({ case_id, owner_id, outcome, metadata = {} }) {
    if (!audit?.record) return;
    await audit.record({
      actor_id: owner_id,
      case_id,
      action: 'agreement_confirmation.delivery',
      outcome,
      metadata
    });
  }

  async function deliverForCase({ case_id, owner_id, checkout_consent_id = null } = {}) {
    const prepared = await checkoutConsentService.getConfirmationForDelivery({ case_id, owner_id, checkout_consent_id });
    if (prepared.record.durable_medium_delivered_at && prepared.record.durable_medium_type) {
      return {
        delivered: true,
        duplicate: true,
        checkout_consent_id: prepared.record.id,
        medium_type: prepared.record.durable_medium_type,
        delivered_at: prepared.record.durable_medium_delivered_at,
        provider_reference: prepared.record.durable_medium_provider_reference ?? null
      };
    }

    const delivery = await deliveryAdapter.deliverAgreementConfirmation({
      owner_id,
      case_id,
      checkout_consent_id: prepared.record.id,
      confirmation: prepared.confirmation
    });

    if (delivery?.delivered !== true) {
      await record({ case_id, owner_id, outcome: 'rejected', metadata: { reason: 'delivery_not_confirmed' } });
      throw deliveryError('Durable-medium provider did not confirm agreement delivery.', 'durable_delivery_not_confirmed');
    }
    if (!isApprovedDurableMediumType(delivery.medium_type)) {
      await record({ case_id, owner_id, outcome: 'rejected', metadata: { reason: 'invalid_medium', medium_type: delivery?.medium_type ?? null } });
      throw deliveryError('Agreement delivery provider returned a non-durable or unsupported medium.', 'invalid_durable_medium');
    }

    const providerDeliveredAt = delivery.delivered_at ? new Date(delivery.delivered_at) : null;
    const deliveredAt = providerDeliveredAt && !Number.isNaN(providerDeliveredAt.getTime())
      ? providerDeliveredAt.toISOString()
      : (typeof clock === 'function' ? clock() : new Date()).toISOString();

    const saved = await checkoutConsentService.markConfirmationDelivered({
      case_id,
      owner_id,
      checkout_consent_id: prepared.record.id,
      medium_type: delivery.medium_type,
      provider_reference: delivery.provider_reference ?? null,
      delivered_at: deliveredAt
    });

    await record({
      case_id,
      owner_id,
      outcome: 'success',
      metadata: {
        checkout_consent_id: prepared.record.id,
        medium_type: saved.record.durable_medium_type,
        provider_reference: saved.record.durable_medium_provider_reference ?? null
      }
    });

    return {
      delivered: true,
      duplicate: saved.duplicate === true,
      checkout_consent_id: prepared.record.id,
      medium_type: saved.record.durable_medium_type,
      delivered_at: saved.record.durable_medium_delivered_at,
      provider_reference: saved.record.durable_medium_provider_reference ?? null
    };
  }

  return { deliverForCase };
}
