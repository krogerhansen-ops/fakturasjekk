const ALLOWED = Object.freeze({
  html: { content_type: 'text/html; charset=utf-8', extension: 'html' },
  text: { content_type: 'text/plain; charset=utf-8', extension: 'txt' }
});
const MAX_RECEIPT_BYTES = 512 * 1024;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validateOrderConfirmationDownload(payload, { maxBytes = MAX_RECEIPT_BYTES } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.document || typeof payload.document !== 'object') {
    fail('invalid_order_confirmation_download', 'Ugyldig ordrebekreftelse fra serveren.');
  }
  const doc = payload.document;
  const allowed = ALLOWED[doc.format];
  if (!allowed) fail('invalid_order_confirmation_format', 'Ugyldig dokumentformat fra serveren.');
  if (doc.content_type !== allowed.content_type) fail('invalid_order_confirmation_content_type', 'Uventet dokumenttype fra serveren.');
  if (doc.durable_medium_delivered !== false) {
    fail('invalid_order_confirmation_delivery_state', 'Nedlastingspayloadet kan ikke brukes som leveringsbevis.');
  }
  if (typeof doc.body !== 'string' || !doc.body) fail('invalid_order_confirmation_body', 'Ordrebekreftelsen mangler innhold.');
  if (typeof doc.filename !== 'string' || !doc.filename) fail('invalid_order_confirmation_filename', 'Ordrebekreftelsen mangler filnavn.');
  const filenamePattern = new RegExp(`^fakturasjekk-ordrebekreftelse-[A-Za-z0-9_-]+\\.${allowed.extension}$`);
  if (!filenamePattern.test(doc.filename)) fail('invalid_order_confirmation_filename', 'Ugyldig filnavn fra serveren.');
  if (doc.filename.includes('/') || doc.filename.includes('\\') || doc.filename.includes('..')) {
    fail('invalid_order_confirmation_filename', 'Utrygt filnavn fra serveren.');
  }
  const byteLength = typeof TextEncoder === 'function' ? new TextEncoder().encode(doc.body).byteLength : doc.body.length;
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || byteLength > maxBytes) {
    fail('order_confirmation_download_too_large', 'Ordrebekreftelsen er større enn tillatt nedlastingsgrense.');
  }
  return Object.freeze({
    format: doc.format,
    filename: doc.filename,
    content_type: doc.content_type,
    body: doc.body,
    byte_length: byteLength,
    durable_medium_delivered: false
  });
}

export async function saveOrderConfirmation({
  apiClient,
  caseId,
  format = 'html',
  documentImpl = globalThis.document,
  urlImpl = globalThis.URL,
  BlobImpl = globalThis.Blob,
  schedule = globalThis.setTimeout
} = {}) {
  if (!apiClient?.getOrderConfirmation) throw new Error('API client with getOrderConfirmation is required.');
  if (typeof caseId !== 'string' || !caseId) throw new Error('caseId is required.');
  if (!ALLOWED[format]) fail('invalid_order_confirmation_format', 'Format må være html eller text.');
  if (!documentImpl?.createElement || !documentImpl?.body?.appendChild) throw new Error('Browser document API is required.');
  if (!urlImpl?.createObjectURL || !urlImpl?.revokeObjectURL) throw new Error('Browser URL API is required.');
  if (typeof BlobImpl !== 'function') throw new Error('Browser Blob API is required.');
  if (typeof schedule !== 'function') throw new Error('Browser scheduler is required.');

  const payload = await apiClient.getOrderConfirmation(caseId, format);
  const doc = validateOrderConfirmationDownload(payload);
  const blob = new BlobImpl([doc.body], { type: doc.content_type });
  if (Number(blob.size) !== doc.byte_length) fail('order_confirmation_blob_size_mismatch', 'Nedlastingsfilen samsvarer ikke med validert innhold.');

  const objectUrl = urlImpl.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = objectUrl;
  anchor.download = doc.filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  documentImpl.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove?.();
    schedule(() => urlImpl.revokeObjectURL(objectUrl), 0);
  }

  return {
    filename: doc.filename,
    content_type: doc.content_type,
    byte_length: doc.byte_length,
    durable_medium_delivered: false
  };
}

export const ORDER_CONFIRMATION_DOWNLOAD_MAX_BYTES = MAX_RECEIPT_BYTES;
