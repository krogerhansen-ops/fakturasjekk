import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId, requireBodyObject } from './auth-policy.mjs';
import { projectSupplierResponse, assertNoPrivateFields } from './public-projection.mjs';

export function createSupplierResponseHandlers({ supplierResponseService = null, idempotency = null } = {}) {
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }

  return {
    async supplier_response(request) {
      if (!supplierResponseService?.processText) throw new ApiError(503, 'supplier_response_interpreter_unavailable', 'Svarrunde 2 er ikke koblet til ennå.');
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      if (typeof body.response_text !== 'string' || !body.response_text.trim()) throw new ApiError(400, 'supplier_response_required', 'Leverandørens svartekst mangler.');
      if (body.response_text.length > 20000) throw new ApiError(413, 'supplier_response_too_large', 'Leverandørsvaret er for langt.');
      if ('structured_response' in body || 'finding_code' in body) throw new ApiError(400, 'internal_fields_not_allowed', 'Interne analysefelter skal ikke sendes fra klienten.');

      return mutate(request, `supplier_response:${case_id}`, async () => {
        const output = await supplierResponseService.processText({
          case_id,
          owner_id: user.id,
          response_text: body.response_text,
          invoice_reference: body.invoice_reference ?? ''
        });
        const projected = projectSupplierResponse(output);
        assertNoPrivateFields(projected);
        return { status: 201, body: projected };
      });
    }
  };
}
