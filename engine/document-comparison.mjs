function normalizeDescription(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value) {
  return new Set(normalizeDescription(value).split(' ').filter(x => x.length > 1));
}

function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function amount(line) {
  if (Number.isFinite(Number(line?.amount))) return Number(line.amount);
  if (Number.isFinite(Number(line?.quantity)) && Number.isFinite(Number(line?.unit_price))) return Number(line.quantity) * Number(line.unit_price);
  return null;
}

function lineView(line, index) {
  return {
    index,
    description: String(line?.description ?? '').trim(),
    normalized_description: normalizeDescription(line?.description),
    quantity: Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : null,
    unit_price: Number.isFinite(Number(line?.unit_price)) ? Number(line.unit_price) : null,
    amount: amount(line)
  };
}

export function compareDocumentLines({
  agreement_lines = [],
  invoice_lines = [],
  similarity_threshold = 0.70,
  auto_match_threshold = 0.86,
  amount_tolerance = 0.02
} = {}) {
  const agreement = agreement_lines.map(lineView);
  const invoice = invoice_lines.map(lineView);
  const usedInvoice = new Set();
  const matches = [];
  const ambiguous = [];

  for (const a of agreement) {
    const exactCandidates = invoice.filter((i, index) => !usedInvoice.has(index) && i.normalized_description && i.normalized_description === a.normalized_description);
    let candidate = exactCandidates.length === 1 ? { line: exactCandidates[0], score: 1, method: 'exact_description' } : null;

    if (!candidate && exactCandidates.length > 1) {
      ambiguous.push({ agreement: a, candidates: exactCandidates, reason: 'Flere fakturalinjer har samme normaliserte beskrivelse.' });
      continue;
    }

    if (!candidate) {
      const scored = invoice
        .map((line, index) => ({ line, index, score: usedInvoice.has(index) ? 0 : jaccard(a.description, line.description) }))
        .filter(x => x.score >= similarity_threshold)
        .sort((x, y) => y.score - x.score);

      if (scored.length === 1 && scored[0].score >= auto_match_threshold) {
        candidate = { line: scored[0].line, score: scored[0].score, method: 'unique_token_similarity' };
      } else if (scored.length > 1 && scored[0].score >= auto_match_threshold && scored[0].score - scored[1].score >= 0.15) {
        candidate = { line: scored[0].line, score: scored[0].score, method: 'unique_token_similarity' };
      } else if (scored.length) {
        ambiguous.push({
          agreement: a,
          candidates: scored.map(x => x.line),
          reason: scored.length > 1
            ? 'Beskrivelsen ligner flere fakturalinjer. Fakturasjekk velger ikke automatisk.'
            : 'Beskrivelsen ligner én fakturalinje, men likheten er ikke høy nok for sikker automatisk matching.'
        });
        continue;
      }
    }

    if (!candidate) continue;
    const invoiceIndex = invoice.indexOf(candidate.line);
    usedInvoice.add(invoiceIndex);
    const aAmount = a.amount, iAmount = candidate.line.amount;
    matches.push({
      agreement: a,
      invoice: candidate.line,
      method: candidate.method,
      similarity: Number(candidate.score.toFixed(3)),
      amount_difference: aAmount != null && iAmount != null ? Number((iAmount - aAmount).toFixed(2)) : null,
      amount_changed: aAmount != null && iAmount != null ? Math.abs(iAmount - aAmount) > amount_tolerance : null,
      quantity_changed: a.quantity != null && candidate.line.quantity != null ? a.quantity !== candidate.line.quantity : null,
      unit_price_changed: a.unit_price != null && candidate.line.unit_price != null ? Math.abs(a.unit_price - candidate.line.unit_price) > amount_tolerance : null
    });
  }

  const matchedAgreement = new Set(matches.map(m => m.agreement.index));
  const ambiguousAgreement = new Set(ambiguous.map(m => m.agreement.index));
  const missing_from_invoice = agreement.filter(a => !matchedAgreement.has(a.index) && !ambiguousAgreement.has(a.index));
  const added_on_invoice = invoice.filter((_, index) => !usedInvoice.has(index) && !ambiguous.some(group => group.candidates.some(c => c.index === index)));

  const changed = matches.filter(m => m.amount_changed || m.quantity_changed || m.unit_price_changed);
  return {
    matches,
    changed,
    added_on_invoice,
    missing_from_invoice,
    ambiguous,
    summary: {
      agreement_line_count: agreement.length,
      invoice_line_count: invoice.length,
      matched_count: matches.length,
      changed_count: changed.length,
      added_count: added_on_invoice.length,
      missing_count: missing_from_invoice.length,
      ambiguous_count: ambiguous.length
    },
    safe_for_automatic_conclusion: ambiguous.length === 0
  };
}

export { normalizeDescription };
