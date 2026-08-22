export const REGULATED_SECTOR_VALUES = Object.freeze([
  'electricity_energy',
  'telecom',
  'insurance',
  'taxi',
  'passenger_transport',
  'healthcare_public',
  'digital_service',
  'parking',
  'package_travel',
  'housing_rent',
  'dental',
  'funeral'
]);

const LABELS = Object.freeze({
  electricity_energy: 'Strøm, nettleie eller energifaktura',
  telecom: 'Mobil, bredbånd eller annen ekomtjeneste',
  insurance: 'Forsikring',
  taxi: 'Drosjetjeneste',
  passenger_transport: 'Persontransport',
  healthcare_public: 'Helse-, pasient- eller offentlig betalingskrav',
  digital_service: 'Digital ytelse eller digital abonnementstjeneste',
  parking: 'Parkering eller kontrollsanksjon',
  package_travel: 'Pakkereise eller sammensatt reisearrangement',
  housing_rent: 'Boligleie eller krav fra utleier',
  dental: 'Tannhelsetjeneste',
  funeral: 'Gravferdstjeneste'
});

const ALLOWED = new Set(REGULATED_SECTOR_VALUES);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveRegulatedSectorGuard(facts = {}) {
  const sector = normalize(facts.regulated_sector);
  if (!sector || !ALLOWED.has(sector)) return null;

  return {
    status: 'needs_clarification',
    id: `regulated_${sector}`,
    customer_label: LABELS[sector],
    package_id: null,
    reason: 'Denne fakturatypen har særregler som Fakturasjekk ikke har en aktivert og kvalitetssikret automatisk regelpakke for ennå.',
    questions: ['Saken er stoppet før juridisk konklusjon. Den må behandles i et eget regelspor før Fakturasjekk kan vurdere kravet automatisk.'],
    relevant_frameworks: []
  };
}

export function assertRegulatedSectorValue(value) {
  const normalized = normalize(value);
  if (!ALLOWED.has(normalized)) throw new Error('Unknown regulated sector value.');
  return normalized;
}
