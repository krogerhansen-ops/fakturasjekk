const encoder = new TextEncoder();

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
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

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Base64(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return bytesToBase64(new Uint8Array(digest));
}

async function hmacSha256Base64(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return bytesToBase64(new Uint8Array(signature));
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

async function deterministicKey(prefix, value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const hex = [...new Uint8Array(digest)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
}

function paymentReference(caseId) {
  const case_id = requireString(caseId, 'case_id');
  const reference = `fsk-${case_id}`;
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(reference)) throw new Error('Case id cannot be represented as a valid Vipps payment reference.');
  return reference;
}

function caseIdFromReference(reference) {
  if (typeof reference !== 'string' || !reference.startsWith('fsk-')) throw new Error('Vipps payment reference is not a Fakturasjekk reference.');
  const caseId = reference.slice(4);
  if (!caseId) throw new Error('Vipps payment reference is missing case id.');
  return caseId;
}

function apiOrigin(environment) {
  if (environment === 'production') return 'https://api.vipps.no';
  if (environment === 'test') return 'https://apitest.vipps.no';
  throw new Error('Vipps environment must be test or production.');
}

export function createVippsAccessTokenProvider({
  clientId,
  clientSecret,
  subscriptionKey,
  merchantSerialNumber,
  environment = 'test',
  fetchImpl = globalThis.fetch,
  systemName = 'Fakturasjekk',
  systemVersion = '1',
  clock = () => new Date(),
  timeoutMs = 8000
} = {}) {
  const client_id = requireString(clientId, 'Vipps client_id');
  const client_secret = requireString(clientSecret, 'Vipps client_secret');
  const subscription_key = requireString(subscriptionKey, 'Vipps subscription key');
  const msn = requireString(merchantSerialNumber, 'Vipps merchant serial number');
  const origin = apiOrigin(environment);
  if (typeof fetchImpl !== 'function') throw new Error('Vipps access-token provider requires fetch.');
  let cached = null;

  async function getAccessToken() {
    const now = clock().getTime();
    if (cached && cached.expires_at_ms - now > 60_000) return cached.token;
    const response = await fetchImpl(`${origin}/accesstoken/get`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        client_id,
        client_secret,
        'ocp-apim-subscription-key': subscription_key,
        'merchant-serial-number': msn,
        'vipps-system-name': systemName,
        'vipps-system-version': systemVersion
      },
      body: '',
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      cache: 'no-store'
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Vipps access-token endpoint returned invalid JSON.'); }
    if (!response.ok) throw new Error(`Vipps access-token request failed: HTTP ${response.status}`);
    const token = requireString(payload.access_token, 'Vipps access token');
    const expiresIn = Number(payload.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('Vipps access token has invalid expiry.');
    cached = { token, expires_at_ms: now + expiresIn * 1000 };
    return token;
  }

  return { getAccessToken, environment, merchant_serial_number: msn };
}

export function createVippsEpaymentProvider({
  accessTokenProvider,
  subscriptionKey,
  merchantSerialNumber,
  webhookSecret,
  webhookHost,
  webhookPathAndQuery = '/v1/webhooks/payment/vipps',
  environment = 'test',
  fetchImpl = globalThis.fetch,
  systemName = 'Fakturasjekk',
  systemVersion = '1',
  timeoutMs = 10000
} = {}) {
  if (!accessTokenProvider?.getAccessToken) throw new Error('Vipps ePayment requires accessTokenProvider.getAccessToken.');
  const subscription_key = requireString(subscriptionKey, 'Vipps subscription key');
  const msn = requireString(merchantSerialNumber, 'Vipps merchant serial number');
  const webhook_secret = requireString(webhookSecret, 'Vipps webhook secret');
  const webhook_host = requireString(webhookHost, 'Vipps webhook host').toLowerCase();
  const webhook_path = requireString(webhookPathAndQuery, 'Vipps webhook path and query');
  if (!webhook_path.startsWith('/')) throw new Error('Vipps webhook path must start with /.');
  const origin = apiOrigin(environment);
  if (typeof fetchImpl !== 'function') throw new Error('Vipps ePayment provider requires fetch.');

  async function apiRequest(path, { method = 'GET', body = undefined, idempotencyKey = null } = {}) {
    const token = requireString(await accessTokenProvider.getAccessToken(), 'Vipps access token');
    const headers = {
      authorization: `Bearer ${token}`,
      'ocp-apim-subscription-key': subscription_key,
      'merchant-serial-number': msn,
      'vipps-system-name': systemName,
      'vipps-system-version': systemVersion,
      accept: 'application/json'
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await fetchImpl(`${origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      cache: 'no-store'
    });
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { throw new Error('Vipps ePayment returned invalid JSON.'); }
    }
    if (!response.ok) {
      const error = new Error(`Vipps ePayment request failed: HTTP ${response.status}`);
      error.status = response.status;
      error.provider_payload = payload;
      throw error;
    }
    return payload ?? {};
  }

  async function createPayment({ case_id, amount_minor, currency, description, return_url }) {
    if (Number(amount_minor) !== 2900 || currency !== 'NOK') throw new Error('Vipps payment must be exactly 2900 NOK minor units.');
    const returnUrl = requireString(return_url, 'Vipps return URL');
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:') throw new Error('Vipps return URL must use HTTPS.');
    const reference = paymentReference(case_id);
    const idempotencyKey = await deterministicKey('fsk-create', reference);
    const result = await apiRequest('/epayment/v1/payments', {
      method: 'POST',
      idempotencyKey,
      body: {
        amount: { currency: 'NOK', value: 2900 },
        paymentMethod: { type: 'WALLET' },
        reference,
        userFlow: 'WEB_REDIRECT',
        returnUrl,
        paymentDescription: String(description ?? 'Fakturasjekk').slice(0, 100)
      }
    });
    const checkout = requireString(result.redirectUrl, 'Vipps redirectUrl');
    if (!/^https:\/\//i.test(checkout)) throw new Error('Vipps redirectUrl must use HTTPS.');
    return { provider_reference: reference, checkout_url: checkout, expires_at: result.expiresAt ?? null };
  }

  async function capturePayment({ case_id, amount_minor = 2900, currency = 'NOK' }) {
    if (Number(amount_minor) !== 2900 || currency !== 'NOK') throw new Error('Vipps capture must be exactly 2900 NOK minor units.');
    const reference = paymentReference(case_id);
    const idempotencyKey = await deterministicKey('fsk-capture', reference);
    const result = await apiRequest(`/epayment/v1/payments/${encodeURIComponent(reference)}/capture`, {
      method: 'POST',
      idempotencyKey,
      body: { modificationAmount: { currency: 'NOK', value: 2900 } }
    });
    const captured = result?.aggregate?.capturedAmount;
    if (Number(captured?.value) !== 2900 || captured?.currency !== 'NOK') {
      throw new Error('Vipps capture response did not confirm full 29 NOK capture.');
    }
    return { captured: true, reference, amount_minor: 2900, currency: 'NOK', psp_reference: result.pspReference ?? null };
  }

  async function getPayment({ case_id }) {
    const reference = paymentReference(case_id);
    const result = await apiRequest(`/epayment/v1/payments/${encodeURIComponent(reference)}`);
    return { reference, payment: result };
  }

  async function verifyWebhook({ headers, raw_body }) {
    const normalized = lowerHeaders(headers);
    const body = typeof raw_body === 'string' ? raw_body : '';
    const date = normalized['x-ms-date'];
    const host = normalized.host;
    const contentHash = normalized['x-ms-content-sha256'];
    const authorization = normalized.authorization;
    if (!date || !host || !contentHash || !authorization) return { signature_valid: false };
    if (host.toLowerCase() !== webhook_host) return { signature_valid: false };

    const calculatedHash = await sha256Base64(body);
    if (!constantTimeEqual(calculatedHash, contentHash)) return { signature_valid: false };
    const signedString = `POST\n${webhook_path}\n${date};${host};${contentHash}`;
    const signature = await hmacSha256Base64(webhook_secret, signedString);
    const expectedAuthorization = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`;
    if (!constantTimeEqual(expectedAuthorization, authorization)) return { signature_valid: false };

    let event;
    try { event = JSON.parse(body); } catch { return { signature_valid: false }; }
    if (String(event?.msn ?? '') !== msn) return { signature_valid: false };
    const eventName = String(event?.name ?? '').toUpperCase();
    const allowedEvents = new Set(['CREATED', 'AUTHORIZED', 'CAPTURED', 'CANCELLED', 'REFUNDED', 'ABORTED', 'EXPIRED', 'TERMINATED']);
    if (!allowedEvents.has(eventName)) throw new Error('Unsupported Vipps payment event.');
    const case_id = caseIdFromReference(event.reference);
    const pspReference = requireString(event.pspReference, 'Vipps pspReference');
    const success = event.success === true;
    const amount = Number(event?.amount?.value);
    const currency = event?.amount?.currency;
    const status = eventName === 'CAPTURED' && success ? 'paid' : (eventName === 'AUTHORIZED' && success ? 'authorized' : eventName.toLowerCase());

    return {
      signature_valid: true,
      case_id,
      payment_reference: event.reference,
      provider_reference: pspReference,
      amount_minor: Number.isFinite(amount) ? amount : null,
      currency,
      status,
      event_name: eventName,
      operation_success: success,
      paid_at: status === 'paid' ? event.timestamp ?? null : null
    };
  }

  return {
    name: 'vipps',
    createPayment,
    capturePayment,
    getPayment,
    verifyWebhook,
    environment,
    merchant_serial_number: msn,
    webhook_path_and_query: webhook_path
  };
}

export const vippsReferenceForCase = paymentReference;
