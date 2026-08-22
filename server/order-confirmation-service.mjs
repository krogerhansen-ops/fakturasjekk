import { checkoutPolicyReadiness } from './checkout-policy-readiness.mjs';

const ALLOWED_DURABLE_MEDIA = new Set(['email', 'downloadable_document', 'account_document']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Order confirmation clock is invalid.');
  return date.toISOString();
}

function latest(array = []) {
  return Array.isArray(array) && array.length ? array.at(-1) : null;
}

function shortString(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim().slice(0, max);
}

function assertPaid(payment) {
  if (!payment || payment.status !== 'paid' || payment.verified_server_side !== true) {
    const error = new Error('Server-verified paid payment is required before order confirmation.');
    error.code = 'payment_not_verified';
    throw error;
  }
  if (Number(payment.amount_minor) !== 2900 || payment.currency !== 'NOK') {
    const error = new Error('Order confirmation payment must be exactly 29 NOK.');
    error.code = 'payment_amount_mismatch';
    throw error;
  }
}

function assertConsent(consent) {
  if (!consent || consent.payment_obligation_acknowledged !== true || consent.immediate_service_start_requested !== true || consent.withdrawal_loss_on_full_performance_acknowledged !== true) {
    const error = new Error('Validated checkout consent is required before order confirmation.');
    error.code = 'checkout_consent_missing';
    throw error;
  }
  for (const key of ['checkout_policy_version', 'terms_version', 'privacy_notice_version', 'withdrawal_information_version', 'accepted_at']) {
    if (typeof consent[key] !== 'string' || !consent[key]) {
      const error = new Error(`Checkout consent is missing ${key}.`);
      error.code = 'checkout_consent_incomplete';
      throw error;
    }
  }
}

function deliveryContact(consent) {
  const contact = consent?.delivery_contact;
  if (!contact) return null;
  if (
    contact.medium !== 'email' ||
    contact.verified_provider !== 'supabase_auth' ||
    typeof contact.address !== 'string' ||
    contact.address.length > 320 ||
    !EMAIL_RE.test(contact.address) ||
    typeof contact.verified_at !== 'string' ||
    Number.isNaN(Date.parse(contact.verified_at))
  ) {
    const error = new Error('Stored checkout delivery contact is invalid.');
    error.code = 'checkout_delivery_contact_invalid';
    throw error;
  }
  return {
    medium: 'email',
    address: contact.address.toLowerCase(),
    verified_provider: 'supabase_auth',
    verified_at: new Date(contact.verified_at).toISOString()
  };
}

function assertPolicy(policy) {
  // A paid customer's receipt must remain generatable if new checkout sessions are
  // later disabled. All other identity/policy requirements remain strict.
  const readiness = checkoutPolicyReadiness(policy, { requireLivePaymentSession: false });
  if (!readiness.ready) {
    const error = new Error('Verified, finalized seller identity is required before an order confirmation can be prepared.');
    error.code = 'seller_identity_missing';
    error.readiness_errors = readiness.errors;
    error.missing_seller_fields = readiness.missing_seller_fields;
    throw error;
  }
}

export function buildOrderConfirmation({ confirmation_id, checkout_policy, checkout_consent, payment, issued_at } = {}) {
  if (typeof confirmation_id !== 'string' || !confirmation_id) throw new Error('confirmation_id is required.');
  if (Number.isNaN(Date.parse(issued_at ?? ''))) throw new Error('issued_at must be a valid date.');
  assertPolicy(checkout_policy);
  assertConsent(checkout_consent);
  assertPaid(payment);
  const contact = deliveryContact(checkout_consent);

  return {
    version: 1,
    document_type: 'order_confirmation_and_payment_receipt',
    confirmation_id,
    issued_at,
    delivery_provider_accepted: false,
    delivery_provider_accepted_at: null,
    delivery_provider: null,
    delivery_reference: null,
    durable_medium_delivered: false,
    durable_medium_delivered_at: null,
    durable_medium: null,
    delivery_contact: contact,
    seller: {
      legal_name: checkout_policy.seller.legal_name,
      organization_number: checkout_policy.seller.organization_number,
      postal_address: checkout_policy.seller.postal_address,
      support_email: checkout_policy.seller.support_email,
      privacy_email: checkout_policy.seller.privacy_email
    },
    product: {
      name: checkout_policy.product?.name ?? 'Full fakturasjekk + utkast til innsigelse',
      amount_minor: 2900,
      amount_nok: 29,
      currency: 'NOK'
    },
    agreement: {
      checkout_policy_version: checkout_consent.checkout_policy_version,
      terms_version: checkout_consent.terms_version,
      privacy_notice_version: checkout_consent.privacy_notice_version,
      withdrawal_information_version: checkout_consent.withdrawal_information_version,
      accepted_at: checkout_consent.accepted_at,
      payment_obligation_acknowledged: true,
      immediate_service_start_requested: true,
      withdrawal_loss_on_full_performance_acknowledged: true
    },
    payment: {
      status: 'paid',
      amount_minor: 2900,
      amount_nok: 29,
      currency: 'NOK',
      provider: payment.provider ?? 'unknown',
      provider_reference: payment.provider_reference,
      paid_at: payment.paid_at ?? null,
      verified_server_side: true
    },
    customer_copy: {
      payment_obligation: checkout_policy.customer_copy?.payment_obligation ?? null,
      immediate_start: checkout_policy.customer_copy?.immediate_start ?? null,
      withdrawal_loss: checkout_policy.customer_copy?.withdrawal_loss ?? null
    }
  };
}

export function createOrderConfirmationService({ caseStore, checkoutPolicy, clock = () => new Date() } = {}) {
  if (!caseStore?.getOwned || !caseStore?.save || !caseStore?.nextId) throw new Error('Order confirmation service requires case store getOwned/save/nextId.');
  if (!checkoutPolicy || typeof checkoutPolicy !== 'object') throw new Error('Checkout policy is required.');

  async function prepare({ case_id, owner_id }) {
    let caseData = await caseStore.getOwned(case_id, owner_id);
    const consent = latest(caseData.checkout_consents);
    const payment = latest(caseData.payments);
    assertPolicy(checkoutPolicy);
    assertConsent(consent);
    assertPaid(payment);

    const existing = (caseData.order_confirmations ?? []).find(item =>
      item.payment?.provider_reference === payment.provider_reference &&
      item.agreement?.checkout_policy_version === consent.checkout_policy_version
    );
    if (existing) return { confirmation: structuredClone(existing), case: caseData, created: false };

    const confirmation_id = await caseStore.nextId('confirmation');
    const issued_at = nowIso(clock);
    const confirmation = buildOrderConfirmation({
      confirmation_id,
      checkout_policy: checkoutPolicy,
      checkout_consent: consent,
      payment,
      issued_at
    });

    caseData = {
      ...caseData,
      order_confirmations: [...(caseData.order_confirmations ?? []), confirmation],
      updated_at: issued_at,
      events: [...(caseData.events ?? []), {
        type: 'ORDER_CONFIRMATION_PREPARED',
        at: issued_at,
        data: { confirmation_id, amount_minor: 2900, currency: 'NOK', delivery_contact_ready: Boolean(confirmation.delivery_contact) }
      }]
    };
    await caseStore.save(caseData);
    return { confirmation: structuredClone(confirmation), case: caseData, created: true };
  }

  async function getLatestPrepared({ case_id, owner_id }) {
    const caseData = await caseStore.getOwned(case_id, owner_id);
    const confirmation = latest(caseData.order_confirmations);
    if (!confirmation) {
      const error = new Error('Order confirmation is not prepared yet.');
      error.code = 'order_confirmation_not_ready';
      throw error;
    }
    assertPaid(confirmation.payment);
    assertConsent(confirmation.agreement);
    return { confirmation: structuredClone(confirmation), case: caseData };
  }

  async function markProviderAccepted({ case_id, owner_id, confirmation_id, medium, provider, delivery_reference }) {
    if (!ALLOWED_DURABLE_MEDIA.has(medium)) {
      const error = new Error('Unsupported durable medium.');
      error.code = 'invalid_durable_medium';
      throw error;
    }
    const providerName = shortString(provider, 'delivery provider', 80);
    const reference = shortString(delivery_reference, 'delivery reference', 200);
    let caseData = await caseStore.getOwned(case_id, owner_id);
    const index = (caseData.order_confirmations ?? []).findIndex(item => item.confirmation_id === confirmation_id);
    if (index < 0) throw new Error('Order confirmation not found.');
    const current = caseData.order_confirmations[index];
    if (current.durable_medium_delivered === true) return { confirmation: structuredClone(current), case: caseData, updated: false };
    if (current.delivery_provider_accepted === true) {
      if (current.delivery_reference !== reference || current.delivery_provider !== providerName || current.durable_medium !== medium) {
        const error = new Error('Order confirmation was already accepted by a different provider delivery.');
        error.code = 'order_confirmation_delivery_conflict';
        throw error;
      }
      return { confirmation: structuredClone(current), case: caseData, updated: false };
    }

    const accepted_at = nowIso(clock);
    const updatedConfirmation = {
      ...current,
      delivery_provider_accepted: true,
      delivery_provider_accepted_at: accepted_at,
      delivery_provider: providerName,
      delivery_reference: reference,
      durable_medium: medium
    };
    const order_confirmations = [...caseData.order_confirmations];
    order_confirmations[index] = updatedConfirmation;
    caseData = {
      ...caseData,
      order_confirmations,
      updated_at: accepted_at,
      events: [...(caseData.events ?? []), {
        type: 'ORDER_CONFIRMATION_PROVIDER_ACCEPTED',
        at: accepted_at,
        data: { confirmation_id, medium, provider: providerName }
      }]
    };
    await caseStore.save(caseData);
    return { confirmation: structuredClone(updatedConfirmation), case: caseData, updated: true };
  }

  async function markDelivered({ case_id, owner_id, confirmation_id, medium, delivery_reference = null, provider = null }) {
    if (!ALLOWED_DURABLE_MEDIA.has(medium)) {
      const error = new Error('Unsupported durable medium.');
      error.code = 'invalid_durable_medium';
      throw error;
    }
    let caseData = await caseStore.getOwned(case_id, owner_id);
    const index = (caseData.order_confirmations ?? []).findIndex(item => item.confirmation_id === confirmation_id);
    if (index < 0) throw new Error('Order confirmation not found.');
    const current = caseData.order_confirmations[index];
    if (current.durable_medium_delivered === true) {
      return { confirmation: structuredClone(current), case: caseData, updated: false };
    }
    const reference = delivery_reference == null ? current.delivery_reference : String(delivery_reference).slice(0, 200);
    if (current.delivery_reference && reference !== current.delivery_reference) {
      const error = new Error('Delivered receipt reference does not match the provider-accepted message.');
      error.code = 'order_confirmation_delivery_reference_mismatch';
      throw error;
    }
    const providerName = provider == null ? current.delivery_provider : String(provider).slice(0, 80);
    if (current.delivery_provider && providerName !== current.delivery_provider) {
      const error = new Error('Delivered receipt provider does not match the provider-accepted message.');
      error.code = 'order_confirmation_delivery_provider_mismatch';
      throw error;
    }

    const delivered_at = nowIso(clock);
    const updatedConfirmation = {
      ...current,
      delivery_provider_accepted: current.delivery_provider_accepted === true || Boolean(reference),
      delivery_provider_accepted_at: current.delivery_provider_accepted_at ?? delivered_at,
      delivery_provider: providerName ?? null,
      durable_medium_delivered: true,
      durable_medium_delivered_at: delivered_at,
      durable_medium: medium,
      delivery_reference: reference ?? null
    };
    const order_confirmations = [...caseData.order_confirmations];
    order_confirmations[index] = updatedConfirmation;

    const checkout_consents = (caseData.checkout_consents ?? []).map((consent, consentIndex, all) =>
      consentIndex === all.length - 1 ? { ...consent, durable_medium_delivered_at: delivered_at } : consent
    );

    caseData = {
      ...caseData,
      order_confirmations,
      checkout_consents,
      updated_at: delivered_at,
      events: [...(caseData.events ?? []), {
        type: 'ORDER_CONFIRMATION_DELIVERED',
        at: delivered_at,
        data: { confirmation_id, medium, provider: providerName ?? null }
      }]
    };
    await caseStore.save(caseData);
    return { confirmation: structuredClone(updatedConfirmation), case: caseData, updated: true };
  }

  return { prepare, getLatestPrepared, markProviderAccepted, markDelivered };
}

export const ORDER_CONFIRMATION_DURABLE_MEDIA = Object.freeze([...ALLOWED_DURABLE_MEDIA]);
