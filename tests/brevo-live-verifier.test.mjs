import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  BREVO_E2E_APPROVAL,
  validateBrevoLiveTarget,
  assertSyntheticBrevoNetworkApproval,
  verifyBrevoWebhookConfiguration,
  runBrevoLiveVerification
} from '../scripts/verify-brevo-live.mjs';

const webhookSecret = 'synthetic-brevo-webhook-secret-1234567890';
const apiKey = 'xkeysib-synthetic-live-verifier-test-key';
const webhookUrl = 'https://api.fakturasjekk.no/v1/webhooks/order-confirmation/brevo';
const requiredEvents = ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred'];

function validTarget(overrides = {}) {
  return {
    version: 1,
    provider: 'brevo',
    purpose: 'synthetic_order_confirmation_delivery_verification',
    transactional_only: true,
    webhook_url: webhookUrl,
    sender_email: 'kvittering@fakturasjekk.no',
    sender_domain: 'fakturasjekk.no',
    webhook_header_name: 'x-fakturasjekk-brevo-secret',
    required_events: requiredEvents,
    webhook_batched: false,
    customer_data_live_enabled: false,
    synthetic_send_enabled: false,
    ...overrides
  };
}

const reviewed = validateBrevoLiveTarget(validTarget(), webhookUrl);
assert.equal(reviewed.webhook_url, webhookUrl);
assert.equal(reviewed.sender_email, 'kvittering@fakturasjekk.no');
assert.deepEqual(reviewed.required_events, requiredEvents);

for (const [label, target] of [
  ['wrong provider', validTarget({ provider: 'other' })],
  ['customer data enabled', validTarget({ customer_data_live_enabled: true })],
  ['batched webhook', validTarget({ webhook_batched: true })],
  ['external hostname', validTarget({ webhook_url: 'https://example.com/v1/webhooks/order-confirmation/brevo' })],
  ['wrong route', validTarget({ webhook_url: 'https://api.fakturasjekk.no/v1/webhooks/payment/brevo' })],
  ['url query', validTarget({ webhook_url: `${webhookUrl}?secret=no` })],
  ['wrong sender domain', validTarget({ sender_email: 'kvittering@other.example' })],
  ['missing event', validTarget({ required_events: requiredEvents.filter(item => item !== 'delivered') })],
  ['wrong header', validTarget({ webhook_header_name: 'x-other-secret' })]
]) {
  assert.throws(() => validateBrevoLiveTarget(target, target.webhook_url), undefined, `${label} must fail closed`);
}
assert.throws(() => validateBrevoLiveTarget(validTarget(), 'https://hooks.fakturasjekk.no/v1/webhooks/order-confirmation/brevo'), /confirmation does not match/i);

assert.equal(assertSyntheticBrevoNetworkApproval({
  mode: 'config-only', approval: BREVO_E2E_APPROVAL, costMode: 'zero', paidServicesApproved: 'no', syntheticSendEnabled: false
}), true, 'read-only configuration verification may run in zero-cost mode after explicit network approval');
assert.throws(() => assertSyntheticBrevoNetworkApproval({ mode: 'config-only', approval: 'wrong' }), /exact network-call approval/i);
assert.throws(() => assertSyntheticBrevoNetworkApproval({ mode: 'bad-mode', approval: BREVO_E2E_APPROVAL }), /mode is invalid/i);
assert.throws(() => assertSyntheticBrevoNetworkApproval({
  mode: 'send-acceptance', approval: BREVO_E2E_APPROVAL, costMode: 'funded', paidServicesApproved: 'approved', syntheticSendEnabled: false
}), /sending is disabled/i);
assert.throws(() => assertSyntheticBrevoNetworkApproval({
  mode: 'send-acceptance', approval: BREVO_E2E_APPROVAL, costMode: 'zero', paidServicesApproved: 'approved', syntheticSendEnabled: true
}), /cost mode is zero/i);
assert.throws(() => assertSyntheticBrevoNetworkApproval({
  mode: 'send-acceptance', approval: BREVO_E2E_APPROVAL, costMode: 'funded', paidServicesApproved: 'no', syntheticSendEnabled: true
}), /paid-services approval/i);

function webhookPayload(overrides = {}) {
  return {
    webhooks: [{
      id: 123,
      type: 'transactional',
      url: webhookUrl,
      events: requiredEvents,
      batched: false,
      headers: [{ key: 'X-Fakturasjekk-Brevo-Secret', value: webhookSecret }],
      ...overrides
    }]
  };
}

const verified = verifyBrevoWebhookConfiguration({ payload: webhookPayload(), target: reviewed, webhookSecret });
assert.equal(verified.webhook_configuration_verified, true);
assert.equal(verified.authentication_header_verified, true);
assert.equal(verified.required_events_verified, true);

assert.throws(() => verifyBrevoWebhookConfiguration({ payload: webhookPayload({ batched: true }), target: reviewed, webhookSecret }), /must not batch/i);
assert.throws(() => verifyBrevoWebhookConfiguration({ payload: webhookPayload({ events: ['delivered'] }), target: reviewed, webhookSecret }), /missing required event/i);
assert.throws(() => verifyBrevoWebhookConfiguration({
  payload: webhookPayload({ headers: [{ key: 'x-fakturasjekk-brevo-secret', value: 'wrong-secret-value-12345678901234567890' }] }),
  target: reviewed,
  webhookSecret
}), /exact reviewed/i);
assert.throws(() => verifyBrevoWebhookConfiguration({ payload: { webhooks: [] }, target: reviewed, webhookSecret }), /exactly one/i);
assert.throws(() => verifyBrevoWebhookConfiguration({ payload: { webhooks: [webhookPayload().webhooks[0], webhookPayload().webhooks[0]] }, target: reviewed, webhookSecret }), /exactly one/i);

// Config-only mode performs one read-only Brevo API call and returns no secrets/provider identifiers.
{
  const calls = [];
  const result = await runBrevoLiveVerification({
    target: validTarget(),
    env: {
      BREVO_LIVE_E2E_MODE: 'config-only',
      BREVO_WEBHOOK_URL_CONFIRMATION: webhookUrl,
      FAKTURASJEKK_BREVO_SYNTHETIC_E2E_APPROVED: BREVO_E2E_APPROVAL,
      FAKTURASJEKK_COST_MODE: 'zero',
      FAKTURASJEKK_PAID_SERVICES_APPROVED: 'no',
      BREVO_API_KEY: apiKey,
      BREVO_WEBHOOK_SECRET: webhookSecret
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['api-key'], apiKey);
      return new Response(JSON.stringify(webhookPayload()), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.synthetic_only, true);
  assert.equal(result.webhook_configuration_verified, true);
  assert.equal(result.synthetic_send_accepted, false);
  assert.equal(result.durable_medium_delivered, false);
  assert.equal(result.delivery_webhook_e2e_verified, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(apiKey), false);
  assert.equal(serialized.includes(webhookSecret), false);
  assert.equal(serialized.includes('messageId'), false);
  assert.equal(serialized.includes('@'), false, 'output must not expose any email address');
}

// Send-acceptance mode uses the real Brevo adapter contract but still refuses to call acceptance delivery.
{
  const calls = [];
  const target = validTarget({ synthetic_send_enabled: true });
  const result = await runBrevoLiveVerification({
    target,
    env: {
      BREVO_LIVE_E2E_MODE: 'send-acceptance',
      BREVO_WEBHOOK_URL_CONFIRMATION: webhookUrl,
      FAKTURASJEKK_BREVO_SYNTHETIC_E2E_APPROVED: BREVO_E2E_APPROVAL,
      FAKTURASJEKK_COST_MODE: 'funded',
      FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved',
      BREVO_API_KEY: apiKey,
      BREVO_WEBHOOK_SECRET: webhookSecret,
      BREVO_SYNTHETIC_RECIPIENT_EMAIL: 'fakturasjekk-synthetic@example.test'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'GET') {
        return new Response(JSON.stringify(webhookPayload()), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.to[0].email, 'fakturasjekk-synthetic@example.test');
      assert.equal(body.to[0].contactPixelTrackingConsent, false);
      assert.match(body.subject, /syntetisk/i);
      assert.equal(JSON.stringify(body).includes('customer'), false);
      return new Response(JSON.stringify({ messageId: '<synthetic-message@relay.example>' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(result.synthetic_send_accepted, true);
  assert.equal(result.durable_medium_delivered, false, 'Brevo send acceptance must never be called durable-medium delivery');
  assert.equal(result.delivery_webhook_e2e_verified, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('fakturasjekk-synthetic@example.test'), false);
  assert.equal(serialized.includes('synthetic-message'), false);
}

await assert.rejects(() => runBrevoLiveVerification({
  target: validTarget({ synthetic_send_enabled: true }),
  env: {
    BREVO_LIVE_E2E_MODE: 'send-acceptance',
    BREVO_WEBHOOK_URL_CONFIRMATION: webhookUrl,
    FAKTURASJEKK_BREVO_SYNTHETIC_E2E_APPROVED: BREVO_E2E_APPROVAL,
    FAKTURASJEKK_COST_MODE: 'funded',
    FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved',
    BREVO_API_KEY: apiKey,
    BREVO_WEBHOOK_SECRET: webhookSecret,
    BREVO_SYNTHETIC_RECIPIENT_EMAIL: 'realperson@example.test'
  },
  fetchImpl: async (_url, options) => options.method === 'GET'
    ? new Response(JSON.stringify(webhookPayload()), { status: 200 })
    : new Response(JSON.stringify({ messageId: '<must-not-send@relay>' }), { status: 201 })
}), /synthetic or test/i, 'recipient name must be unmistakably synthetic');

// Repository target is deliberately incomplete today and must fail before any network or credential use.
{
  const repositoryTarget = JSON.parse(fs.readFileSync(new URL('../config/brevo-delivery-target.json', import.meta.url), 'utf8'));
  assert.equal(repositoryTarget.webhook_url, null);
  assert.equal(repositoryTarget.sender_email, null);
  assert.equal(repositoryTarget.sender_domain, null);
  assert.equal(repositoryTarget.synthetic_send_enabled, false);
  let networkCalls = 0;
  await assert.rejects(() => runBrevoLiveVerification({
    target: repositoryTarget,
    env: {
      BREVO_LIVE_E2E_MODE: 'config-only',
      BREVO_WEBHOOK_URL_CONFIRMATION: webhookUrl,
      FAKTURASJEKK_BREVO_SYNTHETIC_E2E_APPROVED: BREVO_E2E_APPROVAL,
      BREVO_API_KEY: apiKey,
      BREVO_WEBHOOK_SECRET: webhookSecret
    },
    fetchImpl: async () => { networkCalls += 1; throw new Error('must not reach network'); }
  }));
  assert.equal(networkCalls, 0, 'incomplete reviewed target must fail before provider network access');
}

console.log('OK Brevo live verifier is target-bound, secret-minimized, zero-cost-safe for config reads, funded-only for sends and never confuses acceptance with delivery');
