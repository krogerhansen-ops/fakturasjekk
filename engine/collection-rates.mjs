const DAY_MS = 86400000;

const INKASSO_FEE_PERIODS = Object.freeze([
  Object.freeze({
    from: '2026-01-01',
    to: '2026-12-31',
    inkasso_rate_nok: 750,
    reminder_fee_nok: 38,
    collection_notice_fee_nok: 38,
    own_payment_request_fee_nok: 113,
    legal_basis: 'inkassoforskriften §§ 1-1 og 1-2',
    source_url: 'https://lovdata.no/forskrift/1989-07-14-562',
    source_change_url: 'https://lovdata.no/dokument/LTI/forskrift/2025-12-19-2709',
    verified_at: '2026-08-20'
  })
]);

const DELAY_INTEREST_PERIODS = Object.freeze([
  Object.freeze({
    from: '2026-01-01',
    to: '2026-06-30',
    annual_rate_percent: 12.00,
    standard_compensation_nok: 460,
    legal_basis: 'forsinkelsesrenteloven § 3 med forskrift gjeldende fra 1. januar 2026',
    source_url: 'https://www.finanstilsynet.no/nyhetsarkiv/nyheter/2025/forsinkelsesrente-og-standardkompensasjon-for-inndrivelseskostnader-fra-1.-januar-2026',
    verified_at: '2026-08-20'
  }),
  Object.freeze({
    from: '2026-07-01',
    to: '2026-12-31',
    annual_rate_percent: 12.25,
    standard_compensation_nok: 430,
    legal_basis: 'forsinkelsesrenteloven § 3 med forskrift gjeldende fra 1. juli 2026',
    source_url: 'https://www.finanstilsynet.no/nyhetsarkiv/nyheter/2026/forsinkelsesrente-og-standardkompensasjon-for-inndrivelseskostnader-fra-1.-juli-2026',
    verified_at: '2026-08-20'
  })
]);

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  return roundTrip === match[1] ? match[1] : null;
}

function findPeriod(periods, date) {
  const normalized = parseIsoDate(date);
  if (!normalized) return null;
  return periods.find(period => normalized >= period.from && normalized <= period.to) ?? null;
}

export function inkassoFeeCapsOn(date) {
  const period = findPeriod(INKASSO_FEE_PERIODS, date);
  if (!period) {
    return {
      status: 'unresolved',
      date: parseIsoDate(date),
      reason: parseIsoDate(date) ? 'rate_period_not_loaded' : 'event_date_missing_or_invalid'
    };
  }
  return { status: 'verified', date: parseIsoDate(date), ...period };
}

export function delayInterestRateOn(date) {
  const period = findPeriod(DELAY_INTEREST_PERIODS, date);
  if (!period) {
    return {
      status: 'unresolved',
      date: parseIsoDate(date),
      reason: parseIsoDate(date) ? 'rate_period_not_loaded' : 'interest_date_missing_or_invalid'
    };
  }
  return { status: 'verified', date: parseIsoDate(date), ...period };
}

export function delayInterestPeriodsBetween(from, to) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || start > end) {
    return { status: 'unresolved', reason: 'invalid_interest_period', periods: [] };
  }

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const periods = [];
  let cursorMs = startMs;

  while (cursorMs <= endMs) {
    const cursor = new Date(cursorMs).toISOString().slice(0, 10);
    const rate = delayInterestRateOn(cursor);
    if (rate.status !== 'verified') {
      return {
        status: 'unresolved',
        reason: 'rate_period_not_loaded',
        unresolved_date: cursor,
        periods
      };
    }

    const periodEndMs = Math.min(Date.parse(`${rate.to}T00:00:00Z`), endMs);
    const periodEnd = new Date(periodEndMs).toISOString().slice(0, 10);
    periods.push({
      from: cursor,
      to: periodEnd,
      days_inclusive: Math.floor((periodEndMs - cursorMs) / DAY_MS) + 1,
      annual_rate_percent: rate.annual_rate_percent,
      legal_basis: rate.legal_basis,
      source_url: rate.source_url
    });
    cursorMs = periodEndMs + DAY_MS;
  }

  return { status: 'verified', from: start, to: end, periods };
}

export function collectionRateCatalog() {
  return {
    inkasso_fee_periods: INKASSO_FEE_PERIODS.map(period => ({ ...period })),
    delay_interest_periods: DELAY_INTEREST_PERIODS.map(period => ({ ...period }))
  };
}
