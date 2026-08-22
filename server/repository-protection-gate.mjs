const REQUIRED_TRUE = Object.freeze([
  'protected',
  'pull_request_required',
  'quality_gate_required',
  'codeowner_review_required',
  'force_push_blocked',
  'branch_deletion_blocked'
]);

export function evaluateRepositoryProtectionGate(config = {}) {
  const errors = [];
  if (config.required !== true) errors.push('Repository protection gate must be required.');
  if (config.repository !== 'krogerhansen-ops/fakturasjekk') errors.push('Repository protection gate targets the wrong repository.');
  if (config.branch !== 'main') errors.push('Repository protection gate must target main.');
  if (!['todo', 'in_progress', 'complete'].includes(config.status)) errors.push('Repository protection gate has invalid status.');

  const missingRequirements = REQUIRED_TRUE.filter(name => config.requirements?.[name] !== true);
  if (missingRequirements.length) errors.push(`Repository protection gate is missing required controls: ${missingRequirements.join(', ')}`);
  if (config.status === 'complete' && (typeof config.evidence !== 'string' || config.evidence.trim().length < 20)) {
    errors.push('Completed repository protection gate requires live GitHub enforcement evidence.');
  }

  return {
    valid: errors.length === 0,
    launch_allowed: errors.length === 0 && config.required === true && config.status === 'complete',
    blocking: config.required === true && config.status !== 'complete',
    blocking_id: 'TECH_REPOSITORY_PROTECTION',
    errors
  };
}

export const REPOSITORY_PROTECTION_REQUIREMENTS = REQUIRED_TRUE;
