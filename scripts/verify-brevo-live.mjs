import fs from 'node:fs';
import { createBrevoOrderConfirmationDelivery } from '../server/brevo-order-confirmation-delivery.mjs';

export const BREVO_E2E_APPROVAL = 'I_APPROVE_SYNTHETIC_BREVO_NETWORK_CALLS';
const BREVO_TARGET_PATH = new URL('../config/brevo-delivery-target.json', import.meta.url);
const BREVO_WEBHOOKS_URL = 'https://api.brevo.com/v3/webhooks?type=transactional&sort=desc';
const ALLOWED_MODES = new Set(['config-only', 'send-acceptance']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYNTHETIC_OWNER_ID = '11111111-1111-4111-8111-111111111111';
const SYNTHETIC_CASE_ID = 'case-synthetic-brevo-e2e';
const SYNTHETIC_CONFIRMATION_ID = 'confirmation-synthetic-brevo-e2e';

function required(value, name, max = 1000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${name} is too long.`);
  return text;
}

function normalizedEmail(value, name) {
  const text = required(value, name, 320).toLowerCase();
  if (!EMAIL_RE.test(text)) throw new Error(`${name} must be a valid email address.`);
  return text;
}

function canonicalWebhookUrl(value) {
  const raw = required(value, 'Brevo webhook URL', 1000);
  let url;
  try { url = new URL(raw); } catch { throw new Error('Brevo webhook URL must be valid.'); }
  if (url.protocol !== 'https:') throw new Error('Brevo webhook URL must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Brevo webhook URL must not contain credentials, query parameters or fragments.');
  const host = url.hostname.toLowerCase();
  if (host !== 'fakturasjekk.no' && !host.endsWith('.fakturasjekk.no')) {
    throw new Error('Brevo webhook URL must remain on a Fakturasjekk-controlled hostname.');
  }
  if (url.pathname.replace(/\/+$/, '') !== '/v1/webhooks/order-confirmation/brevo') {
    throw new Error('Brevo webhook URL must target the canonical order-confirmation delivery route.');
  }
  return `${url.origin}/v1/webhooks/order-confirmation/brevo`;
}

function reviewedPrivacySettings(target) {
  if (Number(target.transactional_log_retention_months) !== 1) {
    throw new Error('Brevo transactional log retention must be manually verified at exactly 1 month before live verification.');
  }
  if (target.email_previews_enabled !== false) {
    throw new Error('Brevo stored transactional email previews must be disabled before live verification.');
  }
  const verifiedAt = required(target.privacy_settings_verified_at, 'Brevo privacy settings verification timestamp', 100);
  const timestamp = Date.parse(verifiedAt);
  if (!Number.isFinite(timestamp)) throw new Error('Brevo privacy settings verification timestamp must be a valid date-time.');
  if (timestamp > Date.now() + 5 * 60 * 1000) throw new Error('Brevo privacy settings verification timestamp cannot be in the future.');
  return new Date(timestamp).toISOString();
}

export function validateBrevoLiveTarget(target, confirmedWebhookUrl = null) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('Brevo delivery target config is required.');
  if (target.provider !== 'brevo') throw new Error('Brevo delivery target must use provider brevo.');
  if (target.transactional_only !== true) throw new Error('Brevo delivery target must remain transactional-only.');
  if (target.customer_data_live_enabled !== false) throw new Error('Synthetic Brevo verification requires customer-data live processing to remain disabled.');
  if (target.webhook_batched !== false) throw new Error('Brevo order-confirmation webhook must remain non-batched.');
  const privacySettingsVerifiedAt = reviewedPrivacySettings(target);
  const webhookUrl = canonicalWebhookUrl(target.webhook_url);
  if (confirmedWebhookUrl != null && canonicalWebhookUrl(confirmedWebhookUrl) !== webhookUrl) {
    throw new Error('Manual Brevo webhook URL confirmation does not match the reviewed target.');
  }
  const senderEmail = normalizedEmail(target.sender_email, 'Brevo sender email');
  const senderDomain = required(target.sender_domain, 'Brevo sender domain', 253).toLowerCase();
  if (senderEmail.split('@')[1] !== senderDomain) throw new Error('Brevo sender email must belong to the reviewed sender domain.');
  const headerName = required(target.webhook_header_name, 'Brevo webhook secret header name', 100).toLowerCase();
  if (headerName !== 'x-fakturasjekk-brevo-secret') throw new Error('Brevo webhook must use the dedicated Fakturasjekk secret header name.');
  const events = Array.isArray(target.required_events) ? target.required_events.map(String) : [];
  const requiredEvents = ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred'];
  for (const event of requiredEvents) {
    if (!events.includes(event)) throw new Error(`Brevo target is missing required transactional event ${event}.`);
  }
  return {
    ...target,
    webhook_url: webhookUrl,
    sender_email: senderEmail,
    sender_domain: senderDomain,
    webhook_header_name: headerName,
    required_events: requiredEvents,
    transactional_log_retention_months: 1,
    email_previews_enabled: false,
    privacy_settings_verified_at: privacySettingsVerifiedAt
  };
}

export function assertSyntheticBrevoNetworkApproval({ mode, approval, costMode, paidServicesApproved, syntheticSendEnabled } = {}) {
  if (!ALLOWED_MODES.has(mode)) throw new Error('Synthetic Brevo verification mode is invalid.');
  if (approval !== BREVO_E2E_APPROVAL) throw new Error('Synthetic Brevo verification requires the exact network-call approval phrase.');
  if (mode === 'send-acceptance') {
    if (syntheticSendEnabled !== true) throw new Error('Synthetic Brevo email sending is disabled in the reviewed target.');
    if (costMode !== 'funded') throw new Error('Synthetic Brevo send verification is blocked while Fakturasjekk cost mode is zero.');
    if (paidServicesApproved !== 'approved') throw new Error('Synthetic Brevo send verification requires explicit paid-services approval.');
  }
  return true;
}

function normalizedHeaderList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({ key: String(item.key ?? '').trim().toLowerCase(), value: String(item.value ?? '') }));
}

export function verifyBrevoWebhookConfiguration({ payload, target, webhookSecret } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.webhooks)) {
    throw new Error('Brevo webhook list returned an unexpected payload.');
  }
  const secret = required(webhookSecret, 'BREVO_WEBHOOK_SECRET', 200);
  if (secret.length < 32) throw new Error('BREVO_WEBHOOK_SECRET must be at least 32 characters.');
  const matches = payload.webhooks.filter(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    try { return canonicalWebhookUrl(item.url) === target.webhook_url; } catch { return false; }
  });
  if (matches.length !== 1) throw new Error('Brevo must contain exactly one transactional webhook for the reviewed Fakturasjekk receipt URL.');
  const webhook = matches[0];
  if (webhook.type !== 'transactional') throw new Error('Brevo receipt webhook must be transactional.');
  if (webhook.batched !== false) throw new Error('Brevo receipt webhook must not batch delivery events.');
  const events = new Set(Array.isArray(webhook.events) ? webhook.events.map(String) : []);
  for (const event of target.required_events) {
    if (!events.has(event)) throw new Error(`Brevo live webhook is missing required event ${event}.`);
  }
  const headers = normalizedHeaderList(webhook.headers);
  const matchingHeaders = headers.filter(item => item.key === target.webhook_header_name);
  if (matchingHeaders.length !== 1 || matchingHeaders[0].value !== secret) {
    throw new Error('Brevo live webhook does not contain the exact reviewed Fakturasjekk authentication header.');
  }
  return {
    webhook_configuration_verified: true,
    transactional_verified: true,
    non_batched_verified: true,
    authentication_header_verified: true,
    required_events_verified: true
  };
}

async function fetchBrevoWebhookConfiguration({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  const key = required(apiKey, 'BREVO_API_KEY', 500);
  if (!/^xkeysib-/i.test(key)) throw new Error('BREVO_API_KEY format is invalid.');
  if (typeof fetchImpl !== 'function') throw new Error('Brevo live verification requires fetch.');
  let response;
  try {
    response = await fetchImpl(BREVO_WEBHOOKS_URL, {
      method: 'GET',
      headers: { 'api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(`Brevo webhook configuration request failed: ${String(error?.message ?? 'network error').slice(0, 160)}`);
  }
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Brevo webhook configuration returned invalid JSON.'); }
  if (!response.ok) throw new Error(`Brevo webhook configuration request failed with HTTP ${response.status}.`);
  return payload;
}

function syntheticRecipient(value) {
  const email = normalizedEmail(value, 'BREVO_SYNTHETIC_RECIPIENT_EMAIL');
  const localPart = email.split('@')[0];
  if (!/(synthetic|test)/i.test(localPart)) {
    throw new Error('Synthetic Brevo recipient local-part must contain synthetic or test to reduce accidental customer use.');
  }
  return email;
}

export async function runBrevoLiveVerification({
  env = process.env,
  fetchImpl = globalThis.fetch,
  target = JSON.parse(fs.readFileSync(BREVO_TARGET_PATH, 'utf8'))
} = {}) {
  const mode = env.BREVO_LIVE_E2E_MODE ?? 'config-only';
  const reviewedTarget = validateBrevoLiveTarget(target, env.BREVO_WEBHOOK_URL_CONFIRMATION);
  assertSyntheticBrevoNetworkApproval({
    mode,
    approval: env.FAKTURASJEKK_BREVO_SYNTHETIC_E2E_APPROVED,
    costMode: env.FAKTURASJEKK_COST_MODE,
    paidServicesApproved: env.FAKTURASJEKK_PAID_SERVICES_APPROVED,
    syntheticSendEnabled: reviewedTarget.synthetic_send_enabled
  });

  // Credentials are read only after the version-controlled fail-closed target,
  // privacy account settings and manual network approval have all been validated.
  const apiKey = required(env.BREVO_API_KEY, 'BREVO_API_KEY', 500);
  const webhookSecret = required(env.BREVO_WEBHOOK_SECRET, 'BREVO_WEBHOOK_SECRET', 200);
  const webhookPayload = await fetchBrevoWebhookConfiguration({ apiKey, fetchImpl });
  const webhookResult = verifyBrevoWebhookConfiguration({ payload: webhookPayload, target: reviewedTarget, webhookSecret });

  let sendAccepted = false;
  if (mode === 'send-acceptance') {
    const recipient = syntheticRecipient(env.BREVO_SYNTHETIC_RECIPIENT_EMAIL);
    const adapter = createBrevoOrderConfirmationDelivery({
      apiKey,
      senderEmail: reviewedTarget.sender_email,
      senderName: 'Fakturasjekk',
      replyToEmail: reviewedTarget.sender_email,
      webhookSecret,
      fetchImpl
    });
    const sent = await adapter.deliverOrderConfirmation({
      case_id: SYNTHETIC_CASE_ID,
      owner_id: SYNTHETIC_OWNER_ID,
      confirmation_id: SYNTHETIC_CONFIRMATION_ID,
      recipient_email: recipient,
      idempotency_key: SYNTHETIC_CONFIRMATION_ID,
      subject: 'Fakturasjekk – syntetisk ordrebekreftelse 29 kr',
      text: 'SYNTHETISK TEST – ingen kundedata. Fakturasjekk ordrebekreftelse, 29,00 kr.',
      html: '<p><strong>SYNTHETISK TEST</strong> – ingen kundedata. Fakturasjekk ordrebekreftelse, 29,00 kr.</p>'
    });
    if (sent?.accepted !== true || sent?.delivered !== false || sent?.provider !== 'brevo') {
      throw new Error('Brevo synthetic send did not preserve provider-acceptance-versus-delivery separation.');
    }
    sendAccepted = true;
  }

  // Intentionally no message-id, email address, API key, webhook secret or webhook
  // payload is returned/logged. A send acceptance must never be reported as delivery.
  return {
    ok: true,
    synthetic_only: true,
    customer_data_live_enabled: false,
    mode,
    target_verified: true,
    privacy_account_settings_reviewed: true,
    ...webhookResult,
    synthetic_send_accepted: sendAccepted,
    durable_medium_delivered: false,
    delivery_webhook_e2e_verified: false
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBrevoLiveVerification()
    .then(result => console.log(`OK Brevo synthetic live verification: ${JSON.stringify(result)}`))
    .catch(error => {
      console.error(`FAIL Brevo synthetic live verification: ${error?.code ?? 'brevo_live_e2e_failed'}: ${error?.message ?? 'unknown error'}`);
      process.exitCode = 1;
    });
}
