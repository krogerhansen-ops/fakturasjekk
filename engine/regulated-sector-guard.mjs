const SECTORS = Object.freeze({
  electricity_energy: {
    label: 'Strøm, nettleie eller energifaktura',
    frameworks: ['energiloven', 'forskrift om kraftomsetning og nettjenester', 'prisopplysningsforskriften kapittel 6'],
    reason: 'Strøm- og nettfakturering har egne måle-, avregnings-, pris- og faktureringsregler og skal ikke vurderes som en vanlig tjenestefaktura.'
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
  },
  digital_service: {
    label: 'Digital ytelse eller digital abonnementstjeneste',
    frameworks: ['digitalytelsesloven'],
    reason: 'Digitale ytelser har en egen forbrukerlov med særregler om pris, fakturagebyr, løpende prisendringer, oppsigelse og betaling.'
  },
  parking: {
    label: 'Parkering eller kontrollsanksjon',
    frameworks: ['parkeringsforskriften', 'eventuelt avtale-/betalingsregelverk for ordinær parkering'],
    reason: 'Kontrollsanksjoner og vilkårsparkering har egne beløp, frister og vilkår og skal ikke vurderes som en vanlig tjenestefaktura.'
  },
  package_travel: {
    label: 'Pakkereise eller sammensatt reisearrangement',
    frameworks: ['pakkereiseloven'],
    reason: 'Pakkereiser har egne regler om samlet pris, gebyrer, betalingsvilkår, avbestilling og reisegaranti.'
  },
  housing_rent: {
    label: 'Boligleie eller krav fra utleier',
    frameworks: ['husleieloven'],
    reason: 'Husleie har egne regler om leie, tillegg, forfall og betalingsmåte og skal ikke behandles som en vanlig tjenestefaktura.'
  },
  dental: {
    label: 'Tannhelsetjeneste',
    frameworks: ['prisopplysningsforskriften § 18', 'relevant helse-/refusjonsregelverk'],
    reason: 'Tannhelsetjenester har særregler om pristilbud, blant annet ved forventet totalpris over terskelen i prisopplysningsforskriften.'
  },
  funeral: {
    label: 'Gravferdstjeneste',
    frameworks: ['prisopplysningsforskriften §§ 15–17', 'relevant gravferds-/stønadsregelverk'],
    reason: 'Gravferdstjenester har særskilte krav til prisoversikt, pristilbud og opplysninger om tillegg og refusjoner.'
  }
});

const ALIASES = new Map([
  ['electricity', 'electricity_energy'], ['energy', 'electricity_energy'], ['power', 'electricity_energy'], ['strom', 'electricity_energy'], ['strøm', 'electricity_energy'], ['nettleie', 'electricity_energy'],
  ['telecom', 'telecom'], ['ekom', 'telecom'], ['mobile', 'telecom'], ['mobil', 'telecom'], ['broadband', 'telecom'], ['bredband', 'telecom'], ['bredbånd', 'telecom'],
  ['insurance', 'insurance'], ['forsikring', 'insurance'], ['insurance_premium', 'insurance'],
  ['taxi', 'taxi'], ['drosje', 'taxi'],
  ['passenger_transport', 'passenger_transport'], ['persontransport', 'passenger_transport'],
  ['healthcare_public', 'healthcare_public'], ['healthcare', 'healthcare_public'], ['patient_fee', 'healthcare_public'], ['public_fee', 'healthcare_public'],
  ['digital_service', 'digital_service'], ['digital', 'digital_service'], ['software_subscription', 'digital_service'], ['streaming', 'digital_service'],
  ['parking', 'parking'], ['parkering', 'parking'], ['parking_sanction', 'parking'], ['kontrollsanksjon', 'parking'],
  ['package_travel', 'package_travel'], ['pakkereise', 'package_travel'], ['travel_package', 'package_travel'],
  ['housing_rent', 'housing_rent'], ['rent', 'housing_rent'], ['husleie', 'housing_rent'], ['boligleie', 'housing_rent'],
  ['dental', 'dental'], ['tannlege', 'dental'], ['tannhelse', 'dental'],
  ['funeral', 'funeral'], ['gravferd', 'funeral'], ['begravelse', 'funeral']
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
