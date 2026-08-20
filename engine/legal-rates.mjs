function isoDate(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function normalized(value) {
  return value == null ? null : String(value).trim().toLowerCase();
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
  const candidates = (registry?.rates ?? []).filter(rate => {
    if (normalized(rate.type) !== wantedType) return false;
    if (rate.category != null && normalized(rate.category) !== wantedCategory) return false;
    if (rate.category == null && wantedCategory != null) return false;
    if (consumer === true && rate.runtime_for_consumer === false) return false;
    return String(rate.effective_from) <= effectiveDate && effectiveDate <= String(rate.effective_to);
  });

  if (candidates.length === 0) {
    return {
      status: 'not_resolved',
      reason: 'Ingen kontrollert sats dekker denne kombinasjonen av dato, type og kategori.',
      rate: null
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'conflict',
      reason: 'Flere kontrollerte satser overlapper for samme dato/type/kategori. Manuell kontroll kreves.',
      rate: null,
      candidate_ids: candidates.map(rate => rate.id)
    };
  }

  const [rate] = candidates;
  return {
    status: 'resolved',
    rate: {
      id: rate.id,
      type: rate.type,
      category: rate.category ?? null,
      value: rate.value,
      effective_from: rate.effective_from,
      effective_to: rate.effective_to,
      source_url: rate.source_url,
      derived_from: rate.derived_from ?? null
    }
  };
}

export function resolveVatRate(registry, { date, category } = {}) {
  if (!category) {
    return { status: 'needs_clarification', reason: 'MVA-kategori må være dokumentert eller sikkert klassifisert før sats kan vurderes.', rate: null };
  }
  return resolveLegalRate(registry, { type: 'vat_percent', date, category, consumer: true });
}

export function resolveLateInterestRate(registry, { date } = {}) {
  return resolveLegalRate(registry, { type: 'late_payment_interest_percent_pa', date, consumer: true });
}

export function resolveCollectionRate(registry, { type, date, consumer = true } = {}) {
  return resolveLegalRate(registry, { type, date, consumer });
}
