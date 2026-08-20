const SECTORS = Object.freeze({
  electricity_energy: {
    label: 'Strøm, nettleie eller energifaktura',
    frameworks: ['energiloven', 'forskrift om kraftomsetning og nettjenester', 'eventuelle strømavtaleregler'],
    reason: 'Strøm- og nettfakturering har egne måle-, avregnings- og faktureringsregler og skal ikke vurderes som en vanlig tjenestefaktura.'
  },
  telecom: {
    label: 'Mobil, bredbånd eller annen ekomtjeneste',
    frameworks: ['ekomloven', 'ekomforskriften'],
    reason: 'Elektroniske kommunikasjonstjenester har egne sluttbruker- og betalingsregler og skal ikke vurderes med en generell tjenestepakke.'
  },
  insurance: {
    label: 'Forsikringspremie eller forsikringskrav',
    frameworks: ['forsikringsavtaleloven'],
    reason: 'Forsikring har egne premie-, varslings- og opphørsregler og skal ikke vurderes med en generell tjenestepakke.'
  },
  taxi: {
    label: 'Drosjetjeneste',
    frameworks: ['prisopplysningsforskriften kapittel 7B', 'drosjeregelverket'],
    reason: 'Drosje har egne regler om pristilbud og spesifisert kvittering og krever et eget regelspor.'
  },
  passenger_transport: {
    label: 'Persontransport',
    frameworks: ['transportregelverk', 'eventuelle sektorregler', 'merverdiavgiftsregler'],
    reason: 'Persontransport kan være underlagt særregler og redusert MVA-sats. Fakturasjekk skal ikke velge generell tjenestepakke uten sikker klassifisering.'
  },
  healthcare_public: {
    label: 'Helse-, pasient- eller offentlig betalingskrav',
    frameworks: ['sektorspesifikt helse-/betalingsregelverk'],
    reason: 'Offentlige og helserelaterte betalingskrav kan ha eget hjemmels- og gebyrgrunnlag og må klassifiseres særskilt.'
  }
});

const ALIASES = new Map([
  ['electricity', 'electricity_energy'], ['energy', 'electricity_energy'], ['power', 'electricity_energy'], ['strom', 'electricity_energy'], ['strøm', 'electricity_energy'], ['nettleie', 'electricity_energy'],
  ['telecom', 'telecom'], ['ekom', 'telecom'], ['mobile', 'telecom'], ['mobil', 'telecom'], ['broadband', 'telecom'], ['bredband', 'telecom'], ['bredbånd', 'telecom'],
  ['insurance', 'insurance'], ['forsikring', 'insurance'], ['insurance_premium', 'insurance'],
  ['taxi', 'taxi'], ['drosje', 'taxi'],
  ['passenger_transport', 'passenger_transport'], ['persontransport', 'passenger_transport'],
  ['healthcare_public', 'healthcare_public'], ['healthcare', 'healthcare_public'], ['patient_fee', 'healthcare_public'], ['public_fee', 'healthcare_public']
]);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveRegulatedSectorGuard(facts = {}) {
  const explicit = normalize(facts.regulated_sector);
  const industry = normalize(facts.industry);
  const sectorId = SECTORS[explicit] ? explicit : ALIASES.get(industry);
  if (!sectorId) return null;
  const sector = SECTORS[sectorId];
  return {
    status: 'needs_clarification',
    id: `regulated_${sectorId}`,
    customer_label: sector.label,
    package_id: null,
    reason: sector.reason,
    questions: ['Denne fakturatypen har et eget regelverk som Fakturasjekk ikke har aktivert for automatisk juridisk konklusjon ennå.'],
    relevant_frameworks: [...sector.frameworks]
  };
}

export function regulatedSectorDefinitions() {
  return SECTORS;
}
