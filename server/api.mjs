import { apiErrorResponse, mapServiceError, ApiError } from './api-errors.mjs';
import { createCaseHandlers } from './case-handlers.mjs';
import { createPaymentHandlers, createPaymentWebhookHandler } from './payment-handlers.mjs';
import { createManagementHandlers } from './management-handlers.mjs';

export function createApi({
  services,
  registry = null,
  management = null,
  paymentGateway = null,
  paymentWebhookService = null,
  paymentProviderName = null,
  allowedReturnOrigins = [],
  idempotency = null,
  clock
} = {}) {
  const handlers = {
    ...createCaseHandlers({ services, registry, idempotency, clock }),
    ...createPaymentHandlers({ services, gateway: paymentGateway, idempotency, allowedReturnOrigins }),
    ...(paymentWebhookService ? createPaymentWebhookHandler({ webhookService: paymentWebhookService, expectedProvider: paymentProviderName }) : {}),
    ...(management ? createManagementHandlers({ management, idempotency }) : {})
  };

  return {
    handlers,
    async invoke(action, request = {}) {
      try {
        const handler = handlers[action];
        if (!handler) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
        return await handler(request);
      } catch (error) {
        return apiErrorResponse(mapServiceError(error), request.request_id ?? null);
      }
    }
  };
}
