const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMINAL_FAILURES = new Set(['hard_bounce', 'blocked', 'spam', 'invalid_email', 'error']);
const RETRYABLE_FAILURES = new Set(['soft_bounce', 'deferred']);
const encoder = new TextEncoder();

function required(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${name} is too long.`);
  return text;
}

function email(value, name) {
  const normalized = required(value, name, 320).toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error(`${name} must be a valid email address.`);
  return normalized;
}

function safeId(value, name) {
  const text = required(value, name, 120);
  if (!SAFE_ID_RE.test(text)) throw new Error(`${name} contains unsafe characters.`);
  return text;
}

function ownerId(value) {
  const text = required(value, 'owner_id', 64);
  if (!UUID_RE.test(text)) throw new Error('owner_id must be a UUID.');
  return text.toLowerCase();
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function deterministicUuid(value) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function metadataHeader({ case_id, owner_id, confirmation_id }) {
  return `fskv1|${safeId(case_id, 'case_id')}|${ownerId(owner_id)}|${safeId(confirmation_id, 'confirmation_id')}`;
}

function parseMetadata(value) {
  const parts = required(value, 'Brevo Fakturasjekk metadata', 400).split('|');
  if (parts.length !== 4 || parts[0] !== 'fskv1') throw new Error('Brevo webhook metadata is invalid.');
  return {
    case_id: safeId(parts[1], 'case_id'),
    owner_id: ownerId(parts[2]),
    confirmation_id: safeId(parts[3], 'confirmation_id')
  };
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  const max = Math.max(aa.length, bb.length);
  for (let i = 0; i < max; i += 1) diff |= (aa[i % Math.max(aa.length, 1)] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
  return diff === 0;
}

function lowerHeaders(headers = {}) {
  const out = {};
  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) out[key.toLowerCase()] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers ?? {})) out[String(key).toLowerCase()] = String(value);
  return out;
}

function normalizeEventName(value) {
  const compact = String(value ?? '').trim().toLowerCase().replaceAll('-', '_');
  const aliases = {
    hardbounce: 'hard_bounce',
    hard_bounce: 'hard_bounce',
    softbounce: 'soft_bounce',
    soft_bounce: 'soft_bounce',
    invalidemail: 'invalid_email',
    invalid_email: 'invalid_email'
  };
  return aliases[compact] ?? compact;
}

export function createBrevoOrderConfirmationDelivery({
  apiKey,
  senderEmail,
  senderName = 'Fakturasjekk',
  replyToEmail = null,
  webhookSecret,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000
} = {}) {
  const key = required(apiKey, 'Brevo API key', 500);
  if (!/^xkeysib-/i.test(key)) throw new Error('Brevo API key format is invalid.');
  const sender = email(senderEmail, 'Brevo sender email');
  const replyTo = email(replyToEmail ?? senderEmail, 'Brevo reply-to email');
  const name = required(senderName, 'Brevo sender name', 70);
  const webhookSecretValue = required(webhookSecret, 'Brevo webhook secret', 200);
  if (webhookSecretValue.length < 32) throw new Error('Brevo webhook secret must be at least 32 characters.');
  if (typeof fetchImpl !== 'function') throw new Error('Brevo delivery adapter requires fetch.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('Brevo timeout must be 1–30 seconds.');

  async function deliverOrderConfirmation(input = {}) {
    const caseId = safeId(input.case_id, 'case_id');
    const owner = ownerId(input.owner_id);
    const confirmationId = safeId(input.confirmation_id, 'confirmation_id');
    const recipient = email(input.recipient_email, 'recipient_email');
    const subject = required(input.subject, 'email subject', 200);
    const text = required(input.text, 'email text', 200000);
    const html = required(input.html, 'email html', 500000);
    const stableKey = safeId(input.idempotency_key, 'idempotency_key');
    const idempotencyKey = await deterministicUuid(`fakturasjekk-order-confirmation:${stableKey}`);
    const customMetadata = metadataHeader({ case_id: caseId, owner_id: owner, confirmation_id: confirmationId });

    let response;
    try {
      response = await fetchImpl(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          'api-key': key,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          sender: { email: sender, name },
          to: [{ email: recipient, contactPixelTrackingConsent: false }],
          replyTo: { email: replyTo, name },
          subject,
          textContent: text,
          htmlContent: html,
          headers: {
            idempotencyKey,
            'X-Mailin-custom': customMetadata
          },
          tags: ['fakturasjekk-order-confirmation']
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      throw new Error(`Brevo order confirmation request failed: ${String(error?.message ?? 'network error').slice(0, 160)}`);
    }

    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Brevo order confirmation returned invalid JSON.'); }
    if (!response.ok) {
      const code = payload?.code ?? payload?.message ?? `HTTP ${response.status}`;
      throw new Error(`Brevo order confirmation failed: ${String(code).slice(0, 160)}`);
    }
    const messageId = required(payload?.messageId, 'Brevo messageId', 200);
    return {
      accepted: true,
      delivered: false,
      medium: 'email',
      provider: 'brevo',
      delivery_reference: messageId,
      idempotency_key: idempotencyKey
    };
  }

  function verifyWebhook({ headers, raw_body }) {
    const normalized = lowerHeaders(headers);
    if (!constantTimeEqual(normalized['x-fakturasjekk-brevo-secret'], webhookSecretValue)) {
      return { authenticated: false };
    }
    let event;
    try { event = JSON.parse(typeof raw_body === 'string' ? raw_body : ''); }
    catch { return { authenticated: false }; }
    if (!event || Array.isArray(event) || typeof event !== 'object') return { authenticated: false };
    const eventName = normalizeEventName(event.event);
    const messageId = typeof event['message-id'] === 'string' ? event['message-id'].trim() : '';
    const metadata = event['X-Mailin-custom'] ?? event['x-mailin-custom'] ?? null;
    if (!eventName || !messageId || !metadata) return { authenticated: false };
    let route;
    try { route = parseMetadata(metadata); } catch { return { authenticated: false }; }
    const timestamp = Number(event.ts_event ?? event.ts ?? NaN);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return { authenticated: false };
    return {
      authenticated: true,
      provider: 'brevo',
      event: eventName,
      delivered: eventName === 'delivered',
      terminal_failure: TERMINAL_FAILURES.has(eventName),
      retryable_failure: RETRYABLE_FAILURES.has(eventName),
      delivery_reference: messageId,
      occurred_at: new Date(timestamp * 1000).toISOString(),
      ...route
    };
  }

  return {
    name: 'brevo',
    deliverOrderConfirmation,
    verifyWebhook,
    sender_email: sender
  };
}

export const BREVO_ORDER_CONFIRMATION_POLICY = Object.freeze({
  endpoint: BREVO_SEND_URL,
  provider: 'brevo',
  tracking_consent: false,
  webhook_custom_secret_required: true,
  provider_acceptance_is_not_delivery: true
});
