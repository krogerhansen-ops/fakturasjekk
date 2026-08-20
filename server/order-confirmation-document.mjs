function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`Order confirmation document is missing ${field}.`);
    error.code = 'order_confirmation_document_incomplete';
    throw error;
  }
  return value.trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function optional(value, fallback = 'Ikke oppgitt') {
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function formatNok(amountMinor) {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount)) throw new Error('Order confirmation amount is invalid.');
  return `${(amount / 100).toFixed(2).replace('.', ',')} kr`;
}

function assertConfirmation(confirmation) {
  if (!confirmation || confirmation.document_type !== 'order_confirmation_and_payment_receipt') {
    const error = new Error('Valid order confirmation payload is required.');
    error.code = 'invalid_order_confirmation_payload';
    throw error;
  }
  requireString(confirmation.confirmation_id, 'confirmation_id');
  requireString(confirmation.issued_at, 'issued_at');
  requireString(confirmation.seller?.legal_name, 'seller.legal_name');
  requireString(confirmation.seller?.postal_address, 'seller.postal_address');
  requireString(confirmation.seller?.support_email, 'seller.support_email');
  requireString(confirmation.product?.name, 'product.name');
  requireString(confirmation.product?.currency, 'product.currency');
  requireString(confirmation.agreement?.terms_version, 'agreement.terms_version');
  requireString(confirmation.agreement?.privacy_notice_version, 'agreement.privacy_notice_version');
  requireString(confirmation.agreement?.withdrawal_information_version, 'agreement.withdrawal_information_version');
  requireString(confirmation.agreement?.accepted_at, 'agreement.accepted_at');
  requireString(confirmation.payment?.provider_reference, 'payment.provider_reference');
  if (Number(confirmation.product?.amount_minor) !== 2900 || confirmation.product?.currency !== 'NOK') {
    const error = new Error('Order confirmation document must represent the fixed 29 NOK product.');
    error.code = 'order_confirmation_document_amount_mismatch';
    throw error;
  }
  if (confirmation.payment?.status !== 'paid' || confirmation.payment?.verified_server_side !== true || Number(confirmation.payment?.amount_minor) !== 2900) {
    const error = new Error('Order confirmation document requires server-verified 29 NOK payment.');
    error.code = 'order_confirmation_document_payment_invalid';
    throw error;
  }
  if (
    confirmation.agreement?.payment_obligation_acknowledged !== true ||
    confirmation.agreement?.immediate_service_start_requested !== true ||
    confirmation.agreement?.withdrawal_loss_on_full_performance_acknowledged !== true
  ) {
    const error = new Error('Order confirmation document requires the validated checkout acknowledgements.');
    error.code = 'order_confirmation_document_consent_invalid';
    throw error;
  }
}

export function orderConfirmationText(confirmation) {
  assertConfirmation(confirmation);
  const copy = confirmation.customer_copy ?? {};
  return [
    'FAKTURASJEKK – ORDREBEKREFTELSE OG BETALINGSKVITTERING',
    '',
    `Bekreftelses-ID: ${confirmation.confirmation_id}`,
    `Utstedt: ${confirmation.issued_at}`,
    '',
    'SELGER',
    confirmation.seller.legal_name,
    `Organisasjonsnummer: ${optional(confirmation.seller.organization_number)}`,
    `Adresse: ${confirmation.seller.postal_address}`,
    `Kundeservice: ${confirmation.seller.support_email}`,
    `Personvern: ${optional(confirmation.seller.privacy_email)}`,
    '',
    'KJØP',
    `Produkt: ${confirmation.product.name}`,
    `Totalpris: ${formatNok(confirmation.product.amount_minor)} ${confirmation.product.currency}`,
    '',
    'BETALING',
    `Status: Betalt`,
    `Betalt: ${confirmation.payment.paid_at ?? confirmation.issued_at}`,
    `Betalingsleverandør: ${optional(confirmation.payment.provider)}`,
    `Betalingsreferanse: ${confirmation.payment.provider_reference}`,
    '',
    'AVTALE OG SAMTYKKER',
    `Avtale akseptert: ${confirmation.agreement.accepted_at}`,
    `Vilkår: ${confirmation.agreement.terms_version}`,
    `Personvernerklæring: ${confirmation.agreement.privacy_notice_version}`,
    `Informasjon om angrerett: ${confirmation.agreement.withdrawal_information_version}`,
    `Betalingsforpliktelse bekreftet: Ja`,
    `Umiddelbar oppstart uttrykkelig bedt om: Ja`,
    `Tap av angrerett ved full levering er uttrykkelig erkjent: Ja`,
    '',
    'KUNDEINFORMASJON',
    optional(copy.payment_obligation),
    optional(copy.immediate_start),
    optional(copy.withdrawal_loss),
    '',
    'Denne filen er generert fra den lagrede ordrebekreftelsen. Generering av filen markerer ikke i seg selv at den er levert på varig medium.'
  ].join('\n');
}

export function orderConfirmationHtml(confirmation) {
  assertConfirmation(confirmation);
  const copy = confirmation.customer_copy ?? {};
  const row = (label, value) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  const section = (title, rows) => `<section><h2>${escapeHtml(title)}</h2><table><tbody>${rows.join('')}</tbody></table></section>`;
  return `<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ordrebekreftelse ${escapeHtml(confirmation.confirmation_id)}</title>
<style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}h1{font-size:1.7rem}h2{font-size:1.15rem;margin-top:2rem}table{width:100%;border-collapse:collapse}th,td{padding:.45rem 0;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{width:38%;font-weight:600}.notice{margin-top:2rem;padding:1rem;border:1px solid #bbb;border-radius:.5rem}p{white-space:pre-wrap}@media print{body{margin:0;max-width:none}.notice{break-inside:avoid}}</style>
</head>
<body>
<h1>Ordrebekreftelse og betalingskvittering</h1>
<p>Bekreftelses-ID: ${escapeHtml(confirmation.confirmation_id)}<br>Utstedt: ${escapeHtml(confirmation.issued_at)}</p>
${section('Selger', [
  row('Navn', confirmation.seller.legal_name),
  row('Organisasjonsnummer', optional(confirmation.seller.organization_number)),
  row('Adresse', confirmation.seller.postal_address),
  row('Kundeservice', confirmation.seller.support_email),
  row('Personvern', optional(confirmation.seller.privacy_email))
])}
${section('Kjøp', [
  row('Produkt', confirmation.product.name),
  row('Totalpris', `${formatNok(confirmation.product.amount_minor)} ${confirmation.product.currency}`)
])}
${section('Betaling', [
  row('Status', 'Betalt'),
  row('Betalt', confirmation.payment.paid_at ?? confirmation.issued_at),
  row('Betalingsleverandør', optional(confirmation.payment.provider)),
  row('Betalingsreferanse', confirmation.payment.provider_reference)
])}
${section('Avtale og samtykker', [
  row('Avtale akseptert', confirmation.agreement.accepted_at),
  row('Vilkår', confirmation.agreement.terms_version),
  row('Personvernerklæring', confirmation.agreement.privacy_notice_version),
  row('Informasjon om angrerett', confirmation.agreement.withdrawal_information_version),
  row('Betalingsforpliktelse bekreftet', 'Ja'),
  row('Umiddelbar oppstart uttrykkelig bedt om', 'Ja'),
  row('Tap av angrerett ved full levering uttrykkelig erkjent', 'Ja')
])}
<section class="notice"><h2>Kundeinformasjon</h2><p>${escapeHtml(optional(copy.payment_obligation))}</p><p>${escapeHtml(optional(copy.immediate_start))}</p><p>${escapeHtml(optional(copy.withdrawal_loss))}</p></section>
<p class="notice">Denne filen er generert fra den lagrede ordrebekreftelsen. Generering av filen markerer ikke i seg selv at den er levert på varig medium.</p>
</body>
</html>`;
}

export function buildDownloadableOrderConfirmation(confirmation, { format = 'html' } = {}) {
  assertConfirmation(confirmation);
  const safeId = confirmation.confirmation_id.replace(/[^a-zA-Z0-9_-]+/g, '-');
  if (format === 'html') {
    const body = orderConfirmationHtml(confirmation);
    return {
      format: 'html',
      filename: `fakturasjekk-ordrebekreftelse-${safeId}.html`,
      content_type: 'text/html; charset=utf-8',
      content_disposition: `attachment; filename="fakturasjekk-ordrebekreftelse-${safeId}.html"`,
      body,
      durable_medium_delivered: false
    };
  }
  if (format === 'text') {
    const body = orderConfirmationText(confirmation);
    return {
      format: 'text',
      filename: `fakturasjekk-ordrebekreftelse-${safeId}.txt`,
      content_type: 'text/plain; charset=utf-8',
      content_disposition: `attachment; filename="fakturasjekk-ordrebekreftelse-${safeId}.txt"`,
      body,
      durable_medium_delivered: false
    };
  }
  const error = new Error('Unsupported order confirmation document format.');
  error.code = 'order_confirmation_document_format_invalid';
  throw error;
}
