import { requireUser, requireCaseId, requireBodyObject } from './auth-policy.mjs';

export function createPaymentHandlers({ services, idempotency = null } = {}) {
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

    async confirm_payment(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      return mutate(request, `confirm_payment:${case_id}`, async () => {
        const output = await services.confirmPayment({ case_id, owner_id: user.id, confirmation: body.confirmation });
        return { status: output.paid ? 200 : 422, body: output };
      });
    }
  };
}
