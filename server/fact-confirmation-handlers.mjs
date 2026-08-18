import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId, requireBodyObject } from './auth-policy.mjs';
import { projectCase, assertNoPrivateFields } from './public-projection.mjs';

export function createFactConfirmationHandlers({ services, idempotency = null } = {}) {
  if (!services?.confirmFacts) throw new Error('Fact confirmation requires services.confirmFacts.');
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }

  return {
    async confirm_facts(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 12) throw new ApiError(400, 'fact_confirmations_required', 'Bekreft minst ett av feltene Fakturasjekk har bedt om å avklare.');
      if (JSON.stringify(body).length > 20000) throw new ApiError(413, 'fact_confirmations_too_large', 'Bekreftelsen er for stor.');

      return mutate(request, `confirm_facts:${case_id}`, async () => {
        const output = await services.confirmFacts({ case_id, owner_id: user.id, items: body.items });
        const response = {
          confirmed: output.confirmed,
          confirmed_fields: output.confirmed_fields ?? [],
          remaining_needs: (output.remaining_needs ?? []).map(item => ({
            field: item.field,
            reason: item.reason,
            suggested_value: item.suggested_value,
            source_document_id: item.source_document_id,
            source_page: item.source_page
          })),
          errors: output.validation?.errors ?? [],
          case: projectCase(output.case)
        };
        assertNoPrivateFields(response);
        return { status: output.confirmed ? 200 : 422, body: response };
      });
    }
  };
}
