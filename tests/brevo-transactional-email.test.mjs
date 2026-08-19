import assert from 'node:assert/strict';
import { createBrevoTransactionalEmailProvider, BREVO_API_ORIGIN } from '../server/brevo-transactional-email.mjs';

const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  return new Response(JSON.stringify({ messageId: '<202608190900.12345@relay.example>' }), { status: 201, headers: { 'content-type': 'application/json' } });
};
const webhookToken = 'brevo-webhook-secret-1234567890';
const provider = createBrevoTransactionalEmailProvider({
  apiKey: 'brevo-api-key-test',
  senderEmail: 'kvittering@fakturasjekk.no',
  senderName: 'Fakturasjekk',
  replyToEmail: 'support@fakturasjekk.no',
  webhookBearerToken: webhookToken,
  fetchImpl
});

const payload = {
  version: 1,
  durable_medium_delivered: false,
  case_id: 'case-123',
  created_at: '2026-08-19T08:50:00.000Z',
  seller: {
    legal_name: 'Fakturasjekk Test AS',
    organization_number: '999999999',
    postal_address: 'Testveien 1, 0001 Oslo',
    support_email: 'support@fakturasjekk.no',
    privacy_email: 'privacy@fakturasjekk.no'
  },
  product: { name: 'Full Fakturasjekk + utkast til innsigelse', amount_minor: 2900, amount_nok: 29, currency: 'NOK' },
  versions: { checkout_policy: 'v1', terms: 'terms-v1', privacy_notice: 'privacy-v1', withdrawal_information: 'withdraw-v1' },
  acknowledgements: { payment_obligation: true, immediate_service_start: true, withdrawal_loss_on_full_performance: true },
  payment_button_label: 'Bestill med betalingsplikt – 29 kr',
  withdrawal_notice: 'Jeg forstår at angreretten går tapt når Fakturasjekk har levert tjenesten fullt ut.',
  immediate_start_request: 'Jeg ber uttrykkelig om oppstart.',
  payment_obligation_notice: 'Jeg forstår at bestillingen koster totalt 29 kr.'
};

const sent = await provider.sendAgreementConfirmation({
  case_id: 'case-123',
  checkout_consent_id: 'checkout-456',
  delivery_email: 'Kunde@Example.Test',
  agreement_confirmation_payload: payload
});
assert.equal(sent.provider, 'brevo');
assert.equal(sent.message_id, '202608190900.12345@relay.example');
assert.equal(sent.recipient_email, 'kunde@example.test');
assert.equal(calls.length, 1);
const call = calls[0];
assert.equal(call.url, `${BREVO_API_ORIGIN}/v3/smtp/email`);
assert.equal(call.options.method, 'POST');
assert.equal(call.options.headers['api-key'], 'brevo-api-key-test');
assert.equal(call.options.cache, 'no-store');
assert.equal(call.options.redirect, 'error');
assert.equal(call.body.to[0].email, 'kunde@example.test');
assert.equal(call.body.subject, 'Kjøpsbekreftelse – Fakturasjekk 29 kr');
assert.equal(call.body.headers['X-Mailin-custom'], 'fsk_case=case-123&fsk_checkout=checkout-456');
assert.match(call.body.headers['Idempotency-Key'], /^[0-9a-f]{32}$/);
assert.deepEqual(call.body.tags, ['fakturasjekk-confirmation']);
assert.match(call.body.textContent, /Total pris: 29 kr NOK/);
assert.match(call.body.textContent, /Ta vare på denne e-posten/);
assert.match(call.body.htmlContent, /Kjøpsbekreftelse/);
assert.equal(call.body.htmlContent.includes('<img'), false, 'confirmation email must not contain external tracking images from Fakturasjekk');
assert.equal(JSON.stringify(call.body).includes('brevo-api-key-test'), false, 'API key must never enter email body');

const deliveredBody = JSON.stringify({
  event: 'delivered',
  'message-id': '<202608190900.12345@relay.example>',
  'X-Mailin-custom': 'fsk_case=case-123&fsk_checkout=checkout-456',
  ts_event: 1787129400,
  email: 'kunde@example.test'
});
const delivered = provider.verifyWebhook({ headers: { authorization: `Bearer ${webhookToken}` }, raw_body: deliveredBody });
assert.equal(delivered.authenticated, true);
assert.equal(delivered.event, 'delivered');
assert.equal(delivered.case_id, 'case-123');
assert.equal(delivered.checkout_consent_id, 'checkout-456');
assert.equal(delivered.message_id, '202608190900.12345@relay.example');
assert.equal('email' in delivered, false, 'recipient PII is not forwarded from webhook verifier');

const bounce = provider.verifyWebhook({
  headers: { Authorization: `Bearer ${webhookToken}` },
  raw_body: JSON.stringify({ event: 'hardBounce', 'message-id': '202608190900.12345@relay.example', 'X-Mailin-custom': 'fsk_case=case-123&fsk_checkout=checkout-456' })
});
assert.equal(bounce.event, 'hard_bounce');

assert.deepEqual(provider.verifyWebhook({ headers: { authorization: 'Bearer wrong-secret' }, raw_body: deliveredBody }), { authenticated: false });
assert.throws(() => provider.verifyWebhook({
  headers: { authorization: `Bearer ${webhookToken}` },
  raw_body: JSON.stringify({ event: 'opened', 'message-id': 'm', 'X-Mailin-custom': 'fsk_case=case-123&fsk_checkout=checkout-456' })
}), /Unsupported Brevo/);
await assert.rejects(() => provider.sendAgreementConfirmation({ case_id: 'case', checkout_consent_id: 'c', delivery_email: 'bad', agreement_confirmation_payload: payload }), /email is invalid/i);

console.log('OK Brevo durable confirmation uses server-only API auth, bounded content, tracking metadata and authenticated delivery events');
