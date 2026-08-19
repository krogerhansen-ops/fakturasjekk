export function normalizeOrganizationNumber(value) {
  const text = String(value ?? '').toUpperCase().trim();
  const compact = text
    .replace(/^NO\s*/, '')
    .replace(/\s*MVA$/, '')
    .replace(/[ .-]/g, '');
  return /^\d{9}$/.test(compact) ? compact : null;
}

export function organizationNumberChecksumValid(value) {
  const org = normalizeOrganizationNumber(value);
  if (!org) return false;
  const digits = [...org].map(Number);
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * digits[index], 0);
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  return control !== 10 && control === digits[8];
}

export function normalizeCompanyName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleUpperCase('nb-NO')
    .replace(/[.,;:()\[\]{}'"`´]/g, ' ')
    .replace(/[\s-]+/g, ' ')
    .trim();
}
