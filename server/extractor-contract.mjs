function validValue(value, definition) {
  switch (definition.type) {
    case 'number': return Number.isFinite(Number(value));
    case 'string': return typeof value === 'string' && value.trim().length > 0;
    case 'date': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'boolean': return typeof value === 'boolean';
    case 'enum': return typeof value === 'string' && (definition.values ?? []).includes(value);
    case 'string_array': return Array.isArray(value) && value.every(v => typeof v === 'string');
    case 'line_items':
      return Array.isArray(value) && value.length <= 500 && value.every(line => {
        if (!line || typeof line !== 'object' || typeof line.description !== 'string' || !line.description.trim()) return false;
        for (const key of ['quantity', 'unit_price', 'amount', 'vat_rate', 'vat_amount']) {
          if (line[key] != null && !Number.isFinite(Number(line[key]))) return false;
        }
        return true;
      });
    default: return false;
  }
}

export function validateExtractorEnvelope(extraction = {}, catalog = {}) {
  const allowed = catalog.fields ?? {};
  const fields = {};
  const contract_errors = [];

  if (!extraction.fields || typeof extraction.fields !== 'object' || Array.isArray(extraction.fields)) {
    return { valid: false, fields: {}, contract_errors: ['Extractor-respons mangler fields-objekt.'] };
  }

  for (const [name, item] of Object.entries(extraction.fields)) {
    const definition = allowed[name];
    if (!definition) {
      contract_errors.push(`Ukjent extractor-felt: ${name}`);
      continue;
    }
    if (!item || typeof item !== 'object') {
      contract_errors.push(`Extractor-felt ${name} mangler struktur.`);
      continue;
    }
    if (!validValue(item.value, definition)) {
      contract_errors.push(`Extractor-felt ${name} har ugyldig verdi/type.`);
      continue;
    }
    if (!item.source_document_id || item.source_page == null) {
      contract_errors.push(`Extractor-felt ${name} mangler dokument-/sidekilde.`);
      continue;
    }
    fields[name] = {
      value: item.value,
      confidence: item.confidence,
      source_document_id: item.source_document_id,
      source_page: item.source_page,
      raw_text: item.raw_text ?? null
    };
  }

  return { valid: contract_errors.length === 0, fields, contract_errors };
}

export function createValidatedExtractor({ provider, catalog } = {}) {
  if (!provider?.extract) throw new Error('Extractor provider requires extract.');
  return {
    async extract(input) {
      const raw = await provider.extract(input);
      const checked = validateExtractorEnvelope(raw, catalog);
      return { fields: checked.fields, contract_errors: checked.contract_errors };
    }
  };
}

export function extractorInstructions(catalog = {}) {
  const fieldNames = Object.keys(catalog.fields ?? {}).join(', ');
  return [
    'Returner kun strukturert dokumentfakta. Ikke gjør juridiske vurderinger.',
    `Tillatte felt: ${fieldNames}.`,
    'Ikke returner felt som ikke står i katalogen.',
    'Ikke gjett manglende eller tvetydige verdier; utelat dem.',
    'Hvert felt må ha confidence mellom 0 og 1, source_document_id og source_page.',
    'Boolean-felt kan bare settes når kilden eksplisitt støtter true/false; fravær av tekst er ikke automatisk false.',
    'Beløp returneres som tall uten valutasymbol eller tusenskilletegn.',
    'Datoer returneres som YYYY-MM-DD når datoen kan leses sikkert.',
    'Ingen lovnavn, paragrafer, rettslige konklusjoner eller råd skal genereres i extractor-laget.'
  ].join('\n');
}
