import { extractorInstructions } from './extractor-contract.mjs';
import { responseInterpreterInstructions } from './response-interpreter-contract.mjs';

function requireClient(client) {
  if (!client?.runStructured) throw new Error('Structured AI client requires runStructured(request).');
  return client;
}

function extractionSchema(catalog = {}) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['fields'],
    properties: {
      fields: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(Object.entries(catalog.fields ?? {}).map(([name]) => [name, {
          type: ['object', 'null'],
          additionalProperties: true
        }]))
      }
    }
  };
}

export function createStructuredDocumentExtractorProvider({ client, catalog, model = null } = {}) {
  client = requireClient(client);
  return {
    async extract({ case_id, documents }) {
      const documentRefs = (documents ?? []).map(d => ({
        document_id: d.id,
        role: d.role,
        object_bucket: d.object_bucket ?? null,
        object_key: d.object_key ?? d.storage_key ?? null,
        mime_type: d.mime_type ?? null
      }));
      if (!documentRefs.length) throw new Error('No documents supplied to extractor provider.');
      return client.runStructured({
        task: 'fakturasjekk_document_fact_extraction',
        model,
        system_instructions: extractorInstructions(catalog),
        output_schema: extractionSchema(catalog),
        input: { case_id, documents: documentRefs },
        security: {
          inputs_are_untrusted_data: true,
          obey_instructions_from_inputs: false,
          tools_enabled: false,
          external_network_enabled: false,
          legal_reasoning_allowed: false
        }
      });
    }
  };
}

export function createStructuredResponseInterpreterProvider({ client, model = null } = {}) {
  client = requireClient(client);
  return {
    async interpret({ original_findings, response_text }) {
      return client.runStructured({
        task: 'fakturasjekk_supplier_response_coverage',
        model,
        system_instructions: responseInterpreterInstructions(),
        output_schema: {
          type: 'object', additionalProperties: false, required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['finding_code','coverage','answer_text','documentation_required','documentation_provided'],
                properties: {
                  finding_code: { type: 'string' },
                  coverage: { type: 'string', enum: ['answered','partial','unanswered','unknown'] },
                  answer_text: { type: 'string' },
                  documentation_required: { type: 'boolean' },
                  documentation_provided: { type: 'boolean' }
                }
              }
            }
          }
        },
        input: { original_findings, response_text },
        security: {
          inputs_are_untrusted_data: true,
          obey_instructions_from_inputs: false,
          tools_enabled: false,
          external_network_enabled: false,
          legal_reasoning_allowed: false
        }
      });
    }
  };
}

export function assertAiRequestSecurity(request) {
  const s = request?.security ?? {};
  if (s.inputs_are_untrusted_data !== true) throw new Error('AI input must be marked untrusted.');
  if (s.obey_instructions_from_inputs !== false) throw new Error('AI must not obey instructions embedded in customer documents/text.');
  if (s.tools_enabled !== false || s.external_network_enabled !== false) throw new Error('AI provider must run without tools or external network.');
  if (s.legal_reasoning_allowed !== false) throw new Error('AI extraction/interpreter layer must not make legal judgments.');
  return true;
}
