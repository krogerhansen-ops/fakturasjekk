export function validateExtraction(extraction = {}, policy) {
  const accepted = {};
  const review = [];
  const rejected = [];
  const critical = new Set(policy.critical_fields ?? []);
  const requireSource = policy.require_source_location === true;

  for (const [field, item] of Object.entries(extraction.fields ?? {})) {
    if (item == null || typeof item !== 'object') {
      rejected.push({ field, reason: 'Feltet mangler strukturert verdi/kildeinformasjon.' });
      continue;
    }

    if (item.value === undefined || item.value === null || item.value === '') {
      rejected.push({ field, reason: 'Verdien mangler og skal ikke gjettes.' });
      continue;
    }

    const confidence = Number(item.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      rejected.push({ field, reason: 'Ugyldig eller manglende confidence-score.' });
      continue;
    }

    if (requireSource && (!item.source_document_id || item.source_page == null)) {
      rejected.push({ field, reason: 'Kildeplassering mangler.' });
      continue;
    }

    const threshold = critical.has(field)
      ? Number(policy.min_confidence.critical)
      : Number(policy.min_confidence.standard);

    const normalized = {
      value: item.value,
      confidence,
      source_document_id: item.source_document_id,
      source_page: item.source_page,
      raw_text: item.raw_text ?? null,
      critical: critical.has(field)
    };

    if (confidence < threshold) {
      review.push({ field, threshold, ...normalized, reason: 'Confidence er under tillatt grense og må bekreftes.' });
    } else {
      accepted[field] = normalized;
    }
  }

  return {
    accepted,
    review,
    rejected,
    safe_to_continue: review.length === 0 && rejected.length === 0,
    counts: {
      accepted: Object.keys(accepted).length,
      review: review.length,
      rejected: rejected.length
    }
  };
}

export function toEvidenceOrigins(validated) {
  const origins = {};
  for (const [field, item] of Object.entries(validated.accepted ?? {})) {
    origins[field] = {
      type: 'documented',
      source_id: item.source_document_id,
      confidence: item.confidence,
      note: `Dokumentside ${item.source_page}`
    };
  }
  return origins;
}
