const VEHICLE = new Set(['vehicle_repair', 'auto_repair', 'car_workshop', 'bilverksted']);
const ELECTRICAL = new Set(['electrical', 'electrician', 'elektriker']);
const PLUMBING = new Set(['plumbing', 'vvs', 'plumber', 'rorlegger', 'rørlegger']);
const HEAT_PUMP = new Set(['heat_pump', 'heatpump', 'varmepumpe']);
const INSTALLATION = new Set(['installation', 'installation_service', 'montering']);
const MOVING = new Set(['moving', 'moving_service', 'flytting', 'flyttebyra', 'flyttebyrå']);
const CLEANING = new Set(['cleaning', 'cleaning_service', 'renhold', 'flyttevask']);

const VEHICLE_COMPLAINT_CONTEXTS = new Set(['warranty', 'guarantee', 'complaint', 'consumer_purchase_remedy', 'seller_remedy', 'reklamasjon', 'garanti']);
const VEHICLE_INSPECTION_CONTEXTS = new Set(['periodic_inspection', 'pkk', 'eu_control', 'eu-kontroll']);
const VEHICLE_COLLISION_CONTEXTS = new Set(['collision_repair', 'major_collision_repair', 'skadereparasjon']);

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function profile({ id, label, package_id, primary_framework, secondary_frameworks = [], specialist_registers = [], notes = [] }) {
  return Object.freeze({
    status: 'ready',
    id,
    customer_label: label,
    package_id,
    primary_framework,
    secondary_frameworks: [...secondary_frameworks],
    specialist_registers: [...specialist_registers],
    notes: [...notes],
    questions: []
  });
}

function clarification({ id, label, reason, questions = [], relevant_frameworks = [] }) {
  return {
    status: 'needs_clarification',
    id,
    customer_label: label,
    package_id: null,
    reason,
    questions,
    relevant_frameworks
  };
}

export function resolveServiceLegalProfile({ route, facts = {} } = {}) {
  const baseRoute = norm(route);
  const industry = norm(facts.industry);
  const transactionNature = norm(facts.transaction_nature);
  const vehicleContext = norm(facts.vehicle_service_context ?? facts.service_context);

  if (facts.financing_detected === true || transactionNature === 'credit') {
    return clarification({
      id: 'consumer_credit_detected',
      label: 'Kjøp med kreditt eller finansiering',
      reason: 'Kredittkostnader og finansieringsvilkår krever finansavtaleloven og skal ikke vurderes med vanlig vare-/tjenestepakke alene.',
      questions: ['Gjelder beløpet selve varen/tjenesten, eller renter, gebyrer eller andre kostnader i en kredittavtale?'],
      relevant_frameworks: ['finansavtaleloven', 'forbrukerkjøpsloven']
    });
  }

  if (baseRoute === 'goods') {
    return profile({
      id: 'goods_purchase',
      label: 'Varekjøp',
      package_id: 'goods',
      primary_framework: 'forbrukerkjøpsloven',
      secondary_frameworks: ['markedsføringsloven', 'prisopplysningsforskriften', 'bokføringsforskriften'],
      notes: ['Montering som bare er en del av et samlet varekjøp skal ikke automatisk flyttes til håndverkertjenesteloven.']
    });
  }

  if (baseRoute === 'handcraft_service' && VEHICLE.has(industry)) {
    if (VEHICLE_COMPLAINT_CONTEXTS.has(vehicleContext)) {
      return clarification({
        id: 'vehicle_consumer_purchase_remedy',
        label: 'Bil – reklamasjon eller garanti etter kjøp',
        reason: 'Når verkstedarbeidet skjer som selgerens avhjelp av en mangel ved et bilkjøp, kan forbrukerkjøpsloven være hovedregelverket. Fakturasjekk skal ikke automatisk bruke håndverkertjenesteloven på denne situasjonen.',
        questions: ['Bestilte du reparasjonen som en vanlig betalt verkstedtjeneste, eller leverte du bilen inn som reklamasjon/garantisak mot selger?'],
        relevant_frameworks: ['forbrukerkjøpsloven', 'eventuell garanti', 'verkstedforskriften']
      });
    }

    if (VEHICLE_INSPECTION_CONTEXTS.has(vehicleContext)) {
      return profile({
        id: 'vehicle_periodic_inspection',
        label: 'EU-kontroll / periodisk kjøretøykontroll',
        package_id: 'vehicle_inspection',
        primary_framework: 'forskrift om periodisk kontroll av kjøretøy',
        secondary_frameworks: ['prisopplysningsforskriften', 'markedsføringsloven', 'bokføringsforskriften'],
        specialist_registers: ['vegvesen_control_body'],
        notes: ['Periodisk kontroll er ikke det samme som en vanlig reparasjon og skal ikke automatisk få håndverkertjenestelovens prisregler.']
      });
    }

    const collision = VEHICLE_COLLISION_CONTEXTS.has(vehicleContext) || facts.major_collision_repair === true;
    return profile({
      id: collision ? 'vehicle_collision_repair' : 'vehicle_paid_repair',
      label: collision ? 'Bil – skadereparasjon' : 'Bilverksted og service',
      package_id: 'vehicle_repair',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: collision
        ? ['verkstedforskriften § 14a', 'verkstedforskriften', 'prisopplysningsforskriften', 'bokføringsforskriften']
        : ['verkstedforskriften', 'prisopplysningsforskriften', 'bokføringsforskriften'],
      specialist_registers: ['vegvesen_workshop'],
      notes: ['Verkstedgodkjenning og kontrakts-/prisregler er separate kontrollspor.']
    });
  }

  if (baseRoute === 'handcraft_service' && ELECTRICAL.has(industry)) {
    return profile({
      id: 'electrical_work',
      label: 'Elektrikerarbeid',
      package_id: 'electrical_work',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: ['forskrift om elektroforetak og kvalifikasjonskrav', 'forskrift om elektriske lavspenningsanlegg', 'prisopplysningsforskriften', 'bokføringsforskriften'],
      specialist_registers: ['dsb_elvirksomhet'],
      notes: ['Registrering i Elvirksomhetsregisteret og samsvarsdokumentasjon er egne fag-/sikkerhetsspor og skal ikke blandes sammen med prisavvik.']
    });
  }

  if (baseRoute === 'handcraft_service' && PLUMBING.has(industry)) {
    return profile({
      id: 'plumbing_vvs',
      label: 'Rørlegger og VVS',
      package_id: 'plumbing_vvs',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: ['byggteknisk forskrift ved relevante vann-/avløpsarbeider', 'prisopplysningsforskriften', 'bokføringsforskriften'],
      notes: ['Sentral godkjenning er frivillig og skal aldri presenteres som et generelt lovkrav for rørleggeren.']
    });
  }

  if (baseRoute === 'handcraft_service' && HEAT_PUMP.has(industry)) {
    return profile({
      id: 'heat_pump_installation',
      label: 'Varmepumpe – montering og installasjon',
      package_id: 'heat_pump_installation',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: ['f-gassregelverket der utstyret omfattes', 'elregelverket der elektrisk installasjon omfattes', 'prisopplysningsforskriften', 'bokføringsforskriften'],
      specialist_registers: ['fgas_certification', 'dsb_elvirksomhet'],
      notes: ['F-gass- og elkrav brukes bare når den konkrete installasjonen faktisk omfattes.']
    });
  }

  if (baseRoute === 'handcraft_service' && INSTALLATION.has(industry)) {
    if (transactionNature === 'purchase_dominant') {
      return clarification({
        id: 'installation_purchase_boundary',
        label: 'Vare med montering',
        reason: 'Når montering inngår i en avtale som samlet sett må regnes som et kjøp, kan forbrukerkjøpsloven være hovedregelverket i stedet for håndverkertjenesteloven.',
        questions: ['Var monteringen en egen bestilt tjeneste, eller var den en del av kjøpet og leveringen av varen?'],
        relevant_frameworks: ['forbrukerkjøpsloven', 'håndverkertjenesteloven § 2']
      });
    }
    return profile({
      id: 'standalone_installation',
      label: 'Montering og installasjon',
      package_id: 'installation_service',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: ['prisopplysningsforskriften', 'bokføringsforskriften'],
      notes: ['Hvis avtalen samlet sett er et varekjøp, må saken rutes til varekjøpssporet.']
    });
  }

  if (baseRoute === 'handcraft_service') {
    return profile({
      id: 'home_handcraft',
      label: 'Håndverk og arbeid på bolig/ting',
      package_id: 'home_handcraft',
      primary_framework: 'håndverkertjenesteloven',
      secondary_frameworks: ['prisopplysningsforskriften', 'bokføringsforskriften'],
      notes: ['Nyoppføring av bolig og full ombygging må fortsatt stoppes/rutes til bustadoppføringslova før juridisk analyse.']
    });
  }

  if (baseRoute === 'service_quote' && MOVING.has(industry)) {
    return profile({
      id: 'moving_service',
      label: 'Flyttetjeneste',
      package_id: 'moving_service',
      primary_framework: 'avtalen mellom partene',
      secondary_frameworks: ['prisopplysningsforskriften', 'markedsføringsloven', 'bokføringsforskriften'],
      notes: ['Håndverkertjenesteloven gjelder ikke for flytting.', 'Vegfraktloven gjelder uttrykkelig ikke befordring av flyttegods.']
    });
  }

  if (baseRoute === 'service_quote' && CLEANING.has(industry)) {
    return profile({
      id: 'cleaning_service',
      label: 'Renholdstjeneste',
      package_id: 'cleaning_service',
      primary_framework: 'avtalen mellom partene',
      secondary_frameworks: ['prisopplysningsforskriften', 'markedsføringsloven', 'forskrift om offentlig godkjenning av renholdsvirksomheter', 'bokføringsforskriften'],
      specialist_registers: ['arbeidstilsynet_cleaning'],
      notes: ['Godkjenningsstatus er et separat registerspor og er ikke det samme som at en fakturapost er riktig eller feil.']
    });
  }

  if (baseRoute === 'service_quote' && INSTALLATION.has(industry)) {
    if (!transactionNature) {
      return clarification({
        id: 'installation_contract_type_unknown',
        label: 'Montering og installasjon',
        reason: 'Det må avklares om dette er en selvstendig tjeneste eller montering som del av et samlet varekjøp.',
        questions: ['Var hovedavtalen kjøp av en vare med montering, eller bestilte du monteringen som en egen tjeneste?'],
        relevant_frameworks: ['forbrukerkjøpsloven', 'håndverkertjenesteloven']
      });
    }
  }

  if (baseRoute === 'service_quote') {
    return profile({
      id: 'other_service',
      label: 'Annen forbrukertjeneste',
      package_id: 'other_service',
      primary_framework: 'avtalen mellom partene',
      secondary_frameworks: ['prisopplysningsforskriften', 'markedsføringsloven', 'bokføringsforskriften'],
      notes: ['Ingen generell tjenestelov skal antas å gjelde bare fordi fakturaen gjelder en tjeneste.']
    });
  }

  return clarification({
    id: 'legal_profile_unresolved',
    label: 'Sakstype ikke sikkert klassifisert',
    reason: 'Fakturasjekk kan ikke velge riktig juridisk hovedspor sikkert.',
    questions: ['Hva gjelder fakturaen, og hvorfor ble varen eller tjenesten bestilt?']
  });
}

export function legalRoutingCatalog() {
  return Object.freeze({
    supported_industry_aliases: {
      vehicle: [...VEHICLE],
      electrical: [...ELECTRICAL],
      plumbing: [...PLUMBING],
      heat_pump: [...HEAT_PUMP],
      installation: [...INSTALLATION],
      moving: [...MOVING],
      cleaning: [...CLEANING]
    }
  });
}
