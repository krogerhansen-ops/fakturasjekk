import { validateCheckoutConsent, agreementConfirmationPayload } from './checkout-consent.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Checkout consent clock is invalid.');
  return date.toISOString();
}

function normalizedDeliveryContact(value, ownerId, required) {
  if (value == null) {
    if (!required) return null;
    const error = new Error('A verified delivery email is required before payment can start.');
    error.code = 'checkout_delivery_contact_required';
    throw error;
  }
  if (typeof value !== 'object' || Array.isArray(value) || value.user_id !== ownerId) {
    const error = new Error('Checkout delivery contact does not belong to the authenticated user.');
    error.code = 'checkout_delivery_contact_invalid';
    throw error;
  }
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const verifiedAt = typeof value.verified_at === 'string' ? value.verified_at : '';
  if (!email || email.length > 320 || !EMAIL_RE.test(email) || !verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
    const error = new Error('Checkout delivery contact is not a verified email address.');
    error.code = 'checkout_delivery_contact_invalid';
    throw error;
  }
  return {
    medium: 'email',
    address: email,
    verified_provider: 'supabase_auth',
    verified_at: new Date(verifiedAt).toISOString()
  };
}

export function createCheckoutConsentService({ caseStore, policy, requireDeliveryContact = false, clock = () => new Date() } = {}) {
  if (!caseStore?.getOwned || !caseStore?.save || !caseStore?.nextId) throw new Error('Checkout consent service requires case store getOwned/save/nextId.');
  if (!policy || typeof policy !== 'object') throw new Error('Checkout policy is required.');

  async function acceptForPaymentSession({ case_id, owner_id, consent, requirement, delivery_contact = null }) {
    let caseData = await caseStore.getOwned(case_id, owner_id);
    if (caseData.state !== 'analysis_ready') {
      const error = new Error('Checkout consent can only be recorded after analysis and before payment.');
      error.code = 'checkout_invalid_case_state';
      throw error;
    }

    const validated = validateCheckoutConsent(consent, policy, requirement);
    const deliveryContact = normalizedDeliveryContact(delivery_contact, owner_id, requireDeliveryContact);
    const accepted_at = nowIso(clock);
    const id = await caseStore.nextId('checkout');
    const record = {
      id,
      ...validated,
      accepted_at,
      delivery_contact: deliveryContact,
      durable_medium_delivered_at: null
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
          durable_medium_delivery_contact_ready: Boolean(deliveryContact),
          durable_medium_delivered: false
        }
      }]
    };
    await caseStore.save(caseData);
    return { checkout_consent_id: id, accepted_at, agreement_confirmation_payload, case: caseData };
  }

  return { acceptForPaymentSession };
}
