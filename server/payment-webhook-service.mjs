export function createPaymentWebhookService({ caseStore, services, gateway, audit = null } = {}) {
  if (!caseStore?.getForSystem) throw new Error('Case store requires getForSystem for payment webhooks.');
  if (!services?.confirmPayment) throw new Error('Backend services require confirmPayment.');
  if (!gateway?.verifyEvent) throw new Error('Payment gateway requires verifyEvent.');

  async function process({ headers, raw_body }) {
    const confirmation = await gateway.verifyEvent({ headers, raw_body });
    const caseData = await caseStore.getForSystem(confirmation.case_id);
    const result = await services.confirmPayment({
      case_id: confirmation.case_id,
      owner_id: caseData.owner_id,
      confirmation
    });
    if (audit) {
      await audit.record({
        actor_id: null,
        case_id: confirmation.case_id,
        action: 'payment.webhook',
        outcome: result.paid ? 'success' : 'rejected',
        metadata: {
          payment_provider: confirmation.provider,
          amount_minor: confirmation.amount_minor,
          currency: confirmation.currency,
          status: confirmation.status
        }
      });
    }
    return { accepted: result.paid === true, paid: result.paid === true };
  }

  return { process };
}
