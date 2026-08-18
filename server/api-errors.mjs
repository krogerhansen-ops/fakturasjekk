export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiErrorResponse(error, requestId = null) {
  const safe = error instanceof ApiError
    ? error
    : new ApiError(500, 'internal_error', 'En intern feil oppstod.');

  return {
    status: safe.status,
    body: {
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.details ? { details: safe.details } : {})
      },
      ...(requestId ? { request_id: requestId } : {})
    }
  };
}

export function mapServiceError(error) {
  const message = String(error?.message ?? '');
  if (/not found|does not exist|owner|owned|access|forbidden/i.test(message)) {
    return new ApiError(404, 'case_not_found', 'Saken finnes ikke.');
  }
  if (/locked until verified 29 NOK payment/i.test(message)) {
    return new ApiError(402, 'payment_required', 'Fullresultatet krever verifisert betaling på 29 kr.');
  }
  if (/invoice document is required/i.test(message)) {
    return new ApiError(409, 'invoice_required', 'Faktura må være lastet opp før analyse.');
  }
  if (/analysis must exist/i.test(message)) {
    return new ApiError(409, 'analysis_required', 'Analysen må være ferdig først.');
  }
  if (/no controlled draft/i.test(message)) {
    return new ApiError(409, 'draft_unavailable', 'Det finnes ikke et kontrollert utkast for denne analysen.');
  }
  return error;
}
