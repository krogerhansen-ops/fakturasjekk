import assert from 'node:assert/strict';
import { createAgreementConfirmationDeliveryService } from '../server/agreement-confirmation-delivery.mjs';

function checkoutService({ alreadyDelivered = false } = {}) {
  const state = {
    persisted: [],
    record: {
      id: 'checkout-1',
      valid: true,
      durable_medium_delivered_at: alreadyDelivered ? '2026-08-20T08:00:00.000Z' : null,
      durable_medium_type: alreadyDelivered ? 'email_text' : null,
      durable_medium_provider_reference: alreadyDelivered ? 'mail-existing' : null
    }
  };
  return {
    state,
    async getConfirmationForDelivery() {
      return { record: state.record, confirmation: { kind: 'fakturasjekk_agreement_confirmation', case_id: 'case-1' } };
    },
    async markConfirmationDelivered(input) {
      state.persisted.push(input);
      state.record = {
        ...state.record,
        durable_medium_delivered_at: input.delivered_at,
        durable_medium_type: input.medium_type,
        durable_medium_provider_reference: input.provider_reference ?? null
      };
      return { record: state.record, duplicate: false };
    }
  };
}

{
  const checkout = checkoutService();
  let calls = 0;
  const service = createAgreementConfirmationDeliveryService({
    checkoutConsentService: checkout,
    deliveryAdapter: {
      async deliverAgreementConfirmation() {
        calls += 1;
        return { delivered: true, medium_type: 'email_text', delivered_at: '2026-08-20T08:05:00.000Z', provider_reference: 'mail-1' };
      }
    }
  });
  const result = await service.deliverForCase({ case_id: 'case-1', owner_id: 'u1' });
  assert.equal(result.delivered, true);
  assert.equal(result.medium_type, 'email_text');
  assert.equal(calls, 1);
  assert.equal(checkout.state.persisted.length, 1);
  assert.equal(checkout.state.persisted[0].provider_reference, 'mail-1');
}

{
  const checkout = checkoutService();
  const service = createAgreementConfirmationDeliveryService({
    checkoutConsentService: checkout,
    deliveryAdapter: {
      async deliverAgreementConfirmation() {
        return { delivered: true, medium_type: 'web_link', delivered_at: '2026-08-20T08:05:00.000Z' };
      }
    }
  });
  await assert.rejects(
    () => service.deliverForCase({ case_id: 'case-1', owner_id: 'u1' }),
    error => error?.code === 'invalid_durable_medium'
  );
  assert.equal(checkout.state.persisted.length, 0);
}

{
  const checkout = checkoutService();
  const service = createAgreementConfirmationDeliveryService({
    checkoutConsentService: checkout,
    deliveryAdapter: {
      async deliverAgreementConfirmation() { return { delivered: false, medium_type: 'email_pdf' }; }
    }
  });
  await assert.rejects(
    () => service.deliverForCase({ case_id: 'case-1', owner_id: 'u1' }),
    error => error?.code === 'durable_delivery_not_confirmed'
  );
  assert.equal(checkout.state.persisted.length, 0);
}

{
  const checkout = checkoutService({ alreadyDelivered: true });
  let calls = 0;
  const service = createAgreementConfirmationDeliveryService({
    checkoutConsentService: checkout,
    deliveryAdapter: {
      async deliverAgreementConfirmation() { calls += 1; return { delivered: true, medium_type: 'email_text' }; }
    }
  });
  const result = await service.deliverForCase({ case_id: 'case-1', owner_id: 'u1' });
  assert.equal(result.delivered, true);
  assert.equal(result.duplicate, true);
  assert.equal(calls, 0);
  assert.equal(checkout.state.persisted.length, 0);
}

console.log('OK agreement confirmation delivery only persists provider-confirmed durable media and is idempotent.');
