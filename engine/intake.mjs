const SUPPORTED = new Set(['handcraft_service', 'goods', 'service_quote']);
const UNSUPPORTED = new Map([
  ['business_purchase', 'Bedriftskjøp/B2B er ikke støttet i forbruker-V1.'],
  ['new_building', 'Nyoppføring av bolig krever eget regelspor før saken kan analyseres.'],
  ['tax_public_fee', 'Skatt, gebyrer og offentlige krav ligger utenfor forbruker-V1.'],
  ['digital_service', 'Digitale ytelser krever eget regelspor før saken kan analyseres.'],
  ['insurance_settlement', 'Komplekse forsikringsoppgjør ligger utenfor forbruker-V1.']
]);

export function classifyIntake(input = {}) {
  const buyerType = input.buyer_type ?? 'unknown';
  const subject = input.subject ?? 'unknown';
  const documents = new Set(input.documents ?? []);

  if (buyerType === 'business') {
    return {
      supported: false,
      status: 'stop',
      route: 'business_purchase',
      reason: UNSUPPORTED.get('business_purchase'),
      questions: []
    };
  }

  if (buyerType !== 'consumer') {
    return {
      supported: false,
      status: 'needs_clarification',
      route: null,
      reason: 'Det må avklares om kjøperen er privatperson/forbruker eller virksomhet.',
      questions: ['Kjøpte du varen eller tjenesten hovedsakelig som privatperson?']
    };
  }

  if (UNSUPPORTED.has(subject)) {
    return {
      supported: false,
      status: 'stop',
      route: subject,
      reason: UNSUPPORTED.get(subject),
      questions: []
    };
  }

  if (!SUPPORTED.has(subject)) {
    return {
      supported: false,
      status: 'needs_clarification',
      route: null,
      reason: 'Sakstypen kan ikke klassifiseres sikkert i et aktivt V1-regelspor.',
      questions: ['Gjelder fakturaen kjøp av en vare, håndverkertjeneste eller en annen tjeneste med pristilbud?']
    };
  }

  const required = ['invoice'];
  const recommended = [];
  const questions = [];

  if (!documents.has('invoice')) questions.push('Last opp fakturaen som skal kontrolleres.');

  if (subject === 'handcraft_service') {
    recommended.push('quote_or_agreement');
    if (!documents.has('quote') && !documents.has('agreement')) {
      questions.push('Har du tilbud, prisoverslag, ordrebekreftelse eller annen avtale om pris/omfang?');
    }
  }

  if (subject === 'goods') {
    recommended.push('order_confirmation');
    if (!documents.has('order_confirmation') && !documents.has('agreement')) {
      questions.push('Har du ordrebekreftelse, kvittering eller annen dokumentasjon på avtalt pris og antall?');
    }
  }

  if (subject === 'service_quote') {
    recommended.push('quote');
    if (!documents.has('quote')) {
      questions.push('Har du skriftlig pristilbud eller annen dokumentasjon på den oppgitte prisen?');
    }
  }

  return {
    supported: documents.has('invoice'),
    status: documents.has('invoice') ? 'supported' : 'needs_document',
    route: subject,
    reason: documents.has('invoice')
      ? 'Saken kan sendes videre til dokument- og regelanalyse.'
      : 'Faktura mangler. Analyse skal ikke starte uten fakturadokumentet.',
    required_documents: required,
    recommended_documents: recommended,
    questions
  };
}
