import { apiErrorResponse, mapServiceError, ApiError } from './api-errors.mjs';
import { createCaseHandlers } from './case-handlers.mjs';
import { createFactConfirmationHandlers } from './fact-confirmation-handlers.mjs';
import { createPaymentHandlers, createPaymentWebhookHandler } from './payment-handlers.mjs';
import { createManagementHandlers } from './management-handlers.mjs';
import { createSystemHandlers } from './system-handlers.mjs';
import { createSupplierResponseHandlers } from './supplier-response-handlers.mjs';
import { createOrderConfirmationHandlers } from './order-confirmation-handlers.mjs';

export function createApi({
  services,
  registry = null,
  management = null,
  supplierResponseService = null,
  paymentGateway = null,
  paymentWebhookService = null,
  paymentProviderName = null,
  checkoutConsentService = null,
  orderConfirmationService = null,
  allowedReturnOrigins = [],
  readiness = null,
  version = null,
  idempotency = null,
  clock
} = {}) {
  const handlers = {
    ...createSystemHandlers({ readiness, version }),
    ...createCaseHandlers({ services, registry, idempotency, clock }),
    ...(services?.confirmFacts ? createFactConfirmationHandlers({ services, idempotency }) : {}),
    ...createSupplierResponseHandlers({ supplierResponseService, idempotency }),
    ...createPaymentHandlers({ services, gateway: paymentGateway, checkoutConsentService, idempotency, allowedReturnOrigins }),
    ...createOrderConfirmationHandlers({ orderConfirmationService }),
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
