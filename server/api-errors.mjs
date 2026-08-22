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
  if (error?.code === 'legal_review_required' || /legal rule registry requires review/i.test(message)) return new ApiError(503, 'legal_review_required', 'Regelgrunnlaget må kontrolleres før saken kan analyseres eller vises.');
  if (/outbound record not found/i.test(message)) return new ApiError(404, 'outbound_record_not_found', 'Utkastet som skal registreres som sendt finnes ikke i saken.');
  if (/outbound .* cannot be marked sent|different outbound communication marked as sent/i.test(message)) return new ApiError(409, 'outbound_state_conflict', 'Meldingen kan ikke registreres som sendt i sakens nåværende steg.');
  if (/no fact confirmation is currently required/i.test(message)) return new ApiError(409, 'fact_confirmation_not_required', 'Saken har ingen åpne felt som skal bekreftes nå.');
  if (/not found|does not exist|owner|owned|access|forbidden/i.test(message)) return new ApiError(404, 'case_not_found', 'Saken finnes ikke.');
  if (/locked until verified 29 NOK payment/i.test(message)) return new ApiError(402, 'payment_required', 'Fullresultatet krever verifisert betaling på 29 kr.');
  if (/all reserved documents must be uploaded and verified/i.test(message)) return new ApiError(409, 'uploads_not_finalized', 'Alle dokumenter må være ferdig lastet opp og verifisert før analyse.');
  if (/uploaded document failed server-side verification/i.test(message)) return new ApiError(422, 'upload_verification_failed', 'Dokumentet bestod ikke sikkerhetskontrollen.');
  if (/uploaded document is too large/i.test(message)) return new ApiError(422, 'uploaded_file_too_large', 'Dokumentet er for stort.');
  if (/uploaded document type is not allowed/i.test(message)) return new ApiError(422, 'uploaded_file_type_not_allowed', 'Dokumenttypen er ikke tillatt.');
  if (/invoice document is required/i.test(message)) return new ApiError(409, 'invoice_required', 'Faktura må være lastet opp før analyse.');
  if (/analysis must exist/i.test(message)) return new ApiError(409, 'analysis_required', 'Analysen må være ferdig først.');
  if (/no controlled draft/i.test(message)) return new ApiError(409, 'draft_unavailable', 'Det finnes ikke et kontrollert utkast for denne analysen.');
  return error;
}
