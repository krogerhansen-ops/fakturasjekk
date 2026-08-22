const REGISTER_STATUSES = new Set(['prepared_not_live', 'source_verified_not_live', 'active']);

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(later, earlier) {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

function isHttps(value) {
  return typeof value === 'string' && /^https:\/\//.test(value);
}

function activationErrors(definition = {}, registerId = 'unknown') {
  const errors = [];
  if (definition.status !== 'active') errors.push(`${registerId}: status is not active`);
  if (definition.machine_source_verified !== true) errors.push(`${registerId}: machine source is not verified`);
  if (!isHttps(definition.machine_source_url)) errors.push(`${registerId}: active register requires HTTPS machine_source_url`);
  if (definition.runtime_activation_reviewed !== true) errors.push(`${registerId}: runtime activation review is missing`);
  if (definition.machine_contract_tested !== true) errors.push(`${registerId}: machine response contract is not tested`);
  if (definition.matching_contract_tested !== true) errors.push(`${registerId}: matching contract is not tested`);
  return errors;
}

export function validateSpecialistRegisterConfig(config = {}) {
  const errors = [];
  const policy = config?.policy;
  if (!policy || typeof policy !== 'object') errors.push('specialist register policy is required');
  else {
    for (const key of [
      'require_official_authority',
      'require_source_url',
      'require_fetched_at',
      'ambiguous_match_is_not_verified',
      'missing_record_is_not_negative_proof',
      'stale_record_is_not_usable'
    ]) {
      if (policy[key] !== true) errors.push(`policy.${key} must be true`);
    }
    const defaultMaxAge = Number(policy.default_max_age_hours);
    if (!Number.isFinite(defaultMaxAge) || defaultMaxAge <= 0 || defaultMaxAge > 168) {
      errors.push('policy.default_max_age_hours must be between 0 and 168');
    }
  }

  const registers = config?.registers;
  if (!registers || typeof registers !== 'object' || Array.isArray(registers) || !Object.keys(registers).length) {
    errors.push('at least one specialist register definition is required');
    return { valid: false, errors, register_count: 0, active_count: 0 };
  }

  let activeCount = 0;
  for (const [registerId, definition] of Object.entries(registers)) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push(`${registerId}: definition must be an object`);
      continue;
    }
    if (!REGISTER_STATUSES.has(definition.status)) errors.push(`${registerId}: unsupported status ${definition.status ?? 'missing'}`);
    if (typeof definition.authority !== 'string' || !definition.authority.trim()) errors.push(`${registerId}: authority is required`);
    if (typeof definition.customer_label !== 'string' || !definition.customer_label.trim()) errors.push(`${registerId}: customer_label is required`);
    if (!isHttps(definition.landing_url)) errors.push(`${registerId}: HTTPS landing_url is required`);
    if (!Array.isArray(definition.applicable_industries) || !definition.applicable_industries.length) errors.push(`${registerId}: applicable_industries is required`);

    const maxAge = Number(definition.max_age_hours);
    const defaultMaxAge = Number(policy?.default_max_age_hours);
    if (!Number.isFinite(maxAge) || maxAge <= 0 || (Number.isFinite(defaultMaxAge) && maxAge > defaultMaxAge)) {
      errors.push(`${registerId}: max_age_hours must be positive and not exceed policy default`);
    }

    if (definition.status === 'prepared_not_live') {
      if (definition.machine_source_verified !== false) errors.push(`${registerId}: prepared source must keep machine_source_verified=false`);
      if (definition.runtime_activation_reviewed === true || definition.machine_contract_tested === true || definition.matching_contract_tested === true) {
        errors.push(`${registerId}: prepared source cannot claim runtime activation tests`);
      }
    }

    if (definition.status === 'source_verified_not_live') {
      if (definition.machine_source_verified !== true) errors.push(`${registerId}: source_verified_not_live requires machine_source_verified=true`);
      if (!isHttps(definition.machine_source_url)) errors.push(`${registerId}: source_verified_not_live requires HTTPS machine_source_url`);
      if (definition.runtime_activation_reviewed === true) errors.push(`${registerId}: source_verified_not_live cannot be runtime_activation_reviewed`);
    }

    if (definition.status === 'active') {
      activeCount += 1;
      errors.push(...activationErrors(definition, registerId));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    register_count: Object.keys(registers).length,
    active_count: activeCount
  };
}

export function assertSpecialistRegisterConfig(config = {}) {
  const validation = validateSpecialistRegisterConfig(config);
  if (!validation.valid) {
    const error = new Error(`Invalid specialist register config: ${validation.errors.join('; ')}`);
    error.code = 'invalid_specialist_register_config';
    error.details = validation.errors;
    throw error;
  }
  return validation;
}

export function specialistRegisterActivationReadiness(config = {}, registerId) {
  const configValidation = validateSpecialistRegisterConfig(config);
  const definition = config?.registers?.[registerId] ?? null;
  if (!definition) return { ready: false, reasons: [`${registerId}: register definition not found`] };
  const reasons = [
    ...configValidation.errors.filter(error => error.startsWith(`${registerId}:`) || error.startsWith('policy.')),
    ...activationErrors(definition, registerId)
  ];
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function specialistRegisterDefinition(config = {}, registerId) {
  return config?.registers?.[registerId] ?? null;
}

export function evaluateSpecialistRegistryResult({
  definition,
  lookup,
  now = new Date()
} = {}) {
  const result = {
    status: 'not_checked',
    usable: false,
    registered: null,
    authority: definition?.authority ?? null,
    source_url: lookup?.source_url ?? definition?.landing_url ?? null,
    fetched_at: lookup?.fetched_at ?? null,
    record: null,
    reason: null
  };

  if (!definition || activationErrors(definition, 'register').length > 0) {
    result.status = 'source_not_active';
    result.reason = 'Fagregisteret er ikke aktivert med verifisert maskinkilde og fullført runtime-kontrakt.';
    return result;
  }

  if (!lookup) {
    result.status = 'not_checked';
    result.reason = 'Fagregisteret ble ikke kontrollert.';
    return result;
  }

  if (lookup.status === 'ambiguous') {
    result.status = 'ambiguous';
    result.reason = 'Oppslaget ga ikke ett entydig virksomhetstreff.';
    return result;
  }

  if (lookup.status === 'unavailable') {
    result.status = 'unavailable';
    result.reason = 'Fagregisteret var ikke tilgjengelig.';
    return result;
  }

  if (lookup.status === 'not_found') {
    result.status = 'not_found_unproven';
    result.reason = 'Manglende treff behandles ikke alene som bevis på manglende godkjenning.';
    return result;
  }

  if (lookup.status !== 'verified' || typeof lookup.registered !== 'boolean') {
    result.status = 'invalid_result';
    result.reason = 'Fagregisteroppslaget hadde ikke en kontrollert resultatstruktur.';
    return result;
  }

  if (!lookup.source_url || !/^https:\/\//.test(lookup.source_url)) {
    result.status = 'source_missing';
    result.reason = 'Fagregisteroppslaget mangler sikker kildeadresse.';
    return result;
  }

  if (lookup.authority !== definition.authority) {
    result.status = 'authority_mismatch';
    result.reason = 'Oppslaget kommer ikke fra den forventede offentlige registereieren.';
    return result;
  }

  const fetchedAt = parseDate(lookup.fetched_at);
  const nowDate = parseDate(now);
  if (!fetchedAt || !nowDate || fetchedAt.getTime() > nowDate.getTime()) {
    result.status = 'invalid_timestamp';
    result.reason = 'Fagregisteroppslaget har ugyldig kontrolltidspunkt.';
    return result;
  }

  const maxAge = Number(definition.max_age_hours ?? 48);
  if (!Number.isFinite(maxAge) || maxAge <= 0 || hoursBetween(nowDate, fetchedAt) > maxAge) {
    result.status = 'stale';
    result.reason = 'Fagregisteroppslaget er for gammelt til å brukes sikkert.';
    return result;
  }

  result.status = 'verified';
  result.usable = true;
  result.registered = lookup.registered;
  result.record = lookup.record ?? null;
  return result;
}

export function specialistRegistryEvidence({ registerId, evaluation } = {}) {
  if (!evaluation?.usable) return { facts: {}, origins: {} };
  const facts = {
    [`specialist_${registerId}_registered`]: evaluation.registered
  };
  const origins = {
    [`specialist_${registerId}_registered`]: {
      type: 'registry',
      source_id: `${registerId}:${evaluation.fetched_at}`,
      confidence: 'authoritative_public_registry',
      note: `Kontrollert mot ${evaluation.authority}.`
    }
  };
  return { facts, origins };
}

export const SPECIALIST_REGISTER_STATUSES = Object.freeze([...REGISTER_STATUSES]);
