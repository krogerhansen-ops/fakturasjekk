import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId, requireBodyObject, requireString } from './auth-policy.mjs';

export function createCaseHandlers({ services, idempotency = null, clock = () => new Date() } = {}) {
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }

  return {
    async create_case(request) {
      const user = requireUser(request);
      const body = requireBodyObject(request.body);
      if (!['consumer', 'business'].includes(body.buyer_type)) {
        throw new ApiError(400, 'invalid_buyer_type', 'buyer_type må være consumer eller business.');
      }
      const subject = requireString(body.subject, 'subject_required', 'Sakstype må oppgis.', { max: 80 });
      const retention_mode = body.retention_mode ?? 'temporary';
      if (!['temporary', 'saved_case'].includes(retention_mode)) {
        throw new ApiError(400, 'invalid_retention_mode', 'Ugyldig lagringsvalg.');
      }
      return mutate(request, 'create_case', async () => ({
        status: 201,
        body: await services.createNewCase({ owner_id: user.id, buyer_type: body.buyer_type, subject, retention_mode })
      }));
    },

    async register_uploads(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      if (!Array.isArray(body.files)) throw new ApiError(400, 'files_required', 'files må være en liste.');
      return mutate(request, `register_uploads:${case_id}`, async () => {
        const output = await services.registerUploads({ case_id, owner_id: user.id, files: body.files });
        return { status: output.accepted ? 200 : 422, body: output };
      });
    },

    async analyze_case(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = request.body == null ? {} : requireBodyObject(request.body);
      return mutate(request, `analyze_case:${case_id}`, async () => ({
        status: 200,
        body: await services.analyzeStoredCase({
          case_id,
          owner_id: user.id,
          user_note: typeof body.user_note === 'string' ? body.user_note.slice(0, 4000) : '',
          collection: body.collection ?? null
        })
      }));
    },

    async full_result(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      return { status: 200, body: await services.getFullResult({ case_id, owner_id: user.id }) };
    },

    async create_draft(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = request.body == null ? {} : requireBodyObject(request.body);
      return mutate(request, `create_draft:${case_id}`, async () => ({
        status: 201,
        body: await services.saveGeneratedDraft({ case_id, owner_id: user.id, mode: body.mode ?? 'request' })
      }));
    },

    async supplier_response(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      if (!body.response_record || !body.structured_response) {
        throw new ApiError(400, 'supplier_response_required', 'Leverandørsvar mangler.');
      }
      return mutate(request, `supplier_response:${case_id}`, async () => ({
        status: 201,
        body: await services.registerSupplierResponse({
          case_id,
          owner_id: user.id,
          response_record: body.response_record,
          structured_response: body.structured_response
        })
      }));
    },

    async retention_status(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      return { status: 200, body: await services.retentionStatus({ case_id, owner_id: user.id, now: clock().toISOString() }) };
    }
  };
}
