import { isAgreementConfirmationDelivered } from './agreement-confirmation-service.mjs';

export function createFulfillmentGatedServices({ services, caseStore, checkoutPolicy } = {}) {
  if (!services?.getFullResult || !services?.saveGeneratedDraft) throw new Error('Fulfillment gate requires backend services.');
  if (!caseStore?.getOwned) throw new Error('Fulfillment gate requires caseStore.getOwned.');
  if (!checkoutPolicy || typeof checkoutPolicy !== 'object') return services;

  async function requireDurableDelivery({ case_id, owner_id }) {
    if (checkoutPolicy.requirements?.durable_confirmation_required_before_service_delivery !== true) return;
    const caseData = await caseStore.getOwned(case_id, owner_id);
    if (!isAgreementConfirmationDelivered(caseData, checkoutPolicy)) {
      const error = new Error('Full paid service is locked until the agreement confirmation has been delivered on durable medium.');
      error.code = 'agreement_confirmation_not_delivered';
      throw error;
    }
  }

  return {
    ...services,
    async getFullResult(args) {
      await requireDurableDelivery(args);
      return services.getFullResult(args);
    },
    async saveGeneratedDraft(args) {
      await requireDurableDelivery(args);
      return services.saveGeneratedDraft(args);
    }
  };
}
