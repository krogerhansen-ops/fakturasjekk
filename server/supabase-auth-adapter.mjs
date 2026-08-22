const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg';
const EXPECTED_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const MAX_BEARER_BYTES = 8192;
const MAX_EMAIL_BYTES = 320;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const encoder = new TextEncoder();

function normalizedOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL.`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  if (url.origin !== EXPECTED_ORIGIN) throw new Error(`${name} must use the dedicated Fakturasjekk Supabase project.`);
  return url.origin;
}

function validPublishableKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = value.trim();
  if (/^sb_secret_/i.test(key)) return null;
  if (!/^sb_publishable_/i.test(key) && !/^eyJ/i.test(key)) return null;
  return key;
}

function normalizedBearer(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || encoder.encode(token).byteLength > MAX_BEARER_BYTES) return null;
  if (/\s/.test(token)) return null;
  return token;
}

function permanentAuthenticatedUser(user) {
  if (!user || typeof user !== 'object') return null;
  if (typeof user.id !== 'string' || !UUID_RE.test(user.id)) return null;
  if (user.role !== 'authenticated') return null;
  if (user.is_anonymous !== false) return null;
  return { id: user.id };
}

function verifiedDeliveryEmail(user, expectedUserId) {
  const permanent = permanentAuthenticatedUser(user);
  if (!permanent || permanent.id !== expectedUserId) return null;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email || encoder.encode(email).byteLength > MAX_EMAIL_BYTES || !EMAIL_RE.test(email)) return null;
  const confirmedAt = user.email_confirmed_at ?? user.confirmed_at ?? null;
  if (typeof confirmedAt !== 'string' || Number.isNaN(Date.parse(confirmedAt))) return null;
  return { user_id: permanent.id, email, verified_at: confirmedAt };
}

export function createSupabaseAuthAdapter({
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  const origin = normalizedOrigin(supabaseUrl, 'Supabase URL');
  const clientKey = validPublishableKey(publishableKey);
  if (!clientKey) throw new Error('A valid Supabase publishable/legacy anon client key is required; secret keys are forbidden.');
  if (typeof fetchImpl !== 'function') throw new Error('Supabase Auth adapter requires fetch.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 15000) throw new Error('Supabase Auth timeout must be between 500 and 15000 ms.');

  async function fetchUser(token) {
    const bearer = normalizedBearer(token);
    if (!bearer) return null;
    let response;
    try {
      response = await fetchImpl(`${origin}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: clientKey,
          authorization: `Bearer ${bearer}`,
          accept: 'application/json'
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch {
      return null;
    }
    if (!response?.ok) return null;
    try { return await response.json(); } catch { return null; }
  }

  return {
    async verifyBearer(token) {
      const user = await fetchUser(token);
      // Authorization accepts only permanent, authenticated users. Anonymous Auth users are deliberately
      // excluded from paid/stored Fakturasjekk cases because they cannot reliably recover the same account.
      // Data minimization: downstream authorization receives only the stable Auth UUID.
      return permanentAuthenticatedUser(user);
    },

    async getVerifiedDeliveryContact(token, expectedUserId) {
      if (typeof expectedUserId !== 'string' || !UUID_RE.test(expectedUserId)) return null;
      const user = await fetchUser(token);
      // This method exists only for the checkout/durable-medium path. It deliberately returns no metadata,
      // names, phone numbers or user-editable profile fields, and cannot resolve another account's email.
      return verifiedDeliveryEmail(user, expectedUserId);
    }
  };
}

export const SUPABASE_AUTH_POLICY = Object.freeze({
  project_ref: EXPECTED_PROJECT_REF,
  origin: EXPECTED_ORIGIN,
  require_permanent_user: true,
  require_confirmed_delivery_email: true,
  max_bearer_bytes: MAX_BEARER_BYTES,
  max_delivery_email_bytes: MAX_EMAIL_BYTES
});
