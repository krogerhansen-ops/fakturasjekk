import assert from 'node:assert/strict';
import { buildDownloadableOrderConfirmation, orderConfirmationHtml, orderConfirmationText } from '../server/order-confirmation-document.mjs';

const confirmation = {
  version: 1,
  document_type: 'order_confirmation_and_payment_receipt',
  confirmation_id: 'confirmation-123',
  issued_at: '2026-08-20T17:00:00.000Z',
  durable_medium_delivered: false,
  durable_medium_delivered_at: null,
  durable_medium: null,
  seller: {
    legal_name: 'Fakturasjekk Test <AS>',
    organization_number: '999999999',
    postal_address: 'Testveien 1, 0001 Oslo',
    support_email: 'support@example.test',
    privacy_email: 'privacy@example.test'
  },
  product: {
    name: 'Full fakturasjekk + utkast til innsigelse',
    amount_minor: 2900,
    amount_nok: 29,
    currency: 'NOK'
  },
  agreement: {
    checkout_policy_version: '1',
    terms_version: 'terms-1',
    privacy_notice_version: 'privacy-1',
    withdrawal_information_version: 'withdrawal-1',
    accepted_at: '2026-08-20T16:58:00.000Z',
    payment_obligation_acknowledged: true,
    immediate_service_start_requested: true,
    withdrawal_loss_on_full_performance_acknowledged: true
  },
  payment: {
    status: 'paid',
    amount_minor: 2900,
    amount_nok: 29,
    currency: 'NOK',
    provider: 'synthetic',
    provider_reference: 'provider-ref-123',
    paid_at: '2026-08-20T16:59:00.000Z',
    verified_server_side: true
  },
  customer_copy: {
    payment_obligation: 'Du bekrefter at bestillingen medfører betalingsplikt.',
    immediate_start: 'Du ber om at tjenesten starter med en gang.',
    withdrawal_loss: 'Du erkjenner informasjonen om angrerett ved full levering.'
  }
};

const text = orderConfirmationText(confirmation);
assert.match(text, /29,00 kr NOK/);
assert.match(text, /provider-ref-123/);
assert.match(text, /Umiddelbar oppstart uttrykkelig bedt om: Ja/);
assert.match(text, /Generering av filen markerer ikke i seg selv at den er levert på varig medium/);
assert.equal(text.includes('storage_key'), false);
assert.equal(text.includes('case_id'), false);

const html = orderConfirmationHtml(confirmation);
assert.match(html, /<!doctype html>/);
assert.match(html, /Fakturasjekk Test &lt;AS&gt;/, 'seller-controlled text must be HTML escaped');
assert.equal(html.includes('Fakturasjekk Test <AS>'), false);
assert.match(html, /29,00 kr NOK/);
assert.match(html, /provider-ref-123/);
assert.match(html, /Generering av filen markerer ikke i seg selv at den er levert på varig medium/);

const downloadable = buildDownloadableOrderConfirmation(confirmation);
assert.equal(downloadable.format, 'html');
assert.equal(downloadable.filename, 'fakturasjekk-ordrebekreftelse-confirmation-123.html');
assert.equal(downloadable.content_type, 'text/html; charset=utf-8');
assert.match(downloadable.content_disposition, /^attachment;/);
assert.equal(downloadable.durable_medium_delivered, false, 'rendering a downloadable file must never mark delivery by itself');
assert.equal(downloadable.body, html);

const plain = buildDownloadableOrderConfirmation(confirmation, { format: 'text' });
assert.equal(plain.filename, 'fakturasjekk-ordrebekreftelse-confirmation-123.txt');
assert.equal(plain.content_type, 'text/plain; charset=utf-8');
assert.equal(plain.durable_medium_delivered, false);
assert.equal(plain.body, text);

assert.throws(
  () => buildDownloadableOrderConfirmation({ ...confirmation, payment: { ...confirmation.payment, verified_server_side: false } }),
  error => error?.code === 'order_confirmation_document_payment_invalid'
);
assert.throws(
  () => buildDownloadableOrderConfirmation({ ...confirmation, product: { ...confirmation.product, amount_minor: 3900 } }),
  error => error?.code === 'order_confirmation_document_amount_mismatch'
);
assert.throws(
  () => buildDownloadableOrderConfirmation(confirmation, { format: 'pdf' }),
  error => error?.code === 'order_confirmation_document_format_invalid'
);

console.log('OK downloadable order confirmation is deterministic, escaped and never self-marks durable-medium delivery');
