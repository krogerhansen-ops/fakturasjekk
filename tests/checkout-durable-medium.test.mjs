import assert from 'node:assert/strict';
import {
  checkoutReadiness,
  isApprovedDurableMediumType,
  markAgreementConfirmationDelivered,
  canStartPaidService,
  latestCompatibleCheckoutConsent,
  durableMediumTypes
} from '../server/checkout-consent.mjs';

const policy = {
  version: 'checkout-test-v1',
  live_payment_session_enabled: true,
  terms_version: 'terms-v1',
  privacy_notice_version: 'privacy-v1',
  withdrawal_information_version: 'withdrawal-v1',
  product: { name: 'Fakturasjekk', amount_minor: 2900, currency: 'NOK' },
  seller: {
    ready: true,
    legal_name: 'Fakturasjekk Test AS',
    organization_number: '999999999',
    postal_address: 'Testveien 1, 0001 Oslo',
    support_email: 'support@example.test',
    privacy_email: 'privacy@example.test'
  },
  requirements: { durable_confirmation_required_before_service_delivery: true }
};

assert.equal(checkoutReadiness(policy).ready, true);
const missingOrg = structuredClone(policy);
missingOrg.seller.organization_number = null;
assert.equal(checkoutReadiness(missingOrg).ready, false);
assert.ok(checkoutReadiness(missingOrg).missing_seller_fields.includes('organization_number'));

for (const medium of ['email_text', 'email_pdf', 'sms_text']) assert.equal(isApprovedDurableMediumType(medium), true);
for (const medium of ['web_link', 'web_page', 'https_link', 'app_screen', null]) assert.equal(isApprovedDurableMediumType(medium), false);
assert.deepEqual(new Set(durableMediumTypes()), new Set(['email_text', 'email_pdf', 'sms_text']));

const record = {
  id: 'checkout-1',
  valid: true,
  checkout_policy_version: policy.version,
  terms_version: policy.terms_version,
  privacy_notice_version: policy.privacy_notice_version,
  withdrawal_information_version: policy.withdrawal_information_version,
  amount_minor: 2900,
  currency: 'NOK',
  payment_obligation_acknowledged: true,
  immediate_service_start_requested: true,
  withdrawal_loss_on_full_performance_acknowledged: true,
  durable_medium_delivered_at: null,
  durable_medium_type: null
};

assert.equal(canStartPaidService(record), false);
assert.throws(() => markAgreementConfirmationDelivered(record, {
  medium_type: 'web_link',
  delivered_at: '2026-08-20T08:00:00.000Z'
}), error => error?.code === 'invalid_durable_medium');

const delivered = markAgreementConfirmationDelivered(record, {
  medium_type: 'email_pdf',
  delivered_at: '2026-08-20T08:00:00.000Z',
  provider_reference: 'mail-123'
});
assert.equal(delivered.durable_medium_delivered_at, '2026-08-20T08:00:00.000Z');
assert.equal(delivered.durable_medium_type, 'email_pdf');
assert.equal(delivered.durable_medium_provider_reference, 'mail-123');
assert.equal(canStartPaidService(delivered), true);

const old = { ...delivered, id: 'checkout-old', terms_version: 'terms-old' };
const caseData = { checkout_consents: [old, delivered] };
assert.equal(latestCompatibleCheckoutConsent(caseData, policy)?.id, 'checkout-1');

console.log('OK durable-medium gate only accepts email/SMS content or email PDF, requires seller org number, and matches exact checkout versions.');
