import { ApiError } from './api-errors.mjs';

export function bearerToken(headers = {}) {
  const value = headers.authorization ?? headers.Authorization;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(String(value));
  return match ? match[1].trim() : null;
}

export async function authenticateRequest(request, adapter) {
  const token = bearerToken(request?.headers ?? {});
  if (!token) return { user: null };
  if (!adapter?.verifyBearer) throw new Error('Auth adapter requires verifyBearer.');
  const user = await adapter.verifyBearer(token);
  if (!user?.id) throw new ApiError(401, 'invalid_token', 'Innloggingen er ugyldig eller utløpt.');
  return { user };
}

export function createDevelopmentAuthAdapter({ users = {} } = {}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development auth adapter cannot run in production.');
  }
  return {
    async verifyBearer(token) {
      const user = users[token];
      return user ? structuredClone(user) : null;
    }
  };
}
