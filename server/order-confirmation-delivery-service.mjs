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
        // Provider adapters must use this stable key for send-side idempotency. It
        // protects against duplicate delivery if the provider accepted a message
        // but persistence of ORDER_CONFIRMATION_DELIVERED failed afterwards.
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

    if (delivery?.delivered !== true) {
      throw deliveryError('order_confirmation_delivery_unconfirmed', 'Delivery provider did not confirm durable-medium delivery.');
    }
    const medium = requiredString(delivery.medium, 'order_confirmation_delivery_medium_missing', 'Delivery provider did not report a durable medium.');
    const deliveryReference = delivery.delivery_reference == null ? null : String(delivery.delivery_reference).slice(0, 200);

    const marked = await orderConfirmationService.markDelivered({
      case_id: caseId,
      owner_id: ownerId,
      confirmation_id: confirmation.confirmation_id,
      medium,
      delivery_reference: deliveryReference
    });

    return {
      delivered: marked.confirmation?.durable_medium_delivered === true,
      idempotent: marked.updated === false,
      confirmation: marked.confirmation,
      medium: marked.confirmation?.durable_medium ?? medium,
      delivery_reference: marked.confirmation?.delivery_reference ?? deliveryReference
    };
  }

  return { deliverPrepared };
}
