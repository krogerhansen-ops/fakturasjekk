import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId, requireBodyObject } from './auth-policy.mjs';

export function createPaymentHandlers({ services, gateway = null, checkoutConsentService = null, idempotency = null, allowedReturnOrigins = [] } = {}) {
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }

  return {
    async payment_requirement(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      return { status: 200, body: await services.getPaymentRequirement({ case_id, owner_id: user.id }) };
    },

    async create_payment_session(request) {
      if (!gateway?.createSession) throw new ApiError(503, 'payment_provider_unavailable', 'Betaling er ikke koblet til ennå.');
      if (!checkoutConsentService?.acceptForPaymentSession) throw new ApiError(503, 'checkout_not_ready', 'Kjøpsflyten er ikke ferdig konfigurert.');
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = request.body == null ? {} : requireBodyObject(request.body);
      let return_url = body.return_url ?? null;
      if (return_url) {
        let parsed;
        try { parsed = new URL(return_url); } catch { throw new ApiError(400, 'invalid_return_url', 'Ugyldig returadresse.'); }
        if (!allowedReturnOrigins.includes(parsed.origin)) throw new ApiError(400, 'invalid_return_url', 'Returadressen er ikke tillatt.');
        return_url = parsed.toString();
      }
      return mutate(request, `payment_session:${case_id}`, async () => {
        const requirement = await services.getPaymentRequirement({ case_id, owner_id: user.id });
        let accepted;
        try {
          accepted = await checkoutConsentService.acceptForPaymentSession({
            case_id,
            owner_id: user.id,
            consent: body.checkout_consent ?? {},
            requirement
          });
        } catch (error) {
          if (['checkout_not_ready','checkout_consent_required','checkout_version_mismatch','checkout_price_mismatch','checkout_invalid_case_state','checkout_delivery_email_invalid'].includes(error?.code)) {
            throw new ApiError(409, error.code, error.message);
          }
          throw error;
        }
        const session = await gateway.createSession({ case_id, owner_id: user.id, requirement, return_url });
        return {
          status: 201,
          body: {
            ...session,
            checkout_consent_id: accepted.checkout_consent_id,
            agreement_confirmation_payload: accepted.agreement_confirmation_payload
          }
        };
      });
    }
  };
}

export function createPaymentWebhookHandler({ webhookService, expectedProvider } = {}) {
  return {
    async payment_webhook(request) {
      if (!webhookService?.process) throw new ApiError(503, 'payment_provider_unavailable', 'Betalingsmottak er ikke konfigurert.');
      if (expectedProvider && request.params?.provider !== expectedProvider) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
      const result = await webhookService.process({ headers: request.headers ?? {}, raw_body: request.raw_body ?? '' });
      return { status: result.accepted ? 200 : 422, body: { accepted: result.accepted } };
    }
  };
}
