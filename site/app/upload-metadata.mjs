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

export function neutralUploadName({ role, mime_type, index = 0 } = {}) {
  const extension = MIME_EXTENSIONS[String(mime_type ?? '').toLowerCase()] ?? 'bin';
  const ordinal = Number.isInteger(index) && index >= 0 ? index + 1 : 1;
  return `${safeRole(role)}-${ordinal}.${extension}`;
}

export function privacySafeFileDescriptor(file, role, index = 0) {
  const mime_type = String(file?.type ?? '');
  const size = Number(file?.size ?? 0);
  return {
    name: neutralUploadName({ role, mime_type, index }),
    mime_type,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    role
  };
}

export const ORIGINAL_FILENAME_TRANSMISSION_ALLOWED = false;
