import assert from 'node:assert/strict';
import { createPaymentWebhookService } from '../server/payment-webhook-service.mjs';

function paidConfirmation() {
  return {
    provider: 'vipps',
    provider_reference: 'pay-1',
    case_id: 'case-1',
    amount_minor: 2900,
    currency: 'NOK',
    status: 'paid',
    operation_success: true,
    event_name: 'PAYMENT_CAPTURED',
    verified_server_side: true,
    paid_at: '2026-08-20T08:00:00.000Z'
  };
}

{
  let confirmCalls = 0;
  let deliveryCalls = 0;
  const service = createPaymentWebhookService({
    caseStore: { async getForSystem() { return { id: 'case-1', owner_id: 'u1' }; } },
    services: { async confirmPayment() { confirmCalls += 1; return { paid: true }; } },
    gateway: { async verifyEvent() { return paidConfirmation(); } },
    eventStore: { async claim() { return { status: 'claimed' }; } },
    agreementConfirmationDelivery: {
      async deliverForCase(input) {
        deliveryCalls += 1;
        assert.deepEqual(input, { case_id: 'case-1', owner_id: 'u1' });
        return { delivered: true, medium_type: 'email_pdf' };
      }
    }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.accepted, true);
  assert.equal(result.paid, true);
  assert.equal(result.confirmation_delivered, true);
  assert.equal(result.durable_medium_type, 'email_pdf');
  assert.equal(confirmCalls, 1);
  assert.equal(deliveryCalls, 1);
}

{
  let attempt = 0;
  let confirmCalls = 0;
  const service = createPaymentWebhookService({
    caseStore: { async getForSystem() { return { id: 'case-1', owner_id: 'u1' }; } },
    services: { async confirmPayment() { confirmCalls += 1; return { paid: true }; } },
    gateway: { async verifyEvent() { return paidConfirmation(); } },
    eventStore: {
      async claim() {
        attempt += 1;
        return { status: attempt === 1 ? 'claimed' : 'duplicate_same_case' };
      }
    },
    agreementConfirmationDelivery: {
      async deliverForCase() {
        if (attempt === 1) {
          const error = new Error('mail provider temporary failure');
          error.code = 'durable_delivery_not_confirmed';
          throw error;
        }
        return { delivered: true, medium_type: 'email_text' };
      }
    }
  });

  await assert.rejects(
    () => service.process({ headers: {}, raw_body: '{}' }),
    error => error?.code === 'durable_delivery_not_confirmed'
  );
  const retry = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(retry.paid, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.confirmation_delivered, true);
  assert.equal(confirmCalls, 2, 'confirmPayment is deliberately idempotent on duplicate signed webhook retries');
}

{
  const service = createPaymentWebhookService({
    caseStore: { async getForSystem() { return { id: 'case-1', owner_id: 'u1' }; } },
    services: { async confirmPayment() { return { paid: true }; } },
    gateway: { async verifyEvent() { return paidConfirmation(); } },
    eventStore: { async claim() { return { status: 'claimed' }; } }
  });
  const result = await service.process({ headers: {}, raw_body: '{}' });
  assert.equal(result.paid, true);
  assert.equal(result.confirmation_delivered, null, 'generic/non-production wiring remains backwards compatible');
}

console.log('OK paid webhook delivers durable confirmation and signed duplicate retry can recover a transient delivery failure.');
