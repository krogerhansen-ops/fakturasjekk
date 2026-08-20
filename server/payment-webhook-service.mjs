export function createPaymentWebhookService({ caseStore, services, gateway, eventStore, audit = null, orderConfirmationService = null } = {}) {
  if (!caseStore?.getForSystem) throw new Error('Case store requires getForSystem for payment webhooks.');
  if (!services?.confirmPayment) throw new Error('Backend services require confirmPayment.');
  if (!gateway?.verifyEvent) throw new Error('Payment gateway requires verifyEvent.');
  if (!eventStore?.claim) throw new Error('Payment event store requires atomic claim.');

  async function record({ confirmation, action = 'payment.webhook', outcome, metadata = {} }) {
    if (!audit) return;
    await audit.record({
      actor_id: null,
      case_id: confirmation.case_id,
      action,
      outcome,
      metadata: {
        payment_provider: confirmation.provider,
        amount_minor: Number.isFinite(Number(confirmation.amount_minor)) ? Number(confirmation.amount_minor) : null,
        currency: confirmation.currency ?? null,
        status: confirmation.status ?? null,
        event_name: confirmation.event_name ?? null,
        ...metadata
      }
    });
  }

  async function process({ headers, raw_body }) {
    const confirmation = await gateway.verifyEvent({ headers, raw_body });
    const claim = await eventStore.claim({
      provider: confirmation.provider,
      provider_reference: confirmation.provider_reference,
      case_id: confirmation.case_id
    });
    const duplicate = claim.status === 'duplicate_same_case';

    if (claim.status === 'conflict') {
      await record({ confirmation, action: 'payment.webhook_replay_conflict', outcome: 'rejected', metadata: { status: 'provider_reference_conflict' } });
      // The webhook is authentic but cannot mutate any case. Acknowledge it so the
      // provider does not retry the same permanent conflict for days.
      return { accepted: true, paid: false, duplicate: false, conflict: true };
    }

    const caseData = await caseStore.getForSystem(confirmation.case_id);

    if (confirmation.status === 'authorized' && confirmation.operation_success === true) {
      if (Number(confirmation.amount_minor) !== 2900 || confirmation.currency !== 'NOK') {
        await record({ confirmation, action: 'payment.authorization', outcome: 'rejected', metadata: { reason: 'amount_or_currency_mismatch' } });
        return { accepted: true, paid: false, duplicate, capture_requested: false };
      }
      // Capture is provider-idempotent. We intentionally repeat this call on a
      // duplicate authenticated webhook so a transient failure after event claim can recover.
      const capture = await gateway.captureAuthorized({ confirmation });
      await record({ confirmation, action: 'payment.capture_requested', outcome: capture?.captured ? 'success' : 'rejected', metadata: { duplicate } });
      return { accepted: true, paid: false, duplicate, capture_requested: capture?.captured === true };
    }

    if (confirmation.status === 'paid' && confirmation.operation_success === true) {
      // confirmPayment is idempotent by provider reference. Reprocessing a signed
      // duplicate is deliberate so a transient database failure can recover.
      const result = await services.confirmPayment({ case_id: confirmation.case_id, owner_id: caseData.owner_id, confirmation });
      let orderConfirmationPrepared = false;
      let orderConfirmationId = null;

      // Preparing the durable-medium payload is provider-neutral and idempotent.
      // Actual delivery is a separate, explicit step; this must never be confused
      // with proof that an email/document was delivered to the customer.
      if (result.paid === true && orderConfirmationService?.prepare) {
        const prepared = await orderConfirmationService.prepare({ case_id: confirmation.case_id, owner_id: caseData.owner_id });
        orderConfirmationPrepared = Boolean(prepared?.confirmation);
        orderConfirmationId = prepared?.confirmation?.confirmation_id ?? null;
      }

      await record({
        confirmation,
        outcome: result.paid ? 'success' : 'rejected',
        metadata: { duplicate, order_confirmation_prepared: orderConfirmationPrepared }
      });
      return {
        accepted: true,
        paid: result.paid === true,
        duplicate,
        order_confirmation_prepared: orderConfirmationPrepared,
        order_confirmation_id: orderConfirmationId
      };
    }

    await record({ confirmation, outcome: 'acknowledged', metadata: { duplicate, reason: 'non_payable_event' } });
    return { accepted: true, paid: false, duplicate };
  }

  return { process };
}
