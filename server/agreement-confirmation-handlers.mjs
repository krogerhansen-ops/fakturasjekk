import { ApiError } from './api-errors.mjs';

export function createAgreementConfirmationHandlers({ service, expectedProvider = 'brevo' } = {}) {
  return {
    async agreement_confirmation_webhook(request) {
      if (!service?.processWebhook) throw new ApiError(503, 'agreement_confirmation_unavailable', 'Bekreftelseslevering er ikke konfigurert.');
      if (request.params?.provider !== expectedProvider) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
      try {
        const result = await service.processWebhook({ headers: request.headers ?? {}, raw_body: request.raw_body ?? '' });
        return { status: result.accepted ? 200 : 422, body: { accepted: result.accepted, delivered: result.delivered === true } };
      } catch (error) {
        if (error?.code === 'invalid_email_webhook') throw new ApiError(401, 'invalid_email_webhook', 'E-posthendelsen kunne ikke verifiseres.');
        if (error?.code === 'email_webhook_message_conflict') throw new ApiError(409, 'email_webhook_message_conflict', 'E-posthendelsen samsvarer ikke med saken.');
        throw error;
      }
    }
  };
}
