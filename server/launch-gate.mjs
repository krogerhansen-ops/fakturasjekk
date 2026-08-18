const VALID_STATUSES = new Set(['todo','in_progress','complete','not_applicable']);

export function evaluateLaunchGate(config = {}) {
  const checks = config.checks ?? [];
  const ids = new Set();
  const errors = [];
  for (const check of checks) {
    if (!check.id || ids.has(check.id)) errors.push(`Ugyldig eller duplisert launch-gate ID: ${check.id ?? 'mangler'}`);
    ids.add(check.id);
    if (!VALID_STATUSES.has(check.status)) errors.push(`Ugyldig status for ${check.id}: ${check.status}`);
    if (check.status === 'complete' && !check.evidence) errors.push(`Fullført gate mangler evidence: ${check.id}`);
    if (check.status === 'not_applicable' && check.required === true && !check.evidence) errors.push(`Obligatorisk gate kan ikke settes N/A uten dokumentert begrunnelse: ${check.id}`);
  }

  const blocking = checks.filter(c => c.required === true && c.status !== 'complete' && c.status !== 'not_applicable');
  return {
    valid: errors.length === 0,
    launch_allowed: errors.length === 0 && blocking.length === 0,
    total: checks.length,
    complete: checks.filter(c => c.status === 'complete').length,
    blocking_count: blocking.length,
    blocking_ids: blocking.map(c => c.id),
    errors
  };
}

export function markLaunchGate(config, id, { status, evidence }) {
  if (!VALID_STATUSES.has(status)) throw new Error('Invalid launch-gate status.');
  const exists = (config.checks ?? []).some(c => c.id === id);
  if (!exists) throw new Error(`Unknown launch-gate id: ${id}`);
  return {
    ...config,
    checks: config.checks.map(check => check.id === id ? { ...check, status, evidence: evidence ?? null } : check)
  };
}
