import { publicReadiness } from './readiness.mjs';

export function createSystemHandlers({ readiness = null, version = null } = {}) {
  return {
    async health() {
      return { status: 200, body: { status: 'ok', version: version ?? null } };
    },
    async readiness() {
      const result = typeof readiness === 'function' ? await readiness() : readiness;
      if (!result) return { status: 503, body: { ready: false, status: 'not_configured' } };
      return { status: result.ready ? 200 : 503, body: publicReadiness(result) };
    }
  };
}
