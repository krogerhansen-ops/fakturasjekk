import { ApiError } from './api-errors.mjs';

export function createPaymentWebhookService({ caseStore, services, gateway, eventStore, audit = null } = {}) {
  if (!caseStore?.getForSystem) throw new Error('Case store requires getForSystem for payment webhooks.');
  if (!services?.confirmPayment) throw new Error('Backend services require confirmPayment.');
  if (!gateway?.verifyEvent) throw new Error('Payment gateway requires verifyEvent.');
  if (!eventStore?.claim) throw new Error('Payment event store requires atomic claim.');

  async function process({ headers, raw_body }) {
    const confirmation = await gateway.verifyEvent({ headers, raw_body });
    const claim = await eventStore.claim({
      provider: confirmation.provider,
      provider_reference: confirmation.provider_reference,
      case_id: confirmation.case_id
    });

    if (claim.status === 'conflict') {
      if (audit) await audit.record({ actor_id: null, case_id: confirmation.case_id, action: 'payment.webhook_replay_conflict', outcome: 'rejected', metadata: { payment_provider: confirmation.provider, status: 'provider_reference_conflict' } });
      throw new ApiError(409, 'payment_reference_conflict', 'Betalingsreferansen er allerede knyttet til en annen sak.');
    }
    if (claim.status === 'duplicate_same_case') {
      return { accepted: true, paid: true, duplicate: true };
    }

    const caseData = await caseStore.getForSystem(confirmation.case_id);
    const result = await services.confirmPayment({ case_id: confirmation.case_id, owner_id: caseData.owner_id, confirmation });
    if (audit) {
      await audit.record({
        actor_id: null,
        case_id: confirmation.case_id,
        action: 'payment.webhook',
        outcome: result.paid ? 'success' : 'rejected',
        metadata: { payment_provider: confirmation.provider, amount_minor: confirmation.amount_minor, currency: confirmation.currency, status: confirmation.status }
      });
    }
    return { accepted: result.paid === true, paid: result.paid === true, duplicate: false };
  }

  return { process };
}
