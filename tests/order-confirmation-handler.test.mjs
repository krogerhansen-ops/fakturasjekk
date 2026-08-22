import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApi } from '../server/api.mjs';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createOrderConfirmationService } from '../server/order-confirmation-service.mjs';

const checkoutPolicy = JSON.parse(fs.readFileSync(new URL('../config/checkout-policy.json', import.meta.url), 'utf8'));
checkoutPolicy.seller = {
  ready: true,
  legal_name: 'Fakturasjekk Test AS',
  organization_number: '999999999',
  postal_address: 'Testveien 1, 0001 Oslo',
  support_email: 'support@example.test',
  privacy_email: 'privacy@example.test'
};

const consent = {
  id: 'checkout-1',
  checkout_policy_version: checkoutPolicy.version,
  terms_version: checkoutPolicy.terms_version,
  privacy_notice_version: checkoutPolicy.privacy_notice_version,
  withdrawal_information_version: checkoutPolicy.withdrawal_information_version,
  payment_obligation_acknowledged: true,
  immediate_service_start_requested: true,
  withdrawal_loss_on_full_performance_acknowledged: true,
  accepted_at: '2026-08-22T06:00:00.000Z',
  durable_medium_delivered_at: null
};
const payment = {
  id: 'pay-1',
  amount_minor: 2900,
  amount_nok: 29,
  currency: 'NOK',
  status: 'paid',
  provider: 'synthetic',
  provider_reference: 'provider-ref-1',
  verified_server_side: true,
  paid_at: '2026-08-22T06:01:00.000Z'
};

const store = createMemoryCaseStore();
await store.save({
  id: 'case-paid', owner_id: 'u1', state: 'paid', retention_mode: 'temporary',
  created_at: '2026-08-22T05:00:00.000Z', updated_at: '2026-08-22T06:01:00.000Z', deleted_at: null,
  events: [], documents: [], analyses: [], payments: [payment], drafts: [], supplier_responses: [], follow_ups: [],
  checkout_consents: [consent], order_confirmations: []
});
await store.save({
  id: 'case-not-ready', owner_id: 'u1', state: 'paid', retention_mode: 'temporary',
  created_at: '2026-08-22T05:00:00.000Z', updated_at: '2026-08-22T06:01:00.000Z', deleted_at: null,
  events: [], documents: [], analyses: [], payments: [payment], drafts: [], supplier_responses: [], follow_ups: [],
  checkout_consents: [consent], order_confirmations: []
});

const orderConfirmationService = createOrderConfirmationService({
  caseStore: store,
  checkoutPolicy,
  clock: () => new Date('2026-08-22T06:02:00.000Z')
});
await orderConfirmationService.prepare({ case_id: 'case-paid', owner_id: 'u1' });

const api = createApi({ services: {}, orderConfirmationService });
const html = await api.invoke('order_confirmation_download', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-paid', format: 'html' }
});
assert.equal(html.status, 200);
assert.equal(html.body.document.format, 'html');
assert.equal(html.body.document.content_type, 'text/html; charset=utf-8');
assert.match(html.body.document.filename, /^fakturasjekk-ordrebekreftelse-/);
assert.match(html.body.document.body, /Ordrebekreftelse og betalingskvittering/);
assert.match(html.body.document.body, /29,00 kr NOK/);
assert.equal(html.body.document.durable_medium_delivered, false);
assert.equal(JSON.stringify(html.body).includes('storage_key'), false);
assert.equal(JSON.stringify(html.body).includes('case-paid'), false, 'case id must not leak into receipt download payload');

const text = await api.invoke('order_confirmation_download', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-paid', format: 'text' }
});
assert.equal(text.status, 200);
assert.equal(text.body.document.format, 'text');
assert.equal(text.body.document.content_type, 'text/plain; charset=utf-8');
assert.match(text.body.document.body, /GENERERING AV FILEN/i);

const storedAfterDownloads = await store.getOwned('case-paid', 'u1');
assert.equal(storedAfterDownloads.order_confirmations.at(-1).durable_medium_delivered, false, 'GET/download generation must never mark durable-medium delivery');
assert.equal(storedAfterDownloads.checkout_consents.at(-1).durable_medium_delivered_at, null);
assert.equal(storedAfterDownloads.events.filter(event => event.type === 'ORDER_CONFIRMATION_DELIVERED').length, 0);

const wrongOwner = await api.invoke('order_confirmation_download', {
  auth: { user: { id: 'u2' } },
  params: { case_id: 'case-paid', format: 'html' }
});
assert.equal(wrongOwner.status, 404);
assert.equal(wrongOwner.body.error.code, 'case_not_found');

const notReady = await api.invoke('order_confirmation_download', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-not-ready', format: 'html' }
});
assert.equal(notReady.status, 409);
assert.equal(notReady.body.error.code, 'order_confirmation_not_ready');

const invalidFormat = await api.invoke('order_confirmation_download', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-paid', format: 'pdf' }
});
assert.equal(invalidFormat.status, 400);
assert.equal(invalidFormat.body.error.code, 'invalid_order_confirmation_format');

const unavailableApi = createApi({ services: {} });
const unavailable = await unavailableApi.invoke('order_confirmation_download', {
  auth: { user: { id: 'u1' } },
  params: { case_id: 'case-paid', format: 'html' }
});
assert.equal(unavailable.status, 503);
assert.equal(unavailable.body.error.code, 'order_confirmation_unavailable');

console.log('OK authenticated order-confirmation download is owner-bound, paid-only, read-only and durable-medium neutral.');
