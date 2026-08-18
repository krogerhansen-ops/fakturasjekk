function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function close(a, b, tolerance) { return a != null && b != null && Math.abs(a - b) <= tolerance; }

export function checkInvoiceMath({ lines = [], stated_subtotal = null, stated_vat = null, stated_total = null, tolerance = 0.02 } = {}) {
  const line_checks = [];
  let computableLineSum = 0;
  let computableCount = 0;
  let calculatedVatFromLines = 0;
  let vatLineCount = 0;

  lines.forEach((line, index) => {
    const quantity = num(line.quantity);
    const unitPrice = num(line.unit_price);
    const statedAmount = num(line.amount);
    const expectedAmount = quantity != null && unitPrice != null ? round2(quantity * unitPrice) : null;
    const effectiveAmount = statedAmount ?? expectedAmount;
    if (effectiveAmount != null) { computableLineSum += effectiveAmount; computableCount += 1; }

    const vatRate = num(line.vat_rate);
    const statedLineVat = num(line.vat_amount);
    const expectedLineVat = vatRate != null && effectiveAmount != null ? round2(effectiveAmount * vatRate / 100) : null;
    if (expectedLineVat != null) { calculatedVatFromLines += expectedLineVat; vatLineCount += 1; }

    line_checks.push({
      index,
      description: String(line.description ?? ''),
      expected_amount: expectedAmount,
      stated_amount: statedAmount,
      amount_matches: expectedAmount == null || statedAmount == null ? null : close(expectedAmount, statedAmount, tolerance),
      vat_rate: vatRate,
      expected_vat: expectedLineVat,
      stated_vat: statedLineVat,
      vat_matches: expectedLineVat == null || statedLineVat == null ? null : close(expectedLineVat, statedLineVat, tolerance)
    });
  });

  const calculated_subtotal = computableCount === lines.length && lines.length > 0 ? round2(computableLineSum) : null;
  const subtotal = num(stated_subtotal);
  const vat = num(stated_vat);
  const total = num(stated_total);
  const calculated_vat = vatLineCount === lines.length && lines.length > 0 ? round2(calculatedVatFromLines) : null;
  const calculated_total_from_stated = subtotal != null && vat != null ? round2(subtotal + vat) : null;
  const calculated_total_from_lines = calculated_subtotal != null && vat != null ? round2(calculated_subtotal + vat) : null;

  const issues = [];
  for (const line of line_checks) {
    if (line.amount_matches === false) issues.push({ type: 'line_amount_mismatch', line_index: line.index, description: line.description, expected: line.expected_amount, stated: line.stated_amount });
    if (line.vat_matches === false) issues.push({ type: 'line_vat_mismatch', line_index: line.index, description: line.description, expected: line.expected_vat, stated: line.stated_vat });
  }
  if (calculated_subtotal != null && subtotal != null && !close(calculated_subtotal, subtotal, tolerance)) issues.push({ type: 'subtotal_mismatch', expected: calculated_subtotal, stated: subtotal });
  if (calculated_vat != null && vat != null && !close(calculated_vat, vat, Math.max(tolerance, 0.05))) issues.push({ type: 'vat_total_mismatch', expected: calculated_vat, stated: vat });
  if (calculated_total_from_stated != null && total != null && !close(calculated_total_from_stated, total, tolerance)) issues.push({ type: 'stated_total_mismatch', expected: calculated_total_from_stated, stated: total });
  if (calculated_total_from_lines != null && total != null && !close(calculated_total_from_lines, total, tolerance)) issues.push({ type: 'line_sum_total_mismatch', expected: calculated_total_from_lines, stated: total });

  return {
    line_checks,
    calculated_subtotal,
    calculated_vat,
    calculated_total_from_stated,
    calculated_total_from_lines,
    issues,
    valid: issues.length === 0,
    note: 'MVA-kontrollen sjekker kun regnestykket for satsene som er oppgitt i dokumentdataene; den avgjør ikke om riktig lovbestemt MVA-sats er brukt.'
  };
}
