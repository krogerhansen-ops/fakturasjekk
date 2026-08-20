import assert from 'node:assert/strict';
import { createCheckoutConsentService } from '../server/checkout-consent-service.mjs';

const policy = {
  version: 'checkout-test-v1',
  live_payment_session_enabled: true,
  terms_version: 'terms-v1',
  privacy_notice_version: 'privacy-v1',
  withdrawal_information_version: 'withdrawal-v1',
  payment_button_label: 'Bestill med betalingsplikt – 29 kr',
  product: { name: 'Full Fakturasjekk + utkast til innsigelse', amount_minor: 2900, amount_nok: 29, currency: 'NOK' },
  seller: {
    ready: true,
    legal_name: 'Fakturasjekk Test AS',
    organization_number: '999999999',
    postal_address: 'Testveien 1, 0001 Oslo',
    support_email: 'support@example.test',
    privacy_email: 'privacy@example.test'
  },
  customer_copy: {
    immediate_start: 'Start nå.',
    withdrawal_loss: 'Angreretten går tapt etter full levering.',
    payment_obligation: 'Bestillingen koster 29 kr.'
  }
};

const state = new Map();
let seq = 0;
state.set('case-1', {
  id: 'case-1',
  owner_id: 'u1',
  state: 'analysis_ready',
  checkout_consents: [],
  events: [],
  updated_at: '2026-08-20T07:00:00.000Z'
});
const store = {
  async nextId(prefix) { seq += 1; return `${prefix}-${seq}`; },
  async getOwned(id, owner) {
    const value = state.get(id);
    if (!value || value.owner_id !== owner) throw new Error('Case not found');
    return structuredClone(value);
  },
  async save(value) { state.set(value.id, structuredClone(value)); return value; }
};

const service = createCheckoutConsentService({
  caseStore: store,
  policy,
  clock: () => '2026-08-20T08:00:00.000Z'
});

const consent = {
  payment_obligation_acknowledged: true,
  immediate_service_start_requested: true,
  withdrawal_loss_on_full_performance_acknowledged: true,
  checkout_policy_version: policy.version,
  terms_version: policy.terms_version,
  privacy_notice_version: policy.privacy_notice_version,
  withdrawal_information_version: policy.withdrawal_information_version
};
const requirement = { amount_minor: 2900, currency: 'NOK' };

const accepted = await service.acceptForPaymentSession({ case_id: 'case-1', owner_id: 'u1', consent, requirement });
assert.equal(accepted.checkout_consent_id, 'checkout-1');
assert.equal(accepted.accepted_at, '2026-08-20T08:00:00.000Z');
assert.equal(accepted.agreement_confirmation_payload.durable_medium_delivered, false);
assert.equal(accepted.agreement_confirmation_payload.product.amount_nok, 29);
assert.equal(accepted.case.checkout_consents.length, 1);
assert.equal(accepted.case.checkout_consents[0].durable_medium_delivered_at, null);
assert.equal(accepted.case.events.at(-1).type, 'CHECKOUT_CONSENT_RECORDED');

const before = await service.deliveryReadiness({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(before.ready, false);
assert.equal(before.checkout_consent_id, 'checkout-1');

const prepared = await service.getConfirmationForDelivery({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(prepared.record.id, 'checkout-1');
assert.equal(prepared.confirmation.case_id, 'case-1');
assert.equal(prepared.confirmation.versions.terms, 'terms-v1');

const delivered = await service.markConfirmationDelivered({
  case_id: 'case-1',
  owner_id: 'u1',
  checkout_consent_id: 'checkout-1',
  medium_type: 'email_pdf',
  provider_reference: 'mail-123',
  delivered_at: '2026-08-20T08:05:00.000Z'
});
assert.equal(delivered.duplicate, false);
assert.equal(delivered.record.durable_medium_type, 'email_pdf');
assert.equal(delivered.record.durable_medium_provider_reference, 'mail-123');
assert.equal(delivered.case.events.at(-1).type, 'AGREEMENT_CONFIRMATION_DELIVERED');
assert.equal(delivered.case.events.at(-1).data.provider_reference, 'mail-123');

const after = await service.deliveryReadiness({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(after.ready, true);
assert.equal(after.durable_medium_type, 'email_pdf');
assert.equal(after.durable_medium_delivered_at, '2026-08-20T08:05:00.000Z');

const duplicate = await service.markConfirmationDelivered({
  case_id: 'case-1',
  owner_id: 'u1',
  checkout_consent_id: 'checkout-1',
  medium_type: 'email_text',
  provider_reference: 'mail-should-not-replace',
  delivered_at: '2026-08-20T08:06:00.000Z'
});
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.record.durable_medium_type, 'email_pdf');
assert.equal(duplicate.record.durable_medium_provider_reference, 'mail-123');
const persistedAfterDuplicate = await store.getOwned('case-1', 'u1');
assert.equal(persistedAfterDuplicate.events.filter(event => event.type === 'AGREEMENT_CONFIRMATION_DELIVERED').length, 1);

const stale = structuredClone(await store.getOwned('case-1', 'u1'));
stale.checkout_consents.push({
  ...stale.checkout_consents[0],
  id: 'checkout-stale',
  terms_version: 'old-terms',
  accepted_at: '2026-08-20T08:10:00.000Z',
  durable_medium_delivered_at: null,
  durable_medium_type: null
});
await store.save(stale);
const latestCompatible = await service.getLatestCompatible({ case_id: 'case-1', owner_id: 'u1' });
assert.equal(latestCompatible.record.id, 'checkout-1', 'newer incompatible consent must not shadow the compatible delivered consent');

console.log('OK checkout consent service persists exact consent versions and one durable delivery event and exposes readiness only after delivery.');
