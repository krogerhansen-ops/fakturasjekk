import { ApiError } from './api-errors.mjs';

export function requireUser(request) {
  const user = request?.auth?.user;
  if (!user?.id) throw new ApiError(401, 'authentication_required', 'Innlogging kreves.');
  if (user.disabled) throw new ApiError(403, 'account_disabled', 'Kontoen er deaktivert.');
  return { id: String(user.id), email: user.email ?? null, role: user.role ?? 'user' };
}

export function requireCaseId(params) {
  const id = params?.case_id;
  if (!id || typeof id !== 'string' || id.length > 128) {
    throw new ApiError(400, 'invalid_case_id', 'Ugyldig saks-ID.');
  }
  return id;
}

export function requireBodyObject(body, label = 'body') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_request', `${label} må være et objekt.`);
  }
  return body;
}

export function requireString(value, code, message, { max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new ApiError(400, code, message);
  }
  return value.trim();
}
