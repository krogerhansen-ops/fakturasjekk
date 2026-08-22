import assert from 'node:assert/strict';
import { createOrderConfirmationDeliveryService } from '../server/order-confirmation-delivery-service.mjs';

function preparedConfirmation(overrides = {}) {
  return {
    document_type: 'order_confirmation_and_payment_receipt',
    confirmation_id: 'confirmation-1',
    issued_at: '2026-08-22T06:50:00.000Z',
    delivery_provider_accepted: false,
    delivery_provider_accepted_at: null,
    delivery_provider: null,
    delivery_reference: null,
    durable_medium_delivered: false,
    durable_medium_delivered_at: null,
    durable_medium: null,
    delivery_contact: { medium: 'email', address: 'customer@example.no', verified_provider: 'supabase_auth', verified_at: '2026-08-22T06:49:00.000Z' },
    seller: {
      legal_name: 'Fakturasjekk Test AS', organization_number: '999999999',
      postal_address: 'Testveien 1, 0001 Oslo', support_email: 'support@example.test', privacy_email: 'privacy@example.test'
    },
    product: { name: 'Full fakturasjekk + utkast til innsigelse', amount_minor: 2900, amount_nok: 29, currency: 'NOK' },
    agreement: {
      checkout_policy_version: 'checkout-v1', terms_version: 'terms-v1', privacy_notice_version: 'privacy-v1',
      withdrawal_information_version: 'withdrawal-v1', accepted_at: '2026-08-22T06:49:00.000Z',
      payment_obligation_acknowledged: true, immediate_service_start_requested: true,
      withdrawal_loss_on_full_performance_acknowledged: true
    },
    payment: {
      status: 'paid', amount_minor: 2900, amount_nok: 29, currency: 'NOK', provider: 'vipps',
      provider_reference: 'vipps-captured-1', paid_at: '2026-08-22T06:49:30.000Z', verified_server_side: true
    },
    customer_copy: {},
    ...overrides
  };
}

let confirmation = preparedConfirmation();
let providerCalls = 0;
let markCalls = 0;
const orderConfirmationService = {
  async getLatestPrepared({ case_id, owner_id }) {
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'owner-1');
    return { confirmation: structuredClone(confirmation), case: { id: case_id, owner_id } };
  },
  async markDelivered({ confirmation_id, medium, delivery_reference }) {
    markCalls += 1;
    assert.equal(confirmation_id, 'confirmation-1');
    assert.equal(medium, 'email');
    assert.equal(delivery_reference, 'email-message-1');
    confirmation = {
      ...confirmation,
      delivery_provider_accepted: true,
      durable_medium_delivered: true,
      durable_medium_delivered_at: '2026-08-22T06:51:00.000Z',
      durable_medium: medium,
      delivery_reference
    };
    return { confirmation: structuredClone(confirmation), updated: true };
  }
};
const deliveryAdapter = {
  async deliverOrderConfirmation(input) {
    providerCalls += 1;
    assert.equal(input.case_id, 'case-1');
    assert.equal(input.owner_id, 'owner-1');
    assert.equal(input.confirmation_id, 'confirmation-1');
    assert.equal(input.recipient_email, 'customer@example.no');
    assert.equal(input.idempotency_key, 'confirmation-1', 'provider send must use stable confirmation ID as idempotency key');
    assert.match(input.subject, /ordrebekreftelse/i);
    assert.match(input.text, /29,00 kr/);
    assert.match(input.html, /Ordrebekreftelse og betalingskvittering/);
    assert.equal(input.documents.text.filename.endsWith('.txt'), true);
    assert.equal(input.documents.html.filename.endsWith('.html'), true);
    return { delivered: true, accepted: true, medium: 'email', provider: 'test-mail', delivery_reference: 'email-message-1' };
  }
};

const service = createOrderConfirmationDeliveryService({ orderConfirmationService, deliveryAdapter });
const delivered = await service.deliverPrepared({ case_id: 'case-1', owner_id: 'owner-1', confirmation_id: 'confirmation-1' });
assert.equal(delivered.delivered, true);
assert.equal(delivered.accepted, true);
assert.equal(delivered.pending_provider_confirmation, false);
assert.equal(delivered.idempotent, false);
assert.equal(delivered.medium, 'email');
assert.equal(providerCalls, 1);
assert.equal(markCalls, 1);

const replay = await service.deliverPrepared({ case_id: 'case-1', owner_id: 'owner-1', confirmation_id: 'confirmation-1' });
assert.equal(replay.delivered, true);
assert.equal(replay.idempotent, true);
assert.equal(providerCalls, 1, 'already delivered confirmation must never be sent twice');
assert.equal(markCalls, 1);

// Provider acceptance alone is persisted but must never be promoted to durable delivery.
{
  let acceptedConfirmation = preparedConfirmation();
  let sendCalls = 0;
  let acceptedMarks = 0;
  const acceptedService = createOrderConfirmationDeliveryService({
    orderConfirmationService: {
      async getLatestPrepared() { return { confirmation: structuredClone(acceptedConfirmation), case: {} }; },
      async markDelivered() { throw new Error('provider acceptance must not mark delivered'); },
      async markProviderAccepted({ medium, provider, delivery_reference }) {
        acceptedMarks += 1;
        assert.equal(medium, 'email');
        assert.equal(provider, 'brevo');
        assert.equal(delivery_reference, '<message-1@relay>');
        acceptedConfirmation = {
          ...acceptedConfirmation,
          delivery_provider_accepted: true,
          delivery_provider_accepted_at: '2026-08-22T06:51:00.000Z',
          delivery_provider: provider,
          delivery_reference,
          durable_medium: medium
        };
        return { confirmation: structuredClone(acceptedConfirmation), updated: true };
      }
    },
    deliveryAdapter: {
      async deliverOrderConfirmation(input) {
        sendCalls += 1;
        assert.equal(input.recipient_email, 'customer@example.no');
        return { accepted: true, delivered: false, medium: 'email', provider: 'brevo', delivery_reference: '<message-1@relay>' };
      }
    }
  });
  const accepted = await acceptedService.deliverPrepared({ case_id: 'case-x', owner_id: 'owner-x' });
  assert.equal(accepted.delivered, false);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.pending_provider_confirmation, true);
  assert.equal(accepted.idempotent, false);
  assert.equal(sendCalls, 1);
  assert.equal(acceptedMarks, 1);

  const acceptedReplay = await acceptedService.deliverPrepared({ case_id: 'case-x', owner_id: 'owner-x' });
  assert.equal(acceptedReplay.delivered, false);
  assert.equal(acceptedReplay.accepted, true);
  assert.equal(acceptedReplay.pending_provider_confirmation, true);
  assert.equal(acceptedReplay.idempotent, true);
  assert.equal(sendCalls, 1, 'provider-accepted message must never be sent again while waiting for delivery webhook');
  assert.equal(acceptedMarks, 1);
}

confirmation = preparedConfirmation();
let failedMarkCalls = 0;
const unconfirmed = createOrderConfirmationDeliveryService({
  orderConfirmationService: {
    async getLatestPrepared() { return { confirmation: structuredClone(confirmation), case: {} }; },
    async markDelivered() { failedMarkCalls += 1; throw new Error('must not mark'); }
  },
  deliveryAdapter: { async deliverOrderConfirmation() { return { delivered: false, accepted: false, medium: 'email' }; } }
});
await assert.rejects(
  () => unconfirmed.deliverPrepared({ case_id: 'case-x', owner_id: 'owner-x' }),
  error => error?.code === 'order_confirmation_delivery_unconfirmed'
);
assert.equal(failedMarkCalls, 0, 'unconfirmed provider response must not mark durable delivery');

const providerFailure = createOrderConfirmationDeliveryService({
  orderConfirmationService: {
    async getLatestPrepared() { return { confirmation: preparedConfirmation(), case: {} }; },
    async markDelivered() { throw new Error('must not mark'); }
  },
  deliveryAdapter: { async deliverOrderConfirmation() { throw new Error('provider unavailable'); } }
});
await assert.rejects(
  () => providerFailure.deliverPrepared({ case_id: 'case-x', owner_id: 'owner-x' }),
  error => error?.code === 'order_confirmation_delivery_failed'
);

await assert.rejects(
  () => service.deliverPrepared({ case_id: 'case-1', owner_id: 'owner-1', confirmation_id: 'other-confirmation' }),
  error => error?.code === 'order_confirmation_mismatch'
);

console.log('OK durable order confirmation delivery separates provider acceptance from delivery, prevents duplicate resend and fails closed');
