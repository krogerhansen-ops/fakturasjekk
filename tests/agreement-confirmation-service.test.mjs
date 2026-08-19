import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createAgreementConfirmationService, isAgreementConfirmationDelivered } from '../server/agreement-confirmation-service.mjs';
import { createFulfillmentGatedServices } from '../server/fulfillment-gate.mjs';

const checkoutPolicy = {
  version: 'checkout-v1',
  requirements: { durable_confirmation_required_before_service_delivery: true },
  product: { name: 'Full Fakturasjekk + utkast til innsigelse', amount_minor: 2900, currency: 'NOK' },
  seller: {
    legal_name: 'Fakturasjekk Test AS', organization_number: '999999999', postal_address: 'Testveien 1, 0001 Oslo',
    support_email: 'support@example.test', privacy_email: 'privacy@example.test'
  },
  customer_copy: {
    immediate_start: 'Jeg ber uttrykkelig om oppstart.',
    withdrawal_loss: 'Jeg forstår at angreretten går tapt når tjenesten er fullt levert.',
    payment_obligation: 'Jeg forstår betalingsplikten på 29 kr.'
  }
};
const caseStore = createMemoryCaseStore();
await caseStore.save({
  id: 'case-1', owner_id: 'u1', state: 'paid', retention_mode: 'temporary',
  created_at: '2026-08-19T08:00:00Z', updated_at: '2026-08-19T08:20:00Z', deleted_at: null,
  documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [], events: [],
  checkout_consents: [{
    id: 'checkout-1', valid: true, checkout_policy_version: 'checkout-v1', terms_version: 'terms-v1', privacy_notice_version: 'privacy-v1', withdrawal_information_version: 'withdraw-v1',
    delivery_email: 'kunde@example.test', product_name: 'Full Fakturasjekk + utkast til innsigelse', amount_minor: 2900, currency: 'NOK',
    payment_button_label: 'Bestill med betalingsplikt – 29 kr', payment_obligation_acknowledged: true,
    immediate_service_start_requested: true, withdrawal_loss_on_full_performance_acknowledged: true,
    accepted_at: '2026-08-19T08:15:00Z', durable_medium_status: 'not_sent', durable_medium_message_id: null,
    durable_medium_sent_at: null, durable_medium_delivered_at: null
  }]
});

let sendCalls = 0;
let nextWebhook = null;
const provider = {
  name: 'brevo',
  async sendAgreementConfirmation(input) {
    sendCalls += 1;
    assert.equal(input.case_id, 'case-1');
    assert.equal(input.checkout_consent_id, 'checkout-1');
    assert.equal(input.delivery_email, 'kunde@example.test');
    assert.equal(input.agreement_confirmation_payload.product.amount_nok, 29);
    return { provider: 'brevo', provider_accepted: true, message_id: 'msg-123' };
  },
  verifyWebhook() { return structuredClone(nextWebhook); }
};
let currentTime = '2026-08-19T08:21:00Z';
const confirmationService = createAgreementConfirmationService({
  caseStore, provider, checkoutPolicy, clock: () => new Date(currentTime)
});

assert.equal(isAgreementConfirmationDelivered(await caseStore.getOwned('case-1', 'u1'), checkoutPolicy), false);
const sent = await confirmationService.sendForPaidCase({ case_id: 'case-1' });
assert.equal(sent.sent, true);
assert.equal(sent.delivered, false);
assert.equal(sendCalls, 1);
let caseData = await caseStore.getOwned('case-1', 'u1');
assert.equal(caseData.checkout_consents[0].durable_medium_status, 'sent');
assert.equal(caseData.checkout_consents[0].durable_medium_message_id, 'msg-123');
assert.equal(caseData.checkout_consents[0].durable_medium_delivered_at, null);
assert.equal(isAgreementConfirmationDelivered(caseData, checkoutPolicy), false);

const duplicateSend = await confirmationService.sendForPaidCase({ case_id: 'case-1' });
assert.equal(duplicateSend.duplicate, true);
assert.equal(sendCalls, 1, 'already accepted confirmation must not be sent again');

let baseFullResultCalls = 0;
const baseServices = {
  async getFullResult() { baseFullResultCalls += 1; return { unlocked: true }; },
  async saveGeneratedDraft() { return { saved: true }; }
};
const gated = createFulfillmentGatedServices({ services: baseServices, caseStore, checkoutPolicy });
await assert.rejects(() => gated.getFullResult({ case_id: 'case-1', owner_id: 'u1' }), error => error?.code === 'agreement_confirmation_not_delivered');
assert.equal(baseFullResultCalls, 0);
await assert.rejects(() => gated.saveGeneratedDraft({ case_id: 'case-1', owner_id: 'u1' }), error => error?.code === 'agreement_confirmation_not_delivered');

nextWebhook = {
  authenticated: true, provider: 'brevo', event: 'delivered', message_id: 'msg-123', case_id: 'case-1', checkout_consent_id: 'checkout-1', provider_event_at: '2026-08-19T08:21:30Z'
};
currentTime = '2026-08-19T08:22:00Z';
const delivered = await confirmationService.processWebhook({ headers: {}, raw_body: '{}' });
assert.equal(delivered.accepted, true);
assert.equal(delivered.delivered, true);
caseData = await caseStore.getOwned('case-1', 'u1');
assert.equal(caseData.checkout_consents[0].durable_medium_status, 'delivered');
assert.equal(caseData.checkout_consents[0].durable_medium_delivered_at, '2026-08-19T08:22:00.000Z');
assert.equal(isAgreementConfirmationDelivered(caseData, checkoutPolicy), true);
assert.deepEqual(await gated.getFullResult({ case_id: 'case-1', owner_id: 'u1' }), { unlocked: true });
assert.equal(baseFullResultCalls, 1);

const deliveredDuplicate = await confirmationService.processWebhook({ headers: {}, raw_body: '{}' });
assert.equal(deliveredDuplicate.duplicate, true);

// A message-id mismatch must never unlock or mutate another message delivery.
nextWebhook = { ...nextWebhook, message_id: 'wrong-message' };
await assert.rejects(() => confirmationService.processWebhook({ headers: {}, raw_body: '{}' }), error => error?.code === 'email_webhook_message_conflict');

// Terminal delivery failures remain locked.
await caseStore.save({
  id: 'case-2', owner_id: 'u2', state: 'paid', retention_mode: 'temporary',
  created_at: '2026-08-19T08:00:00Z', updated_at: '2026-08-19T08:20:00Z', deleted_at: null,
  documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [], events: [],
  checkout_consents: [{
    id: 'checkout-2', valid: true, checkout_policy_version: 'checkout-v1', terms_version: 'terms-v1', privacy_notice_version: 'privacy-v1', withdrawal_information_version: 'withdraw-v1',
    delivery_email: 'bounce@example.test', product_name: 'Full Fakturasjekk + utkast til innsigelse', amount_minor: 2900, currency: 'NOK',
    payment_button_label: 'Bestill med betalingsplikt – 29 kr', payment_obligation_acknowledged: true, immediate_service_start_requested: true,
    withdrawal_loss_on_full_performance_acknowledged: true, accepted_at: '2026-08-19T08:15:00Z', durable_medium_provider: 'brevo',
    durable_medium_status: 'sent', durable_medium_message_id: 'msg-bounce', durable_medium_sent_at: '2026-08-19T08:16:00Z', durable_medium_delivered_at: null
  }]
});
nextWebhook = { authenticated: true, provider: 'brevo', event: 'hard_bounce', message_id: 'msg-bounce', case_id: 'case-2', checkout_consent_id: 'checkout-2', provider_event_at: null };
const bounced = await confirmationService.processWebhook({ headers: {}, raw_body: '{}' });
assert.equal(bounced.status, 'failed');
const bouncedCase = await caseStore.getOwned('case-2', 'u2');
assert.equal(bouncedCase.checkout_consents[0].durable_medium_status, 'failed');
assert.equal(isAgreementConfirmationDelivered(bouncedCase, checkoutPolicy), false);

nextWebhook = { authenticated: false };
await assert.rejects(() => confirmationService.processWebhook({ headers: {}, raw_body: '{}' }), error => error?.code === 'invalid_email_webhook');

console.log('OK agreement confirmation distinguishes sent/delivered/failed and gates paid fulfillment until delivered');
