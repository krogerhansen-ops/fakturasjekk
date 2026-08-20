function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

const DURABLE_MEDIUM_TYPES = new Set(['email_text', 'email_pdf', 'sms_text']);

export function checkoutReadiness(policy = {}) {
  const seller = policy.seller ?? {};
  const missingSeller = ['legal_name','organization_number','postal_address','support_email','privacy_email'].filter(key => !seller[key]);
  const ready = policy.live_payment_session_enabled === true && seller.ready === true && missingSeller.length === 0;
  return {
    ready,
    missing_seller_fields: missingSeller,
    policy_version: policy.version ?? null,
    terms_version: policy.terms_version ?? null,
    privacy_notice_version: policy.privacy_notice_version ?? null,
    withdrawal_information_version: policy.withdrawal_information_version ?? null
  };
}

export function validateCheckoutConsent(consent = {}, policy = {}, requirement = {}) {
  const readiness = checkoutReadiness(policy);
  if (!readiness.ready) {
    const error = new Error('Checkout is not ready for live payment sessions.');
    error.code = 'checkout_not_ready';
    error.missing_seller_fields = readiness.missing_seller_fields;
    throw error;
  }

  if (Number(requirement.amount_minor) !== Number(policy.product?.amount_minor) || requirement.currency !== policy.product?.currency) {
    const error = new Error('Checkout product price does not match payment requirement.');
    error.code = 'checkout_price_mismatch';
    throw error;
  }

  const requiredTrue = ['payment_obligation_acknowledged','immediate_service_start_requested','withdrawal_loss_on_full_performance_acknowledged'];
  const missing = requiredTrue.filter(key => consent?.[key] !== true);
  if (missing.length) {
    const error = new Error('Required checkout acknowledgements are missing.');
    error.code = 'checkout_consent_required';
    error.missing = missing;
    throw error;
  }

  const expectedVersions = {
    checkout_policy_version: requireString(policy.version, 'Checkout policy version'),
    terms_version: requireString(policy.terms_version, 'Terms version'),
    privacy_notice_version: requireString(policy.privacy_notice_version, 'Privacy notice version'),
    withdrawal_information_version: requireString(policy.withdrawal_information_version, 'Withdrawal information version')
  };
  for (const [key, expected] of Object.entries(expectedVersions)) {
    if (consent?.[key] !== expected) {
      const error = new Error(`Checkout consent version mismatch: ${key}.`);
      error.code = 'checkout_version_mismatch';
      error.field = key;
      throw error;
    }
  }

  return {
    valid: true,
    ...expectedVersions,
    product_name: policy.product.name,
    amount_minor: Number(policy.product.amount_minor),
    currency: policy.product.currency,
    payment_button_label: requireString(policy.payment_button_label, 'Payment button label'),
    payment_obligation_acknowledged: true,
    immediate_service_start_requested: true,
    withdrawal_loss_on_full_performance_acknowledged: true
  };
}

// This is the immutable content payload that must later be delivered on a genuine
// durable medium. Returning/storing this object alone does not satisfy that delivery requirement.
export function agreementConfirmationPayload({ policy, consent_record, case_id, created_at } = {}) {
  if (!consent_record?.valid) throw new Error('Validated checkout consent is required for agreement confirmation payload.');
  return {
    version: 1,
    durable_medium_delivered: false,
    case_id,
    created_at,
    seller: {
      legal_name: policy.seller.legal_name,
      organization_number: policy.seller.organization_number ?? null,
      postal_address: policy.seller.postal_address,
      support_email: policy.seller.support_email,
      privacy_email: policy.seller.privacy_email
    },
    product: {
      name: consent_record.product_name,
      amount_minor: consent_record.amount_minor,
      amount_nok: consent_record.amount_minor / 100,
      currency: consent_record.currency
    },
    versions: {
      checkout_policy: consent_record.checkout_policy_version,
      terms: consent_record.terms_version,
      privacy_notice: consent_record.privacy_notice_version,
      withdrawal_information: consent_record.withdrawal_information_version
    },
    acknowledgements: {
      payment_obligation: true,
      immediate_service_start: true,
      withdrawal_loss_on_full_performance: true
    },
    payment_button_label: consent_record.payment_button_label,
    withdrawal_notice: policy.customer_copy?.withdrawal_loss ?? null,
    immediate_start_request: policy.customer_copy?.immediate_start ?? null,
    payment_obligation_notice: policy.customer_copy?.payment_obligation ?? null
  };
}

export function isApprovedDurableMediumType(value) {
  return DURABLE_MEDIUM_TYPES.has(value);
}

export function markAgreementConfirmationDelivered(record, { medium_type, delivered_at, provider_reference = null } = {}) {
  if (!record?.valid) throw new Error('Validated checkout consent record is required.');
  if (!isApprovedDurableMediumType(medium_type)) {
    const error = new Error('Agreement confirmation must be delivered as email text, email PDF or SMS text.');
    error.code = 'invalid_durable_medium';
    throw error;
  }
  const parsed = Date.parse(delivered_at);
  if (!delivered_at || !Number.isFinite(parsed)) {
    const error = new Error('Valid durable-medium delivery timestamp is required.');
    error.code = 'invalid_durable_delivery_time';
    throw error;
  }
  return {
    ...record,
    durable_medium_delivered_at: new Date(parsed).toISOString(),
    durable_medium_type: medium_type,
    durable_medium_provider_reference: typeof provider_reference === 'string' && provider_reference.trim() ? provider_reference.trim() : null
  };
}

export function latestCompatibleCheckoutConsent(caseData = {}, policy = {}) {
  return [...(caseData.checkout_consents ?? [])].reverse().find(record =>
    record?.valid === true &&
    record?.checkout_policy_version === policy.version &&
    record?.terms_version === policy.terms_version &&
    record?.privacy_notice_version === policy.privacy_notice_version &&
    record?.withdrawal_information_version === policy.withdrawal_information_version &&
    Number(record?.amount_minor) === Number(policy.product?.amount_minor) &&
    record?.currency === policy.product?.currency
  ) ?? null;
}

export function canStartPaidService(record) {
  return Boolean(
    record?.valid === true &&
    record?.payment_obligation_acknowledged === true &&
    record?.immediate_service_start_requested === true &&
    record?.withdrawal_loss_on_full_performance_acknowledged === true &&
    record?.durable_medium_delivered_at &&
    isApprovedDurableMediumType(record?.durable_medium_type)
  );
}

export function assertPaidServiceDeliveryAllowed(caseData = {}, policy = {}) {
  if (policy.requirements?.durable_confirmation_required_before_service_delivery !== true) return true;
  const record = latestCompatibleCheckoutConsent(caseData, policy);
  if (!record) {
    const error = new Error('Full result is locked until valid checkout consent is recorded.');
    error.code = 'checkout_consent_required';
    throw error;
  }
  if (!canStartPaidService(record)) {
    const error = new Error('Full result is locked until agreement confirmation is delivered on a durable medium.');
    error.code = 'durable_confirmation_required';
    throw error;
  }
  return true;
}

export function durableMediumTypes() {
  return [...DURABLE_MEDIUM_TYPES];
}
