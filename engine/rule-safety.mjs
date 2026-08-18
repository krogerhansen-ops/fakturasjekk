function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function evaluateRuleSafety(registry = {}, { now = new Date(), max_age_days = 30 } = {}) {
  const current = now instanceof Date ? now : new Date(now);
  const rules = (registry.rules ?? []).map(rule => {
    if (rule.status !== 'active') return { ...rule, runtime_usable: false, runtime_reason: `status:${rule.status}` };
    const verified = /^\d{4}-\d{2}-\d{2}$/.test(rule.last_verified ?? '') ? new Date(`${rule.last_verified}T00:00:00Z`) : null;
    if (!verified || Number.isNaN(verified.getTime())) return { ...rule, runtime_usable: false, runtime_reason: 'missing_or_invalid_verification_date' };
    const age = daysBetween(verified, current);
    if (age < 0) return { ...rule, runtime_usable: false, runtime_reason: 'verification_date_in_future' };
    if (age > max_age_days) return { ...rule, runtime_usable: false, runtime_reason: `verification_too_old:${age}d` };
    if (!/^https:\/\/lovdata\.no\//.test(rule.source_url ?? '')) return { ...rule, runtime_usable: false, runtime_reason: 'non_primary_source' };
    return { ...rule, runtime_usable: true, runtime_reason: null, runtime_verification_age_days: age };
  });
  const active = rules.filter(r => r.status === 'active');
  const blocked = active.filter(r => !r.runtime_usable);
  return { usable: blocked.length === 0, rules, active_count: active.length, blocked_count: blocked.length, blocked_ids: blocked.map(r => r.id), max_age_days };
}

export function runtimeSafeRegistry(registry, options = {}) {
  const safety = evaluateRuleSafety(registry, options);
  return {
    ...registry,
    rules: safety.rules.map(rule => rule.runtime_usable ? rule : { ...rule, status: rule.status === 'active' ? 'review_required' : rule.status }),
    runtime_safety: { usable: safety.usable, blocked_count: safety.blocked_count, blocked_ids: safety.blocked_ids, max_age_days: safety.max_age_days }
  };
}
