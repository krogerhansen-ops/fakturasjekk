export function createMemoryPaymentEventStore() {
  const claims = new Map();
  return {
    async claim({ provider, provider_reference, case_id }) {
      const key = `${provider}:${provider_reference}`;
      const existing = claims.get(key);
      if (!existing) {
        claims.set(key, { provider, provider_reference, case_id });
        return { status: 'new' };
      }
      if (existing.case_id === case_id) return { status: 'duplicate_same_case' };
      return { status: 'conflict', existing_case_id: existing.case_id };
    }
  };
}
