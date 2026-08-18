import { apiErrorResponse, mapServiceError, ApiError } from './api-errors.mjs';
import { createCaseHandlers } from './case-handlers.mjs';
import { createPaymentHandlers } from './payment-handlers.mjs';

export function createApi({ services, idempotency = null, clock } = {}) {
  const handlers = {
    ...createCaseHandlers({ services, idempotency, clock }),
    ...createPaymentHandlers({ services, idempotency })
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
