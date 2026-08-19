export function createPaymentWebhookService({
  caseStore,
  services,
  gateway,
  eventStore,
  agreementConfirmationService = null,
  audit = null
} = {}) {
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
      return { accepted: true, paid: false, duplicate: false, conflict: true };
    }

    const caseData = await caseStore.getForSystem(confirmation.case_id);

    if (confirmation.status === 'authorized' && confirmation.operation_success === true) {
      if (Number(confirmation.amount_minor) !== 2900 || confirmation.currency !== 'NOK') {
        await record({ confirmation, action: 'payment.authorization', outcome: 'rejected', metadata: { reason: 'amount_or_currency_mismatch' } });
        return { accepted: true, paid: false, duplicate, capture_requested: false };
      }
      const capture = await gateway.captureAuthorized({ confirmation });
      await record({ confirmation, action: 'payment.capture_requested', outcome: capture?.captured ? 'success' : 'rejected', metadata: { duplicate } });
      return { accepted: true, paid: false, duplicate, capture_requested: capture?.captured === true };
    }

    if (confirmation.status === 'paid' && confirmation.operation_success === true) {
      const result = await services.confirmPayment({ case_id: confirmation.case_id, owner_id: caseData.owner_id, confirmation });
      let durableConfirmation = null;
      if (result.paid === true && agreementConfirmationService?.sendForPaidCase) {
        // This side effect is deliberately part of the webhook success path. If the
        // provider call fails, the payment webhook is not acknowledged so a signed
        // retry can recover. sendForPaidCase is itself idempotent at case/provider level.
        durableConfirmation = await agreementConfirmationService.sendForPaidCase({ case_id: confirmation.case_id });
      }
      await record({
        confirmation,
        outcome: result.paid ? 'success' : 'rejected',
        metadata: {
          duplicate,
          agreement_confirmation_sent: durableConfirmation?.sent === true,
          agreement_confirmation_delivered: durableConfirmation?.delivered === true
        }
      });
      return {
        accepted: true,
        paid: result.paid === true,
        duplicate,
        agreement_confirmation_sent: durableConfirmation?.sent === true,
        agreement_confirmation_delivered: durableConfirmation?.delivered === true
      };
    }

    await record({ confirmation, outcome: 'acknowledged', metadata: { duplicate, reason: 'non_payable_event' } });
    return { accepted: true, paid: false, duplicate };
  }

  return { process };
}
