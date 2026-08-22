import { buildDownloadableOrderConfirmation } from './order-confirmation-document.mjs';

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredString(value, code, message) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw deliveryError(code, message);
  return normalized;
}

export function createOrderConfirmationDeliveryService({ orderConfirmationService, deliveryAdapter } = {}) {
  if (!orderConfirmationService?.getLatestPrepared || !orderConfirmationService?.markDelivered) {
    throw new Error('Order confirmation delivery requires getLatestPrepared and markDelivered support.');
  }
  if (!deliveryAdapter?.deliverOrderConfirmation) {
    throw new Error('Order confirmation delivery adapter requires deliverOrderConfirmation.');
  }

  async function deliverPrepared({ case_id, owner_id, confirmation_id = null } = {}) {
    const caseId = requiredString(case_id, 'case_id_required', 'case_id is required.');
    const ownerId = requiredString(owner_id, 'owner_id_required', 'owner_id is required.');
    const prepared = await orderConfirmationService.getLatestPrepared({ case_id: caseId, owner_id: ownerId });
    const confirmation = prepared.confirmation;

    if (confirmation_id != null && String(confirmation_id) !== confirmation.confirmation_id) {
      throw deliveryError('order_confirmation_mismatch', 'Requested order confirmation is not the latest prepared confirmation.');
    }

    if (confirmation.durable_medium_delivered === true) {
      return {
        delivered: true,
        accepted: true,
        pending_provider_confirmation: false,
        idempotent: true,
        confirmation,
        medium: confirmation.durable_medium ?? null,
        delivery_reference: confirmation.delivery_reference ?? null
      };
    }

    // Provider acceptance is persisted independently from inbox delivery. Once a
    // provider has accepted a concrete message-id, retries must not send a duplicate.
    if (confirmation.delivery_provider_accepted === true) {
      return {
        delivered: false,
        accepted: true,
        pending_provider_confirmation: true,
        idempotent: true,
        confirmation,
        medium: confirmation.durable_medium ?? null,
        delivery_reference: confirmation.delivery_reference ?? null
      };
    }

    const textDocument = buildDownloadableOrderConfirmation(confirmation, { format: 'text' });
    const htmlDocument = buildDownloadableOrderConfirmation(confirmation, { format: 'html' });

    let delivery;
    try {
      delivery = await deliveryAdapter.deliverOrderConfirmation({
        case_id: caseId,
        owner_id: ownerId,
        confirmation_id: confirmation.confirmation_id,
        recipient_email: confirmation.delivery_contact?.medium === 'email' ? confirmation.delivery_contact.address : null,
        // Provider adapters must use this stable key for send-side idempotency. It
        // protects against duplicate delivery during network uncertainty before
        // provider acceptance can be persisted.
        idempotency_key: confirmation.confirmation_id,
        subject: 'Fakturasjekk – ordrebekreftelse og betalingskvittering',
        text: textDocument.body,
        html: htmlDocument.body,
        documents: {
          text: {
            filename: textDocument.filename,
            content_type: textDocument.content_type,
            body: textDocument.body
          },
          html: {
            filename: htmlDocument.filename,
            content_type: htmlDocument.content_type,
            body: htmlDocument.body
          }
        }
      });
    } catch (cause) {
      const error = deliveryError('order_confirmation_delivery_failed', 'Order confirmation delivery failed before provider confirmation.');
      error.cause = cause;
      throw error;
    }

    const medium = requiredString(delivery?.medium, 'order_confirmation_delivery_medium_missing', 'Delivery provider did not report a durable medium.');
    const provider = delivery?.provider == null ? null : String(delivery.provider).slice(0, 80);
    const deliveryReference = delivery?.delivery_reference == null ? null : String(delivery.delivery_reference).slice(0, 200);

    if (delivery?.delivered === true) {
      const marked = await orderConfirmationService.markDelivered({
        case_id: caseId,
        owner_id: ownerId,
        confirmation_id: confirmation.confirmation_id,
        medium,
        provider,
        delivery_reference: deliveryReference
      });
      return {
        delivered: marked.confirmation?.durable_medium_delivered === true,
        accepted: true,
        pending_provider_confirmation: false,
        idempotent: marked.updated === false,
        confirmation: marked.confirmation,
        medium: marked.confirmation?.durable_medium ?? medium,
        delivery_reference: marked.confirmation?.delivery_reference ?? deliveryReference
      };
    }

    if (delivery?.accepted === true) {
      if (!orderConfirmationService?.markProviderAccepted) {
        throw deliveryError('order_confirmation_provider_acceptance_unsupported', 'Order confirmation service cannot persist provider acceptance.');
      }
      const providerName = requiredString(provider, 'order_confirmation_delivery_provider_missing', 'Delivery provider did not identify itself.');
      const reference = requiredString(deliveryReference, 'order_confirmation_delivery_reference_missing', 'Delivery provider did not return a message reference.');
      const marked = await orderConfirmationService.markProviderAccepted({
        case_id: caseId,
        owner_id: ownerId,
        confirmation_id: confirmation.confirmation_id,
        medium,
        provider: providerName,
        delivery_reference: reference
      });
      return {
        delivered: false,
        accepted: true,
        pending_provider_confirmation: true,
        idempotent: marked.updated === false,
        confirmation: marked.confirmation,
        medium: marked.confirmation?.durable_medium ?? medium,
        delivery_reference: marked.confirmation?.delivery_reference ?? reference
      };
    }

    throw deliveryError('order_confirmation_delivery_unconfirmed', 'Delivery provider did not confirm message acceptance or durable-medium delivery.');
  }

  return { deliverPrepared };
}
