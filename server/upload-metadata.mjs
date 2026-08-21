const MIME_EXTENSIONS = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
});

function safeRole(role) {
  const normalized = String(role ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'document';
}

export function neutralServerDocumentName({ role, mime_type, index = 0 } = {}) {
  const extension = MIME_EXTENSIONS[String(mime_type ?? '').toLowerCase()] ?? 'bin';
  const ordinal = Number.isInteger(index) && index >= 0 ? index + 1 : 1;
  return `${safeRole(role)}-${ordinal}.${extension}`;
}

export const TRUST_CLIENT_FILENAME = false;
