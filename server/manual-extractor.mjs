import { createValidatedExtractor } from './extractor-contract.mjs';

function clone(value) {
  return structuredClone(value);
}

function normalizeManualFields(fields = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('manual_fields must be an object.');
  }

  const normalized = {};
  for (const [name, item] of Object.entries(fields)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Manual field ${name} must include value and source metadata.`);
    }
    if (!Object.prototype.hasOwnProperty.call(item, 'value')) {
      throw new Error(`Manual field ${name} is missing value.`);
    }
    if (typeof item.source_document_id !== 'string' || !item.source_document_id.trim()) {
      throw new Error(`Manual field ${name} is missing source_document_id.`);
    }
    const sourcePage = Number(item.source_page);
    if (!Number.isInteger(sourcePage) || sourcePage < 1) {
      throw new Error(`Manual field ${name} requires source_page >= 1.`);
    }

    normalized[name] = {
      value: clone(item.value),
      confidence: 1,
      source_document_id: item.source_document_id.trim(),
      source_page: sourcePage,
      raw_text: null
    };
  }
  return normalized;
}

export function createManualExtractor({ catalog } = {}) {
  if (!catalog?.fields) throw new Error('Manual extractor requires extraction catalog.');

  const provider = {
    async extract(input = {}) {
      if (input.document_text || input.ocr_text || input.file_bytes || input.file_base64) {
        throw new Error('Manual extractor does not accept document text or file payloads.');
      }
      return { fields: normalizeManualFields(input.manual_fields ?? {}) };
    }
  };

  return createValidatedExtractor({ provider, catalog });
}

export function manualExtractorInstructions() {
  return [
    'Legg bare inn fakta som kan leses direkte fra dokumentet.',
    'Ikke legg inn juridiske vurderinger eller antakelser.',
    'Hvert faktum må peke på dokument-id og sidenummer.',
    'Ukjent eller tvetydig informasjon skal utelates.',
    'Boolean-felt skal bare registreres når dokumentasjonen uttrykkelig støtter verdien.',
    'Positive-only felt skal bare registreres som true når det er uttrykkelig dokumentert.'
  ];
}
