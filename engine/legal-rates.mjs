function isoDate(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return null;
  return text;
}

function normalized(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

function effectiveRange(rate) {
  const from = isoDate(rate?.effective_from);
  const to = isoDate(rate?.effective_to);
  if (!from || !to || from > to) return null;
  return { from, to };
}

function sameKey(a, b) {
  return normalized(a.type) === normalized(b.type) && normalized(a.category) === normalized(b.category);
}

function overlaps(a, b) {
  const ar = effectiveRange(a);
  const br = effectiveRange(b);
  if (!ar || !br) return false;
  return ar.from <= br.to && br.from <= ar.to;
}

export function assertLegalRateRegistry(registry = {}) {
  if (registry.runtime !== false) throw new Error('Legal rate registry must remain non-runtime until explicitly integrated and launch-reviewed.');
  if (registry.policy?.select_by_relevant_event_date !== true || registry.policy?.never_apply_latest_rate_retroactively !== true) {
    throw new Error('Legal rate registry must require event-date selection and forbid retroactive latest-rate use.');
  }

  const rates = registry.rates ?? [];
  const ids = new Set();
  for (const rate of rates) {
    if (!rate?.id || ids.has(rate.id)) throw new Error(`Duplicate or missing legal rate id: ${rate?.id ?? 'missing'}`);
    ids.add(rate.id);
    if (!rate.type || !Number.isFinite(Number(rate.value))) throw new Error(`${rate.id}: legal rate requires type and numeric value.`);
    if (!effectiveRange(rate)) throw new Error(`${rate.id}: invalid effective date range.`);
    if (!/^https:\/\//.test(String(rate.source_url ?? ''))) throw new Error(`${rate.id}: official HTTPS source is required.`);
    if (!String(rate.expected_phrase ?? '').trim()) throw new Error(`${rate.id}: source-monitor phrase is required.`);
    if (typeof rate.runtime_for_consumer !== 'boolean') throw new Error(`${rate.id}: runtime_for_consumer must be explicit.`);
  }

  for (let i = 0; i < rates.length; i += 1) {
    for (let j = i + 1; j < rates.length; j += 1) {
      if (sameKey(rates[i], rates[j]) && overlaps(rates[i], rates[j])) {
        throw new Error(`Overlapping legal rates: ${rates[i].id} and ${rates[j].id}.`);
      }
    }
  }
  return true;
}

export function resolveLegalRate(registry, { type, date, category = null, consumer = true } = {}) {
  const effectiveDate = isoDate(date);
  if (!effectiveDate) {
    return { status: 'needs_clarification', reason: 'Gyldig relevant dato mangler for satskontrollen.', rate: null };
  }
  if (!type) {
    return { status: 'needs_clarification', reason: 'Satstype mangler.', rate: null };
  }

  const wantedType = normalized(type);
  const wantedCategory = normalized(category);
  const sameTypeAndCategory = (registry?.rates ?? []).filter(rate => {
    if (normalized(rate.type) !== wantedType) return false;
    if (normalized(rate.category) !== wantedCategory) return false;
    return String(rate.effective_from) <= effectiveDate && effectiveDate <= String(rate.effective_to);
  });

  const eligible = sameTypeAndCategory.filter(rate => consumer !== true || rate.runtime_for_consumer !== false);
  if (sameTypeAndCategory.length && !eligible.length && consumer === true) {
    return {
      status: 'not_applicable_to_consumer',
      reason: 'Den kontrollerte satsen er eksplisitt sperret for automatisk bruk mot forbruker.',
      rate: null
    };
  }

  if (!eligible.length) {
    return {
      status: 'not_resolved',
      reason: 'Ingen kontrollert sats dekker denne kombinasjonen av dato, type og kategori.',
      rate: null
    };
  }
  if (eligible.length > 1) {
    return {
      status: 'conflict',
      reason: 'Flere kontrollerte satser overlapper for samme dato/type/kategori. Manuell kontroll kreves.',
      rate: null,
      candidate_ids: eligible.map(rate => rate.id)
    };
  }

  const [rate] = eligible;
  return {
    status: 'resolved',
    rate: {
      id: rate.id,
      type: rate.type,
      category: rate.category ?? null,
      value: rate.value,
      effective_from: rate.effective_from,
      effective_to: rate.effective_to,
      source_authority: rate.source_authority,
      source_url: rate.source_url
    }
  };
}

export function resolveLateInterestRate(registry, { date, consumer = true } = {}) {
  return resolveLegalRate(registry, { type: 'late_payment_interest_percent_pa', date, consumer });
}

export function resolveCollectionRate(registry, { type, date, consumer = true } = {}) {
  return resolveLegalRate(registry, { type, date, consumer });
}
