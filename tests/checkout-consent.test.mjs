import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateCheckoutConsent, checkoutReadiness, agreementConfirmationPayload } from '../server/checkout-consent.mjs';
import { createCheckoutConsentService } from '../server/checkout-consent-service.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';

const draftPolicy = JSON.parse(fs.readFileSync(new URL('../config/checkout-policy.json', import.meta.url), 'utf8'));
assert.equal(checkoutReadiness(draftPolicy).ready, false);
assert.ok(checkoutReadiness(draftPolicy).missing_seller_fields.includes('legal_name'));
assert.throws(() => validateCheckoutConsent({}, draftPolicy, { amount_minor: 2900, currency: 'NOK' }), error => error?.code === 'checkout_not_ready');

const policy = structuredClone(draftPolicy);
policy.status = 'test_ready';
policy.live_payment_session_enabled = true;
policy.seller = {
  ready: true,
  legal_name: 'Fakturasjekk Test AS',
  organization_number: '999999999',
  postal_address: 'Testveien 1, 0001 Oslo',
  support_email: 'support@example.test',
  privacy_email: 'privacy@example.test'
};
const validConsent = {
  delivery_email: 'Kunde@Example.Test',
  checkout_policy_version: policy.version,
  terms_version: policy.terms_version,
  privacy_notice_version: policy.privacy_notice_version,
  withdrawal_information_version: policy.withdrawal_information_version,
  payment_obligation_acknowledged: true,
  immediate_service_start_requested: true,
  withdrawal_loss_on_full_performance_acknowledged: true
};
const requirement = { amount_minor: 2900, amount_nok: 29, currency: 'NOK' };
const checked = validateCheckoutConsent(validConsent, policy, requirement);
assert.equal(checked.valid, true);
assert.equal(checked.delivery_email, 'kunde@example.test');
assert.equal(checked.amount_minor, 2900);
assert.equal(checked.payment_button_label, 'Bestill med betalingsplikt – 29 kr');

for (const field of ['payment_obligation_acknowledged','immediate_service_start_requested','withdrawal_loss_on_full_performance_acknowledged']) {
  const consent = { ...validConsent, [field]: false };
  assert.throws(() => validateCheckoutConsent(consent, policy, requirement), error => error?.code === 'checkout_consent_required' && error.missing.includes(field));
}
assert.throws(() => validateCheckoutConsent({ ...validConsent, delivery_email: 'not-an-email' }, policy, requirement), error => error?.code === 'checkout_delivery_email_invalid');
assert.throws(() => validateCheckoutConsent({ ...validConsent, terms_version: 'old' }, policy, requirement), error => error?.code === 'checkout_version_mismatch' && error.field === 'terms_version');
assert.throws(() => validateCheckoutConsent(validConsent, policy, { amount_minor: 3000, currency: 'NOK' }), error => error?.code === 'checkout_price_mismatch');

const confirmation = agreementConfirmationPayload({ policy, consent_record: checked, case_id: 'case-1', created_at: '2026-08-19T08:00:00.000Z' });
assert.equal(confirmation.product.amount_nok, 29);
assert.equal(confirmation.seller.legal_name, 'Fakturasjekk Test AS');
assert.equal(confirmation.acknowledgements.immediate_service_start, true);
assert.equal(confirmation.durable_medium_delivered, false, 'payload alone is not durable-medium delivery');
assert.equal(JSON.stringify(confirmation).includes('kunde@example.test'), false, 'confirmation body does not need to repeat recipient email');
assert.match(confirmation.withdrawal_notice, /angreretten går tapt når Fakturasjekk har levert tjenesten fullt ut/i);

const store = createMemoryCaseStore();
await store.save({
  id: 'case-1', owner_id: 'u1', state: 'analysis_ready', retention_mode: 'temporary',
  created_at: '2026-08-19T07:00:00.000Z', updated_at: '2026-08-19T07:30:00.000Z', deleted_at: null,
  events: [], documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: []
});
const service = createCheckoutConsentService({ caseStore: store, policy, clock: () => new Date('2026-08-19T08:00:00.000Z') });
const accepted = await service.acceptForPaymentSession({ case_id: 'case-1', owner_id: 'u1', consent: validConsent, requirement });
assert.match(accepted.checkout_consent_id, /^checkout-/);
assert.equal(accepted.agreement_confirmation_payload.product.amount_nok, 29);
assert.equal(accepted.agreement_confirmation_payload.durable_medium_delivered, false);
const saved = await store.getOwned('case-1', 'u1');
assert.equal(saved.checkout_consents.length, 1);
assert.equal(saved.checkout_consents[0].delivery_email, 'kunde@example.test');
assert.equal(saved.checkout_consents[0].accepted_at, '2026-08-19T08:00:00.000Z');
assert.equal(saved.checkout_consents[0].durable_medium_status, 'not_sent');
assert.equal(saved.checkout_consents[0].durable_medium_delivered_at, null);
assert.ok(saved.events.some(event => event.type === 'CHECKOUT_CONSENT_RECORDED'));
const storedText = JSON.stringify(saved.checkout_consents[0]);
assert.equal(storedText.includes('ip_address'), false);
assert.equal(storedText.includes('user_agent'), false);
assert.equal(storedText.includes('password'), false);

await assert.rejects(() => service.acceptForPaymentSession({ case_id: 'case-1', owner_id: 'other-user', consent: validConsent, requirement }), /not found|owned/i);

console.log('OK checkout requires a bounded delivery email, stores explicit versioned consent, and keeps durable-medium delivery pending');
