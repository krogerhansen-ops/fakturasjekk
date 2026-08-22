const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORG_WEIGHTS = Object.freeze([3, 2, 7, 6, 5, 4, 3, 2]);
const REQUIRED_POLICY_STATUS = 'live_ready';
const REQUIRED_REGISTRY_SOURCE = 'brreg';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeNorwegianOrganizationNumber(value) {
  const normalized = String(value ?? '').replace(/[\s.-]/g, '');
  return /^\d{9}$/.test(normalized) ? normalized : null;
}

// This validates only the published Norwegian Mod11 structure/check digit.
// It is NOT evidence that an entity exists in Brønnøysundregistrene and must
// never be used as a replacement for the explicit registry-verification block.
export function isValidNorwegianOrganizationNumber(value) {
  const organizationNumber = normalizeNorwegianOrganizationNumber(value);
  if (!organizationNumber) return false;
  const sum = ORG_WEIGHTS.reduce((total, weight, index) => total + Number(organizationNumber[index]) * weight, 0);
  const remainder = sum % 11;
  if (remainder === 1) return false;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === Number(organizationNumber[8]);
}

function normalizedComparableName(value) {
  return text(value).replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

function isEmail(value) {
  const normalized = text(value);
  return normalized.length <= 320 && EMAIL_RE.test(normalized);
}

function isVerifiedTimestamp(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) && parsed <= nowMs + 5 * 60 * 1000;
}

function finalVersion(value) {
  const version = text(value);
  return Boolean(version) && !/^draft(?:[-_]|$)/i.test(version);
}

export function sellerIdentityReadiness(seller = {}, { nowMs = Date.now() } = {}) {
  const errors = [];
  const missingFields = [];
  for (const field of ['legal_name', 'organization_number', 'postal_address', 'support_email', 'privacy_email']) {
    if (!text(seller[field])) missingFields.push(field);
  }

  const organizationNumber = normalizeNorwegianOrganizationNumber(seller.organization_number);
  if (text(seller.organization_number) && !isValidNorwegianOrganizationNumber(seller.organization_number)) {
    errors.push('organization_number_invalid');
  }
  if (text(seller.support_email) && !isEmail(seller.support_email)) errors.push('support_email_invalid');
  if (text(seller.privacy_email) && !isEmail(seller.privacy_email)) errors.push('privacy_email_invalid');
  if (seller.ready !== true) errors.push('seller_not_approved');

  const registry = seller.registry_verification;
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    errors.push('registry_verification_missing');
  } else {
    if (text(registry.source).toLowerCase() !== REQUIRED_REGISTRY_SOURCE) errors.push('registry_source_invalid');
    if (!isVerifiedTimestamp(registry.verified_at, nowMs)) errors.push('registry_verified_at_invalid');
    const registryOrg = normalizeNorwegianOrganizationNumber(registry.organization_number);
    if (!registryOrg || !organizationNumber || registryOrg !== organizationNumber) errors.push('registry_organization_number_mismatch');
    if (!normalizedComparableName(registry.legal_name) || normalizedComparableName(registry.legal_name) !== normalizedComparableName(seller.legal_name)) {
      errors.push('registry_legal_name_mismatch');
    }
  }

  return {
    ready: missingFields.length === 0 && errors.length === 0,
    missing_fields: missingFields,
    errors: [...new Set(errors)],
    organization_number: organizationNumber,
    registry_source: registry?.source ?? null,
    registry_verified_at: registry?.verified_at ?? null
  };
}

export function checkoutPolicyReadiness(policy = {}, { requireLivePaymentSession = true, nowMs = Date.now() } = {}) {
  const seller = sellerIdentityReadiness(policy.seller ?? {}, { nowMs });
  const errors = [...seller.errors];

  if (policy.status !== REQUIRED_POLICY_STATUS) errors.push('policy_status_not_live_ready');
  if (!finalVersion(policy.version)) errors.push('checkout_policy_version_not_final');
  if (!finalVersion(policy.terms_version)) errors.push('terms_version_not_final');
  if (!finalVersion(policy.privacy_notice_version)) errors.push('privacy_notice_version_not_final');
  if (!finalVersion(policy.withdrawal_information_version)) errors.push('withdrawal_information_version_not_final');

  if (Number(policy.product?.amount_minor) !== 2900 || Number(policy.product?.amount_nok) !== 29 || policy.product?.currency !== 'NOK') {
    errors.push('product_price_not_29_nok');
  }
  if (text(policy.payment_button_label) !== 'Bestill med betalingsplikt – 29 kr') {
    errors.push('payment_button_label_invalid');
  }
  if (requireLivePaymentSession && policy.live_payment_session_enabled !== true) errors.push('live_payment_session_disabled');

  const uniqueErrors = [...new Set(errors)];
  return {
    ready: seller.ready && uniqueErrors.length === 0,
    seller,
    missing_seller_fields: seller.missing_fields,
    errors: uniqueErrors,
    policy_version: policy.version ?? null,
    terms_version: policy.terms_version ?? null,
    privacy_notice_version: policy.privacy_notice_version ?? null,
    withdrawal_information_version: policy.withdrawal_information_version ?? null
  };
}

export const CHECKOUT_POLICY_IDENTITY_RULES = Object.freeze({
  required_policy_status: REQUIRED_POLICY_STATUS,
  required_registry_source: REQUIRED_REGISTRY_SOURCE,
  organization_number_check: 'norwegian_mod11_only_not_registry_proof',
  product_amount_minor: 2900,
  product_currency: 'NOK'
});
