import { ApiError } from './api-errors.mjs';

export function createOrderConfirmationDeliveryWebhookService({ deliveryAdapter, orderConfirmationService, audit = null } = {}) {
  if (!deliveryAdapter?.verifyWebhook) throw new Error('Order confirmation delivery webhook requires provider verifyWebhook.');
  if (!orderConfirmationService?.getLatestPrepared || !orderConfirmationService?.markDelivered) {
    throw new Error('Order confirmation delivery webhook requires order confirmation service.');
  }

  async function auditSafe(entry) {
    if (!audit?.log) return;
    try { await audit.log(entry); } catch {}
  }

  async function process({ headers, raw_body }) {
    const event = deliveryAdapter.verifyWebhook({ headers, raw_body });
    if (!event?.authenticated) return { accepted: false, delivered: false };

    let prepared;
    try {
      prepared = await orderConfirmationService.getLatestPrepared({ case_id: event.case_id, owner_id: event.owner_id });
    } catch {
      // The event is authentic, but the customer may already have deleted the case.
      // Acknowledge it so the provider does not retry indefinitely; no state is recreated.
      await auditSafe({
        actor_id: null,
        case_id: event.case_id,
        action: 'order_confirmation_delivery_webhook',
        outcome: 'ignored_missing_case',
        metadata: { provider: event.provider, event: event.event }
      });
      return { accepted: true, delivered: false, ignored: true };
    }

    const confirmation = prepared.confirmation;
    if (
      confirmation.confirmation_id !== event.confirmation_id ||
      confirmation.delivery_provider_accepted !== true ||
      confirmation.delivery_provider !== event.provider ||
      confirmation.delivery_reference !== event.delivery_reference
    ) {
      await auditSafe({
        actor_id: event.owner_id,
        case_id: event.case_id,
        action: 'order_confirmation_delivery_webhook',
        outcome: 'provider_conflict',
        metadata: { provider: event.provider, event: event.event }
      });
      // Authentic but stale/conflicting events are acknowledged and never mutate a case.
      return { accepted: true, delivered: false, conflict: true };
    }

    if (event.delivered === true) {
      const marked = await orderConfirmationService.markDelivered({
        case_id: event.case_id,
        owner_id: event.owner_id,
        confirmation_id: event.confirmation_id,
        medium: 'email',
        provider: event.provider,
        delivery_reference: event.delivery_reference
      });
      await auditSafe({
        actor_id: event.owner_id,
        case_id: event.case_id,
        action: 'order_confirmation_delivery_webhook',
        outcome: marked.updated === false ? 'duplicate_delivered' : 'delivered',
        metadata: { provider: event.provider, event: event.event }
      });
      return { accepted: true, delivered: true, idempotent: marked.updated === false };
    }

    const outcome = event.terminal_failure ? 'terminal_failure' : (event.retryable_failure ? 'provider_deferred' : 'provider_status');
    await auditSafe({
      actor_id: event.owner_id,
      case_id: event.case_id,
      action: 'order_confirmation_delivery_webhook',
      outcome,
      metadata: { provider: event.provider, event: event.event }
    });
    return {
      accepted: true,
      delivered: false,
      terminal_failure: event.terminal_failure === true,
      retryable_failure: event.retryable_failure === true
    };
  }

  return { process };
}

export function createOrderConfirmationDeliveryWebhookHandler({ webhookService, expectedProvider = null } = {}) {
  return {
    async order_confirmation_delivery_webhook(request) {
      if (!webhookService?.process) throw new ApiError(503, 'delivery_webhook_unavailable', 'Leveringsstatus er ikke konfigurert.');
      if (expectedProvider && request.params?.provider !== expectedProvider) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
      const result = await webhookService.process({ headers: request.headers ?? {}, raw_body: request.raw_body ?? '' });
      if (!result.accepted) throw new ApiError(401, 'invalid_delivery_webhook', 'Leveringshendelsen kunne ikke verifiseres.');
      return { status: 200, body: { accepted: true } };
    }
  };
}
