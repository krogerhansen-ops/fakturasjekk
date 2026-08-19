const DEFAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;
const DEFAULT_SCAN_TIMEOUT_MS = 30000;
const DEFAULT_ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function isPrefix(bytes, signature, offset = 0) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiAt(bytes, text, offset = 0) {
  return isPrefix(bytes, [...text].map(char => char.charCodeAt(0)), offset);
}

export function detectDocumentMime(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) return null;
  if (asciiAt(bytes, '%PDF-', 0)) return 'application/pdf';
  if (isPrefix(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (isPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (asciiAt(bytes, 'RIFF', 0) && asciiAt(bytes, 'WEBP', 8)) return 'image/webp';
  return null;
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Malware scanner timed out.')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createDocumentSecurityScanner({
  objectReader,
  malwareScanner,
  max_file_bytes = DEFAULT_MAX_FILE_BYTES,
  allowed_mime_types = DEFAULT_ALLOWED_MIME_TYPES,
  scan_timeout_ms = DEFAULT_SCAN_TIMEOUT_MS
} = {}) {
  if (!objectReader?.getObjectBytes) throw new Error('Document security scanner requires a private object byte reader.');
  if (!malwareScanner?.scanBytes) throw new Error('Document security scanner requires an explicit malware scanner.');

  const maxBytes = Number(max_file_bytes);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > DEFAULT_MAX_FILE_BYTES) {
    throw new Error('Document security scanner max_file_bytes must be between 1 byte and 15 MiB.');
  }
  const timeoutMs = Number(scan_timeout_ms);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('Document security scanner timeout must be between 1 and 120 seconds.');
  }
  const allowed = new Set(allowed_mime_types);
  if (!allowed.size || [...allowed].some(value => !DEFAULT_ALLOWED_MIME_TYPES.includes(value))) {
    throw new Error('Document security scanner MIME allowlist contains unsupported values.');
  }

  return {
    async scanObject({ bucket, key, declared_mime_type = null } = {}) {
      const object = await objectReader.getObjectBytes({ bucket, key, max_bytes: maxBytes });
      const bytes = object?.bytes;
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('Private object reader returned no document bytes.');
      if (bytes.byteLength > maxBytes) throw new Error('Document exceeds security scanner byte limit.');

      const detectedMime = detectDocumentMime(bytes);
      if (!detectedMime || !allowed.has(detectedMime)) {
        return {
          malware_safe: false,
          magic_bytes_verified: false,
          detected_mime_type: detectedMime,
          declared_mime_type: declared_mime_type || null,
          sha256: await sha256Hex(bytes),
          scanner_status: 'rejected_unknown_or_disallowed_type'
        };
      }

      const sha256 = await sha256Hex(bytes);
      let verdict;
      try {
        verdict = await withTimeout(Promise.resolve(malwareScanner.scanBytes({
          bytes,
          sha256,
          detected_mime_type: detectedMime,
          declared_mime_type: declared_mime_type || null
        })), timeoutMs);
      } catch (error) {
        throw new Error(`Malware scan unavailable: ${String(error?.message || 'unknown error').slice(0, 180)}`);
      }

      if (verdict?.safe !== true) {
        return {
          malware_safe: false,
          magic_bytes_verified: true,
          detected_mime_type: detectedMime,
          declared_mime_type: declared_mime_type || null,
          sha256,
          scanner_status: verdict?.status || 'rejected_by_malware_scanner',
          malware_engine: typeof verdict?.engine === 'string' ? verdict.engine.slice(0, 80) : null
        };
      }

      if (typeof verdict.engine !== 'string' || !verdict.engine.trim()) {
        throw new Error('Malware scanner returned safe without identifying its engine.');
      }

      return {
        malware_safe: true,
        magic_bytes_verified: true,
        detected_mime_type: detectedMime,
        declared_mime_type: declared_mime_type || null,
        mime_matches_declared: !declared_mime_type || declared_mime_type === detectedMime,
        sha256,
        scanner_status: 'clean',
        malware_engine: verdict.engine.trim().slice(0, 80),
        malware_engine_version: typeof verdict.version === 'string' ? verdict.version.trim().slice(0, 80) : null
      };
    }
  };
}

export const DOCUMENT_SECURITY_SCANNER_POLICY = Object.freeze({
  max_file_bytes: DEFAULT_MAX_FILE_BYTES,
  allowed_mime_types: [...DEFAULT_ALLOWED_MIME_TYPES],
  default_scan_timeout_ms: DEFAULT_SCAN_TIMEOUT_MS,
  fail_closed_without_malware_scanner: true
});
