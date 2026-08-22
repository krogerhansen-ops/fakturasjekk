import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId } from './auth-policy.mjs';
import { buildDownloadableOrderConfirmation } from './order-confirmation-document.mjs';

const FORMATS = new Set(['html', 'text']);

export function createOrderConfirmationHandlers({ orderConfirmationService = null } = {}) {
  return {
    async order_confirmation_download(request) {
      if (!orderConfirmationService?.getLatestPrepared) {
        throw new ApiError(503, 'order_confirmation_unavailable', 'Ordrebekreftelsen er ikke tilgjengelig ennå.');
      }
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const format = String(request.params?.format ?? '').toLowerCase();
      if (!FORMATS.has(format)) {
        throw new ApiError(400, 'invalid_order_confirmation_format', 'Format må være html eller text.');
      }

      let prepared;
      try {
        prepared = await orderConfirmationService.getLatestPrepared({ case_id, owner_id: user.id });
      } catch (error) {
        if (error?.code === 'order_confirmation_not_ready') {
          throw new ApiError(409, 'order_confirmation_not_ready', 'Ordrebekreftelsen er ikke klargjort ennå.');
        }
        if (error?.code === 'payment_not_verified' || error?.code === 'payment_amount_mismatch') {
          throw new ApiError(402, 'payment_required', 'Ordrebekreftelsen krever verifisert betaling på 29 kr.');
        }
        throw error;
      }

      const document = buildDownloadableOrderConfirmation(prepared.confirmation, { format });
      return {
        status: 200,
        body: {
          confirmation_id: prepared.confirmation.confirmation_id,
          document
        }
      };
    }
  };
}
