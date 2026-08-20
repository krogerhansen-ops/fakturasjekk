export function createPaidServiceDeliveryGate({ checkoutConsentService, required = true } = {}) {
  if (required && !checkoutConsentService?.deliveryReadiness) {
    throw new Error('Paid service delivery gate requires checkout consent service.');
  }

  async function assertReady({ case_id, owner_id } = {}) {
    if (!required) return { ready: true, reason: 'gate_not_required' };
    const readiness = await checkoutConsentService.deliveryReadiness({ case_id, owner_id });
    if (!readiness.checkout_consent_id) {
      const error = new Error('Full result is locked until valid checkout consent is recorded.');
      error.code = 'checkout_consent_required';
      throw error;
    }
    if (!readiness.ready) {
      const error = new Error('Full result is locked until agreement confirmation is delivered on a durable medium.');
      error.code = 'durable_confirmation_required';
      error.checkout_consent_id = readiness.checkout_consent_id;
      throw error;
    }
    return readiness;
  }

  return { assertReady };
}
