function normalizedOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL.`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  return url.origin;
}

export function createSupabaseAuthAdapter({
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  const origin = normalizedOrigin(supabaseUrl, 'Supabase URL');
  if (typeof publishableKey !== 'string' || !publishableKey.trim()) throw new Error('Supabase publishable key is required.');
  if (typeof fetchImpl !== 'function') throw new Error('Supabase Auth adapter requires fetch.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 15000) throw new Error('Supabase Auth timeout must be between 500 and 15000 ms.');

  return {
    async verifyBearer(token) {
      if (typeof token !== 'string' || !token.trim()) return null;
      let response;
      try {
        response = await fetchImpl(`${origin}/auth/v1/user`, {
          method: 'GET',
          headers: {
            apikey: publishableKey.trim(),
            authorization: `Bearer ${token.trim()}`,
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
      let user;
      try { user = await response.json(); } catch { return null; }
      if (!user?.id || typeof user.id !== 'string') return null;

      // Data minimization: the application authorization layer only needs the stable Auth user id.
      return { id: user.id };
    }
  };
}
