const ORIGIN = 'https://data.brreg.no';
const API_BASE = `${ORIGIN}/enhetsregisteret/api`;
const V2_ACCEPT = 'application/vnd.brreg.enhetsregisteret.enhet.v2+json';

function safeText(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

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

function normalizeAddress(address) {
  if (!address || typeof address !== 'object') return null;
  const lines = Array.isArray(address.adresse) ? address.adresse.filter(v => typeof v === 'string' && v.trim()).slice(0, 4) : [];
  const out = {
    lines,
    postal_code: safeText(address.postnummer, 16) || null,
    postal_place: safeText(address.poststed, 80) || null,
    municipality: safeText(address.kommune, 80) || null,
    country_code: safeText(address.landkode, 4) || null
  };
  return Object.values(out).some(value => Array.isArray(value) ? value.length : value) ? out : null;
}

export function normalizeBrregEntity(payload = {}) {
  const org = normalizeOrganizationNumber(payload.organisasjonsnummer);
  if (!org) throw new Error('Brreg response is missing a valid organization number.');
  const name = safeText(payload.navn, 200);
  if (!name) throw new Error('Brreg response is missing entity name.');
  return {
    organization_number: org,
    name,
    organization_form: payload.organisasjonsform && typeof payload.organisasjonsform === 'object'
      ? {
          code: safeText(payload.organisasjonsform.kode, 16) || null,
          description: safeText(payload.organisasjonsform.beskrivelse, 120) || null
        }
      : null,
    registered_in_vat: payload.registrertIMvaregisteret === true,
    registered_in_business_register: payload.registrertIForetaksregisteret === true,
    bankrupt: payload.konkurs === true,
    under_liquidation: payload.underAvvikling === true,
    under_forced_liquidation_or_dissolution: payload.underTvangsavviklingEllerTvangsopplosning === true,
    deleted_date: safeText(payload.slettedato, 20) || null,
    registration_date: safeText(payload.registreringsdatoEnhetsregisteret, 20) || null,
    business_code: payload.naeringskode1 && typeof payload.naeringskode1 === 'object'
      ? {
          code: safeText(payload.naeringskode1.kode, 20) || null,
          description: safeText(payload.naeringskode1.beskrivelse, 180) || null
        }
      : null,
    business_address: normalizeAddress(payload.forretningsadresse),
    source: 'brreg_enhetsregisteret',
    source_version: 'v2'
  };
}

async function parseJson(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error('Brreg returned invalid JSON.'); }
}

export function createBrregClient({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Brreg client requires fetch.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('Brreg timeout must be between 1000 and 30000 ms.');

  async function request(url) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: V2_ACCEPT },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      const wrapped = new Error(`Brreg request failed: ${String(error?.message ?? 'network error').slice(0, 160)}`);
      wrapped.code = 'brreg_unavailable';
      throw wrapped;
    }
    return response;
  }

  async function lookupByOrganizationNumber(value) {
    const org = normalizeOrganizationNumber(value);
    if (!org || !organizationNumberChecksumValid(org)) {
      return { status: 'invalid_organization_number', entity: null, purge_cache: false };
    }
    const response = await request(`${API_BASE}/enheter/${encodeURIComponent(org)}`);
    if (response.status === 404) return { status: 'not_found', entity: null, purge_cache: false };
    if (response.status === 410) return { status: 'removed', entity: null, purge_cache: true };
    if (!response.ok) {
      const error = new Error(`Brreg lookup failed with HTTP ${response.status}.`);
      error.code = 'brreg_unavailable';
      throw error;
    }
    const payload = await parseJson(response);
    const entity = normalizeBrregEntity(payload);
    if (entity.organization_number !== org) {
      const error = new Error('Brreg returned a different organization number than requested.');
      error.code = 'brreg_identity_mismatch';
      throw error;
    }
    return { status: entity.deleted_date ? 'deleted' : 'verified', entity, purge_cache: false };
  }

  async function searchByExactName(value) {
    const requested = normalizeCompanyName(value);
    if (!requested || requested.length < 2 || requested.length > 180) {
      return { status: 'invalid_name', entity: null, candidates: 0, purge_cache: false };
    }
    const params = new URLSearchParams({ navn: String(value).trim(), navnMetodeForSoek: 'FORTLOEPENDE', size: '20', page: '0' });
    const response = await request(`${API_BASE}/enheter?${params}`);
    if (!response.ok) {
      const error = new Error(`Brreg name search failed with HTTP ${response.status}.`);
      error.code = 'brreg_unavailable';
      throw error;
    }
    const payload = await parseJson(response);
    const rows = Array.isArray(payload?._embedded?.enheter) ? payload._embedded.enheter : [];
    const exact = rows
      .filter(row => normalizeCompanyName(row?.navn) === requested)
      .map(row => normalizeBrregEntity(row));
    if (exact.length === 1) return { status: exact[0].deleted_date ? 'deleted' : 'verified', entity: exact[0], candidates: 1, purge_cache: false };
    if (exact.length > 1) return { status: 'ambiguous', entity: null, candidates: exact.length, purge_cache: false };
    return { status: rows.length ? 'no_exact_match' : 'not_found', entity: null, candidates: 0, purge_cache: false };
  }

  return {
    lookupByOrganizationNumber,
    searchByExactName,
    provider: 'brreg_enhetsregisteret',
    api_version: 'v2',
    origin: ORIGIN,
    cache_policy: 'no-store'
  };
}
