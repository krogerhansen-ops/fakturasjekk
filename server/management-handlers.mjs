import { requireUser, requireCaseId } from './auth-policy.mjs';

export function createManagementHandlers({ management, idempotency = null } = {}) {
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }

  return {
    async list_cases(request) {
      const user = requireUser(request);
      return { status: 200, body: { cases: await management.listCases({ owner_id: user.id }) } };
    },

    async delete_case(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      return mutate(request, `delete_case:${case_id}`, async () => ({
        status: 200,
        body: await management.deleteCase({ case_id, owner_id: user.id, reason: 'user_request' })
      }));
    }
  };
}
