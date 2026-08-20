import assert from 'node:assert/strict';
import { createPaidServiceDeliveryGate } from '../server/paid-service-delivery-gate.mjs';

{
  const gate = createPaidServiceDeliveryGate({
    checkoutConsentService: { async deliveryReadiness() { return { ready: false, checkout_consent_id: null }; } }
  });
  await assert.rejects(
    () => gate.assertReady({ case_id: 'case-1', owner_id: 'u1' }),
    error => error?.code === 'checkout_consent_required'
  );
}

{
  const gate = createPaidServiceDeliveryGate({
    checkoutConsentService: { async deliveryReadiness() { return { ready: false, checkout_consent_id: 'checkout-1' }; } }
  });
  await assert.rejects(
    () => gate.assertReady({ case_id: 'case-1', owner_id: 'u1' }),
    error => error?.code === 'durable_confirmation_required' && error.checkout_consent_id === 'checkout-1'
  );
}

{
  const gate = createPaidServiceDeliveryGate({
    checkoutConsentService: {
      async deliveryReadiness() {
        return {
          ready: true,
          checkout_consent_id: 'checkout-1',
          durable_medium_delivered_at: '2026-08-20T08:00:00.000Z',
          durable_medium_type: 'email_pdf'
        };
      }
    }
  });
  const result = await gate.assertReady({ case_id: 'case-1', owner_id: 'u1' });
  assert.equal(result.ready, true);
  assert.equal(result.durable_medium_type, 'email_pdf');
}

{
  const gate = createPaidServiceDeliveryGate({ required: false });
  const result = await gate.assertReady({ case_id: 'case-1', owner_id: 'u1' });
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'gate_not_required');
}

console.log('OK paid-service delivery gate blocks missing consent or durable delivery and allows only ready checkout records.');
