function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(later, earlier) {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
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

  if (!definition || definition.status !== 'active' || definition.machine_source_verified !== true) {
    result.status = 'source_not_active';
    result.reason = 'Fagregisteret er ikke aktivert med en verifisert maskinkilde.';
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
