import assert from 'node:assert/strict';
import { createBrevoOrderConfirmationDelivery, BREVO_ORDER_CONFIRMATION_POLICY } from '../server/brevo-order-confirmation-delivery.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const webhookSecret = 'synthetic-brevo-webhook-secret-1234567890';
const calls = [];
const adapter = createBrevoOrderConfirmationDelivery({
  apiKey: 'xkeysib-synthetic-test-key',
  senderEmail: 'kvittering@fakturasjekk.no',
  senderName: 'Fakturasjekk',
  replyToEmail: 'support@fakturasjekk.no',
  webhookSecret,
  fetchImpl: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ messageId: '<receipt-1@relay.brevo.example>' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }
});

const accepted = await adapter.deliverOrderConfirmation({
  case_id: 'case-12345678',
  owner_id: ownerId,
  confirmation_id: 'confirmation-12345678',
  recipient_email: 'Customer@Example.NO',
  idempotency_key: 'confirmation-12345678',
  subject: 'Fakturasjekk – ordrebekreftelse og betalingskvittering',
  text: 'Ordrebekreftelse 29,00 kr',
  html: '<p>Ordrebekreftelse 29,00 kr</p>'
});
assert.deepEqual(accepted, {
  accepted: true,
  delivered: false,
  medium: 'email',
  provider: 'brevo',
  delivery_reference: '<receipt-1@relay.brevo.example>',
  idempotency_key: accepted.idempotency_key
});
assert.match(accepted.idempotency_key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
assert.equal(calls[0].options.method, 'POST');
assert.equal(calls[0].options.headers['api-key'], 'xkeysib-synthetic-test-key');
assert.equal(calls[0].body.to[0].email, 'customer@example.no');
assert.equal(calls[0].body.to[0].contactPixelTrackingConsent, false);
assert.equal(calls[0].body.sender.email, 'kvittering@fakturasjekk.no');
assert.equal(calls[0].body.replyTo.email, 'support@fakturasjekk.no');
assert.equal(calls[0].body.headers.idempotencyKey, accepted.idempotency_key);
assert.equal(calls[0].body.headers['X-Mailin-custom'], `fskv1|case-12345678|${ownerId}|confirmation-12345678`);
assert.deepEqual(calls[0].body.tags, ['fakturasjekk-order-confirmation']);
assert.equal(JSON.stringify(calls[0].body).includes('xkeysib-synthetic-test-key'), false, 'API key must stay in transport header, never email body');

const replayAdapter = createBrevoOrderConfirmationDelivery({
  apiKey: 'xkeysib-synthetic-test-key',
  senderEmail: 'kvittering@fakturasjekk.no',
  webhookSecret,
  fetchImpl: async (_url, options) => new Response(JSON.stringify({ messageId: '<same@relay>' }), { status: 201 })
});
const replay = await replayAdapter.deliverOrderConfirmation({
  case_id: 'case-12345678', owner_id: ownerId, confirmation_id: 'confirmation-12345678',
  recipient_email: 'customer@example.no', idempotency_key: 'confirmation-12345678',
  subject: 'Receipt', text: 'Receipt', html: '<p>Receipt</p>'
});
assert.equal(replay.idempotency_key, accepted.idempotency_key, 'same confirmation must derive same Brevo idempotency key');

const deliveredEvent = {
  event: 'delivered',
  'message-id': '<receipt-1@relay.brevo.example>',
  'X-Mailin-custom': `fskv1|case-12345678|${ownerId}|confirmation-12345678`,
  ts_event: 1787396400
};
const verified = adapter.verifyWebhook({
  headers: { 'X-Fakturasjekk-Brevo-Secret': webhookSecret },
  raw_body: JSON.stringify(deliveredEvent)
});
assert.equal(verified.authenticated, true);
assert.equal(verified.delivered, true);
assert.equal(verified.provider, 'brevo');
assert.equal(verified.case_id, 'case-12345678');
assert.equal(verified.owner_id, ownerId);
assert.equal(verified.confirmation_id, 'confirmation-12345678');
assert.equal(verified.delivery_reference, '<receipt-1@relay.brevo.example>');

const bounced = adapter.verifyWebhook({
  headers: { 'x-fakturasjekk-brevo-secret': webhookSecret },
  raw_body: JSON.stringify({ ...deliveredEvent, event: 'hardBounce' })
});
assert.equal(bounced.authenticated, true);
assert.equal(bounced.delivered, false);
assert.equal(bounced.terminal_failure, true);

assert.deepEqual(adapter.verifyWebhook({ headers: { 'x-fakturasjekk-brevo-secret': 'wrong-secret-value-xxxxxxxxxxxxxxxx' }, raw_body: JSON.stringify(deliveredEvent) }), { authenticated: false });
assert.deepEqual(adapter.verifyWebhook({ headers: { 'x-fakturasjekk-brevo-secret': webhookSecret }, raw_body: 'not-json' }), { authenticated: false });
assert.throws(() => createBrevoOrderConfirmationDelivery({ apiKey: 'wrong', senderEmail: 'a@example.no', webhookSecret }), /API key format/i);
assert.throws(() => createBrevoOrderConfirmationDelivery({ apiKey: 'xkeysib-test', senderEmail: 'a@example.no', webhookSecret: 'too-short' }), /at least 32/i);
assert.equal(BREVO_ORDER_CONFIRMATION_POLICY.provider_acceptance_is_not_delivery, true);
assert.equal(BREVO_ORDER_CONFIRMATION_POLICY.tracking_consent, false);

console.log('OK Brevo receipt adapter is EU-provider-ready, tracking-minimized, idempotent and keeps provider acceptance separate from delivered webhook status');
