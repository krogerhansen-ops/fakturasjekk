const encoder = new TextEncoder();
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const PRIVATE_KEY_LABEL = ['PRIVATE', 'KEY'].join(' ');
const PEM_BEGIN = `-----${['BEGIN', PRIVATE_KEY_LABEL].join(' ')}-----`;
const PEM_END = `-----${['END', PRIVATE_KEY_LABEL].join(' ')}-----`;

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlJson(value) {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

function pemToDer(pem) {
  const normalized = requireString(pem, 'Google service-account private key');
  if (!normalized.includes(PEM_BEGIN) || !normalized.includes(PEM_END)) {
    throw new Error('Google service-account private key must be PKCS#8 PEM.');
  }
  const body = normalized
    .replaceAll(PEM_BEGIN, '')
    .replaceAll(PEM_END, '')
    .replace(/\s+/g, '');
  let binary;
  try { binary = atob(body); } catch { throw new Error('Google service-account private key PEM is invalid.'); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importSigningKey(privateKeyPem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function buildJwtAssertion({ clientEmail, privateKeyPem, privateKeyId = null, scope, nowSeconds }) {
  const header = { alg: 'RS256', typ: 'JWT' };
  if (privateKeyId) header.kid = privateKeyId;
  const claim = {
    iss: clientEmail,
    scope,
    aud: TOKEN_URI,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const key = await importSigningKey(privateKeyPem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export function createGoogleServiceAccountTokenProvider({
  credentials,
  fetchImpl = globalThis.fetch,
  scope = DEFAULT_SCOPE,
  clock = () => new Date(),
  timeoutMs = 8000
} = {}) {
  if (!credentials || typeof credentials !== 'object') throw new Error('Google service-account credentials are required.');
  const clientEmail = requireString(credentials.client_email, 'Google service-account client_email');
  const privateKeyPem = requireString(credentials.private_key, 'Google service-account private_key');
  const privateKeyId = typeof credentials.private_key_id === 'string' && credentials.private_key_id ? credentials.private_key_id : null;
  const tokenUri = credentials.token_uri ? requireString(credentials.token_uri, 'Google token_uri') : TOKEN_URI;
  if (tokenUri !== TOKEN_URI) throw new Error('Google token_uri must be the official OAuth token endpoint.');
  const oauthScope = requireString(scope, 'Google OAuth scope');
  if (typeof fetchImpl !== 'function') throw new Error('Google service-account token provider requires fetch.');
  let cached = null;

  async function getAccessToken() {
    const nowMs = clock().getTime();
    if (!Number.isFinite(nowMs)) throw new Error('Google token provider clock is invalid.');
    if (cached && cached.expires_at_ms - nowMs > 60_000) return cached.token;

    const assertion = await buildJwtAssertion({
      clientEmail,
      privateKeyPem,
      privateKeyId,
      scope: oauthScope,
      nowSeconds: Math.floor(nowMs / 1000)
    });
    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    });

    let response;
    try {
      response = await fetchImpl(TOKEN_URI, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: form.toString(),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      throw new Error(`Google OAuth token request failed: ${String(error?.message ?? 'network error')}`);
    }

    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Google OAuth token endpoint returned invalid JSON.'); }
    if (!response.ok) {
      const message = payload?.error_description ?? payload?.error ?? `HTTP ${response.status}`;
      throw new Error(`Google OAuth token request failed: ${String(message).slice(0, 200)}`);
    }
    const token = requireString(payload.access_token, 'Google OAuth access token');
    const expiresIn = Number(payload.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 60 || expiresIn > 3600) throw new Error('Google OAuth token expiry is invalid.');
    cached = { token, expires_at_ms: nowMs + expiresIn * 1000 };
    return token;
  }

  return {
    getAccessToken,
    credential_type: 'service_account_key_fallback',
    client_email: clientEmail,
    scope: oauthScope,
    token_uri: TOKEN_URI
  };
}

export const GOOGLE_CLOUD_PLATFORM_SCOPE = DEFAULT_SCOPE;
export const GOOGLE_OAUTH_TOKEN_URI = TOKEN_URI;
