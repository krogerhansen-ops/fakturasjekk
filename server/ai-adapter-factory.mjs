import { createStructuredDocumentExtractorProvider, createStructuredResponseInterpreterProvider } from './ai-provider-adapters.mjs';
import { createValidatedExtractor } from './extractor-contract.mjs';
import { createValidatedResponseInterpreter } from './response-interpreter-contract.mjs';

export function createValidatedAiAdapters({
  documentClient,
  responseClient = documentClient,
  extractionCatalog,
  documentModel = null,
  responseModel = null
} = {}) {
  if (!documentClient?.runStructured) throw new Error('Structured document AI client is required.');
  if (!responseClient?.runStructured) throw new Error('Structured response AI client is required.');
  if (!extractionCatalog?.fields) throw new Error('Extraction field catalog is required.');

  const rawExtractor = createStructuredDocumentExtractorProvider({ client: documentClient, catalog: extractionCatalog, model: documentModel });
  const extractor = createValidatedExtractor({ provider: rawExtractor, catalog: extractionCatalog });
  const rawResponseInterpreter = createStructuredResponseInterpreterProvider({ client: responseClient, model: responseModel });
  const responseInterpreter = createValidatedResponseInterpreter({ provider: rawResponseInterpreter });
  return { extractor, responseInterpreter };
}
