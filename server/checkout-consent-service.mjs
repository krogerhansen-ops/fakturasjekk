import { validateCheckoutConsent, agreementConfirmationPayload } from './checkout-consent.mjs';

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Checkout consent clock is invalid.');
  return date.toISOString();
}

export function createCheckoutConsentService({ caseStore, policy, clock = () => new Date() } = {}) {
  if (!caseStore?.getOwned || !caseStore?.save || !caseStore?.nextId) throw new Error('Checkout consent service requires case store getOwned/save/nextId.');
  if (!policy || typeof policy !== 'object') throw new Error('Checkout policy is required.');

  async function acceptForPaymentSession({ case_id, owner_id, consent, requirement }) {
    let caseData = await caseStore.getOwned(case_id, owner_id);
    if (caseData.state !== 'analysis_ready') {
      const error = new Error('Checkout consent can only be recorded after analysis and before payment.');
      error.code = 'checkout_invalid_case_state';
      throw error;
    }

    const validated = validateCheckoutConsent(consent, policy, requirement);
    const accepted_at = nowIso(clock);
    const id = await caseStore.nextId('checkout');
    const record = {
      id,
      ...validated,
      accepted_at,
      durable_medium_provider: null,
      durable_medium_message_id: null,
      durable_medium_status: 'not_sent',
      durable_medium_sent_at: null,
      durable_medium_delivered_at: null,
      durable_medium_failed_at: null,
      durable_medium_failure_event: null
    };
    const agreement_confirmation_payload = agreementConfirmationPayload({
      policy,
      consent_record: validated,
      case_id,
      created_at: accepted_at
    });

    caseData = {
      ...caseData,
      checkout_consents: [...(caseData.checkout_consents ?? []), record],
      updated_at: accepted_at,
      events: [...(caseData.events ?? []), {
        type: 'CHECKOUT_CONSENT_RECORDED',
        at: accepted_at,
        data: {
          checkout_consent_id: id,
          checkout_policy_version: validated.checkout_policy_version,
          terms_version: validated.terms_version,
          amount_minor: validated.amount_minor,
          currency: validated.currency,
          durable_medium_delivered: false
        }
      }]
    };
    await caseStore.save(caseData);
    return { checkout_consent_id: id, accepted_at, agreement_confirmation_payload, case: caseData };
  }

  return { acceptForPaymentSession };
}
