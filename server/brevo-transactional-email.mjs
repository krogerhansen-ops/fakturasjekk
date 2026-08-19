const encoder = new TextEncoder();
const API_ORIGIN = 'https://api.brevo.com';
const SECONDARY_WEBHOOK_HEADER = 'x-fakturasjekk-brevo-secret';

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeMessageId(value) {
  return String(value ?? '').trim().replace(/^<|>$/g, '');
}

function headerValue(headers, name) {
  if (headers instanceof Headers) return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (String(key).toLowerCase() === target) return String(value);
  }
  return null;
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  const max = Math.max(aa.length, bb.length, 1);
  for (let i = 0; i < max; i += 1) diff |= (aa[i % Math.max(aa.length, 1)] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
  return diff === 0;
}

function customTrackingHeader(caseId, checkoutConsentId) {
  const encodedCase = encodeURIComponent(requireString(caseId, 'case id'));
  const encodedConsent = encodeURIComponent(requireString(checkoutConsentId, 'checkout consent id'));
  return `fsk_case=${encodedCase}&fsk_checkout=${encodedConsent}`;
}

function parseTrackingHeader(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  const params = new URLSearchParams(value);
  const case_id = params.get('fsk_case');
  const checkout_consent_id = params.get('fsk_checkout');
  if (!case_id || !checkout_consent_id) return null;
  return { case_id, checkout_consent_id };
}

function confirmationContent(payload) {
  if (!payload?.seller?.legal_name || !payload?.product?.name || payload?.product?.amount_nok !== 29) {
    throw new Error('Agreement confirmation payload is incomplete.');
  }
  const seller = payload.seller;
  const product = payload.product;
  const versions = payload.versions ?? {};
  const acknowledgements = payload.acknowledgements ?? {};
  const org = seller.organization_number ? `\nOrganisasjonsnummer: ${seller.organization_number}` : '';
  const withdrawalForm = [
    'Standard angreskjema',
    `Til: ${seller.legal_name}, ${seller.postal_address}, ${seller.support_email}`,
    'Jeg meddeler herved at jeg ønsker å gå fra min avtale om følgende tjeneste:',
    `${product.name}`,
    `Saksreferanse: ${payload.case_id}`,
    `Avtaledato: ${payload.created_at}`,
    'Forbrukerens navn: ____________________',
    'Forbrukerens adresse: ____________________',
    'Dato: ____________________',
    'Signatur (bare hvis skjemaet sendes på papir): ____________________'
  ];
  const text = [
    'Kjøpsbekreftelse – Fakturasjekk',
    '',
    `Selger: ${seller.legal_name}`,
    `Adresse: ${seller.postal_address}`,
    `Kontakt: ${seller.support_email}`,
    org.trim(),
    '',
    `Tjeneste: ${product.name}`,
    `Total pris: ${product.amount_nok} kr ${product.currency}`,
    `Saksreferanse: ${payload.case_id}`,
    `Avtaletidspunkt: ${payload.created_at}`,
    '',
    'Dine registrerte valg:',
    `- Betalingsplikt: ${acknowledgements.payment_obligation === true ? 'Ja' : 'Nei'}`,
    `- Uttrykkelig oppstart før angrefristen er utløpt: ${acknowledgements.immediate_service_start === true ? 'Ja' : 'Nei'}`,
    `- Erkjennelse av bortfall ved full levering: ${acknowledgements.withdrawal_loss_on_full_performance === true ? 'Ja' : 'Nei'}`,
    '',
    payload.immediate_start_request ?? '',
    payload.withdrawal_notice ?? '',
    payload.payment_obligation_notice ?? '',
    '',
    `Vilkårsversjon: ${versions.terms ?? ''}`,
    `Personvernversjon: ${versions.privacy_notice ?? ''}`,
    `Angrerettinformasjon: ${versions.withdrawal_information ?? ''}`,
    '',
    ...withdrawalForm,
    '',
    'Ta vare på denne e-posten. Den er kjøpsbekreftelsen for denne bestillingen.'
  ].filter(line => line !== '').join('\n');

  const html = `<!doctype html><html><body><main style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;line-height:1.5"><h1>Kjøpsbekreftelse – Fakturasjekk</h1><p><strong>Selger:</strong> ${escapeHtml(seller.legal_name)}<br><strong>Adresse:</strong> ${escapeHtml(seller.postal_address)}${seller.organization_number ? `<br><strong>Organisasjonsnummer:</strong> ${escapeHtml(seller.organization_number)}` : ''}<br><strong>Kontakt:</strong> ${escapeHtml(seller.support_email)}</p><hr><p><strong>Tjeneste:</strong> ${escapeHtml(product.name)}<br><strong>Total pris:</strong> 29 kr ${escapeHtml(product.currency)}<br><strong>Saksreferanse:</strong> ${escapeHtml(payload.case_id)}<br><strong>Avtaletidspunkt:</strong> ${escapeHtml(payload.created_at)}</p><h2>Dine registrerte valg</h2><ul><li>Betalingsplikt: Ja</li><li>Uttrykkelig oppstart før angrefristen er utløpt: Ja</li><li>Erkjennelse av bortfall ved full levering: Ja</li></ul><p>${escapeHtml(payload.immediate_start_request ?? '')}</p><p>${escapeHtml(payload.withdrawal_notice ?? '')}</p><p>${escapeHtml(payload.payment_obligation_notice ?? '')}</p><hr><p><strong>Vilkårsversjon:</strong> ${escapeHtml(versions.terms ?? '')}<br><strong>Personvernversjon:</strong> ${escapeHtml(versions.privacy_notice ?? '')}<br><strong>Angrerettinformasjon:</strong> ${escapeHtml(versions.withdrawal_information ?? '')}</p><h2>Standard angreskjema</h2><p>Til: ${escapeHtml(seller.legal_name)}, ${escapeHtml(seller.postal_address)}, ${escapeHtml(seller.support_email)}</p><p>Jeg meddeler herved at jeg ønsker å gå fra min avtale om følgende tjeneste: ${escapeHtml(product.name)}.</p><p>Saksreferanse: ${escapeHtml(payload.case_id)}<br>Avtaledato: ${escapeHtml(payload.created_at)}</p><p>Forbrukerens navn: ____________________<br>Forbrukerens adresse: ____________________<br>Dato: ____________________<br>Signatur (bare hvis skjemaet sendes på papir): ____________________</p><p><strong>Ta vare på denne e-posten.</strong> Den er kjøpsbekreftelsen for denne bestillingen.</p></main></body></html>`;
  return { text, html };
}

export function createBrevoTransactionalEmailProvider({
  apiKey,
  senderEmail,
  senderName = 'Fakturasjekk',
  replyToEmail = null,
  webhookBearerToken,
  webhookSecondarySecret,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000
} = {}) {
  const api_key = requireString(apiKey, 'Brevo API key');
  const sender_email = requireString(senderEmail, 'Brevo sender email').toLowerCase();
  if (!validEmail(sender_email)) throw new Error('Brevo sender email is invalid.');
  const sender_name = requireString(senderName, 'Brevo sender name');
  const reply_email = replyToEmail ? requireString(replyToEmail, 'Brevo reply-to email').toLowerCase() : sender_email;
  if (!validEmail(reply_email)) throw new Error('Brevo reply-to email is invalid.');
  const webhook_token = requireString(webhookBearerToken, 'Brevo webhook bearer token');
  const webhook_secondary = requireString(webhookSecondarySecret, 'Brevo webhook secondary secret');
  if (webhook_token.length < 24 || webhook_secondary.length < 24) throw new Error('Brevo webhook secrets must be at least 24 characters.');
  if (typeof fetchImpl !== 'function') throw new Error('Brevo provider requires fetch.');

  async function sendAgreementConfirmation({ case_id, checkout_consent_id, delivery_email, delivery_name = null, idempotency_key, agreement_confirmation_payload }) {
    if (!validEmail(delivery_email)) throw new Error('Agreement confirmation delivery email is invalid.');
    if (!validUuid(idempotency_key)) throw new Error('Agreement confirmation idempotency key must be a UUID.');
    const recipient = delivery_email.toLowerCase();
    const { text, html } = confirmationContent(agreement_confirmation_payload);
    const tracking = customTrackingHeader(case_id, checkout_consent_id);
    const body = {
      sender: { email: sender_email, name: sender_name },
      to: [{ email: recipient, contactPixelTrackingConsent: false, ...(delivery_name ? { name: String(delivery_name).slice(0, 120) } : {}) }],
      replyTo: { email: reply_email, name: sender_name },
      subject: 'Kjøpsbekreftelse – Fakturasjekk 29 kr',
      textContent: text,
      htmlContent: html,
      headers: {
        'Idempotency-Key': idempotency_key,
        'X-Mailin-custom': tracking
      },
      tags: ['fakturasjekk-confirmation']
    };

    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}/v3/smtp/email`, {
        method: 'POST',
        headers: {
          'api-key': api_key,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      const wrapped = new Error(`Brevo confirmation send failed: ${String(error?.message ?? 'network error')}`);
      wrapped.code = 'brevo_send_outcome_unknown';
      throw wrapped;
    }
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Brevo confirmation endpoint returned invalid JSON.'); }
    if (response.status !== 201) {
      const message = payload?.message ?? payload?.code ?? `HTTP ${response.status}`;
      const error = new Error(`Brevo confirmation send failed: ${String(message).slice(0, 200)}`);
      error.code = 'brevo_send_rejected';
      error.status = response.status;
      throw error;
    }
    const messageId = normalizeMessageId(payload.messageId ?? payload.messageIds?.[0]);
    if (!messageId) throw new Error('Brevo confirmation send returned no message id.');
    return {
      provider: 'brevo',
      message_id: messageId,
      recipient_email: recipient,
      idempotency_key,
      provider_accepted: true
    };
  }

  function verifyWebhook({ headers, raw_body }) {
    const auth = headerValue(headers, 'authorization');
    const secondary = headerValue(headers, SECONDARY_WEBHOOK_HEADER);
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return { authenticated: false };
    if (!constantTimeEqual(auth.slice(7), webhook_token)) return { authenticated: false };
    if (!constantTimeEqual(secondary, webhook_secondary)) return { authenticated: false };
    let event;
    try { event = JSON.parse(typeof raw_body === 'string' ? raw_body : ''); } catch { return { authenticated: false }; }
    const type = String(event?.event ?? '').trim();
    const allowed = new Set(['delivered', 'hard_bounce', 'hardBounce', 'blocked', 'invalid', 'error', 'soft_bounce', 'softBounce', 'deferred']);
    if (!allowed.has(type)) throw new Error('Unsupported Brevo transactional email event.');
    const tracking = parseTrackingHeader(event?.['X-Mailin-custom'] ?? event?.['x-mailin-custom'] ?? '');
    if (!tracking) throw new Error('Brevo webhook is missing Fakturasjekk tracking metadata.');
    const messageId = normalizeMessageId(event?.['message-id'] ?? event?.messageId);
    if (!messageId) throw new Error('Brevo webhook is missing message id.');
    const normalizedEvent = type === 'hardBounce' ? 'hard_bounce' : type === 'softBounce' ? 'soft_bounce' : type;
    return {
      authenticated: true,
      provider: 'brevo',
      event: normalizedEvent,
      message_id: messageId,
      case_id: tracking.case_id,
      checkout_consent_id: tracking.checkout_consent_id,
      provider_event_at: Number.isFinite(Number(event?.ts_event)) ? new Date(Number(event.ts_event) * 1000).toISOString() : null
    };
  }

  return { name: 'brevo', sendAgreementConfirmation, verifyWebhook, secondary_webhook_header: SECONDARY_WEBHOOK_HEADER };
}

export const BREVO_API_ORIGIN = API_ORIGIN;
export const BREVO_SECONDARY_WEBHOOK_HEADER = SECONDARY_WEBHOOK_HEADER;
