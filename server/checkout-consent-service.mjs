import {
  validateCheckoutConsent,
  agreementConfirmationPayload,
  latestCompatibleCheckoutConsent,
  markAgreementConfirmationDelivered,
  canStartPaidService
} from './checkout-consent.mjs';

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
      durable_medium_delivered_at: null,
      durable_medium_type: null,
      durable_medium_provider_reference: null
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

  async function getLatestCompatible({ case_id, owner_id }) {
    const caseData = await caseStore.getOwned(case_id, owner_id);
    const record = latestCompatibleCheckoutConsent(caseData, policy);
    return { record, case: caseData };
  }

  async function getConfirmationForDelivery({ case_id, owner_id, checkout_consent_id = null }) {
    const caseData = await caseStore.getOwned(case_id, owner_id);
    const compatible = latestCompatibleCheckoutConsent(caseData, policy);
    const record = checkout_consent_id
      ? (caseData.checkout_consents ?? []).find(item => item.id === checkout_consent_id) ?? null
      : compatible;
    if (!record || record.valid !== true) {
      const error = new Error('Valid checkout consent is required before agreement confirmation can be delivered.');
      error.code = 'checkout_consent_required';
      throw error;
    }
    if (compatible?.id !== record.id) {
      const error = new Error('Checkout consent does not match the active checkout policy.');
      error.code = 'checkout_version_mismatch';
      throw error;
    }
    return {
      record,
      confirmation: agreementConfirmationPayload({
        policy,
        consent_record: record,
        case_id,
        created_at: record.accepted_at
      })
    };
  }

  async function markConfirmationDelivered({ case_id, owner_id, checkout_consent_id, medium_type, provider_reference = null, delivered_at = null }) {
    let caseData = await caseStore.getOwned(case_id, owner_id);
    const index = (caseData.checkout_consents ?? []).findIndex(record => record.id === checkout_consent_id);
    if (index < 0) {
      const error = new Error('Checkout consent record was not found.');
      error.code = 'checkout_consent_not_found';
      throw error;
    }

    const existing = caseData.checkout_consents[index];
    if (existing.durable_medium_delivered_at && existing.durable_medium_type) {
      return { record: existing, case: caseData, duplicate: true };
    }

    const delivered = markAgreementConfirmationDelivered(existing, {
      medium_type,
      provider_reference,
      delivered_at: delivered_at ?? nowIso(clock)
    });
    const consents = [...caseData.checkout_consents];
    consents[index] = delivered;
    const eventAt = delivered.durable_medium_delivered_at;
    caseData = {
      ...caseData,
      checkout_consents: consents,
      updated_at: eventAt,
      events: [...(caseData.events ?? []), {
        type: 'AGREEMENT_CONFIRMATION_DELIVERED',
        at: eventAt,
        data: {
          checkout_consent_id,
          medium_type: delivered.durable_medium_type,
          provider_reference: delivered.durable_medium_provider_reference
        }
      }]
    };
    await caseStore.save(caseData);
    return { record: delivered, case: caseData, duplicate: false };
  }

  async function deliveryReadiness({ case_id, owner_id }) {
    const { record } = await getLatestCompatible({ case_id, owner_id });
    return {
      ready: canStartPaidService(record),
      checkout_consent_id: record?.id ?? null,
      durable_medium_delivered_at: record?.durable_medium_delivered_at ?? null,
      durable_medium_type: record?.durable_medium_type ?? null
    };
  }

  return {
    acceptForPaymentSession,
    getLatestCompatible,
    getConfirmationForDelivery,
    markConfirmationDelivered,
    deliveryReadiness
  };
}
