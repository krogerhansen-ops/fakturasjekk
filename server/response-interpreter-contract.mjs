export function validateResponseInterpretation(output = {}, originalFindings = []) {
  const allowedCodes = new Set(originalFindings.map(f => f.code).filter(Boolean));
  const errors = [];
  const items = [];

  if (!Array.isArray(output.items)) {
    return { valid: false, items: [], errors: ['Tolkerespons mangler items-liste.'] };
  }

  for (const item of output.items) {
    if (!item || typeof item !== 'object') { errors.push('Ugyldig svarpunkt.'); continue; }
    if (!allowedCodes.has(item.finding_code)) { errors.push(`Ukjent funnreferanse fra tolker: ${item.finding_code ?? 'mangler'}`); continue; }
    if (!['answered', 'partial', 'unanswered', 'unknown'].includes(item.coverage)) { errors.push(`Ugyldig coverage for ${item.finding_code}.`); continue; }
    const answerText = typeof item.answer_text === 'string' ? item.answer_text.slice(0, 8000) : '';
    items.push({
      finding_code: item.finding_code,
      coverage: item.coverage,
      answer_text: answerText,
      documentation_required: item.documentation_required === true,
      documentation_provided: item.documentation_provided === true
    });
  }

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.finding_code)) errors.push(`Duplikat funnreferanse: ${item.finding_code}`);
    seen.add(item.finding_code);
  }

  return { valid: errors.length === 0, items, errors };
}

export function createValidatedResponseInterpreter({ provider } = {}) {
  if (!provider?.interpret) throw new Error('Response interpreter provider requires interpret.');
  return {
    async interpret({ original_findings, response_text }) {
      if (typeof response_text !== 'string' || !response_text.trim()) throw new Error('Supplier response text is required.');
      const raw = await provider.interpret({ original_findings, response_text });
      const checked = validateResponseInterpretation(raw, original_findings);
      if (!checked.valid) {
        const error = new Error('Supplier response interpreter contract failed.');
        error.contract_errors = checked.errors;
        throw error;
      }
      return { items: checked.items };
    }
  };
}

export function responseInterpreterInstructions() {
  return [
    'Oppgaven er kun å kartlegge om leverandørens svar omtaler hvert allerede identifiserte kontrollpunkt.',
    'Ikke opprett nye juridiske funn, nye paragrafer eller nye påstander.',
    'Bruk bare finding_code-verdier som serveren har gitt deg.',
    'coverage skal være answered, partial, unanswered eller unknown.',
    'answered krever et konkret svar på punktet; kort generell avvisning er ikke automatisk et fullstendig svar.',
    'Hvis etterspurt dokumentasjon ikke faktisk fremgår som levert, sett documentation_provided=false.',
    'Ikke avgjør hvem som juridisk har rett. Dette laget måler kun svar-dekning.'
  ].join('\n');
}
