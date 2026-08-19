function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function base64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('OCR document reader must return Uint8Array.');
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

function pageText(imageResponse) {
  if (imageResponse?.error?.message) throw new Error(`Google Vision page OCR failed: ${String(imageResponse.error.message).slice(0, 200)}`);
  return String(imageResponse?.fullTextAnnotation?.text ?? '').trim();
}

function pageNumber(imageResponse) {
  const value = Number(imageResponse?.context?.pageNumber ?? imageResponse?.context?.page_number);
  if (!Number.isInteger(value) || value < 1) throw new Error('Google Vision PDF OCR response is missing a valid page number.');
  return value;
}

function chunkPages(start, end, size = 5) {
  const chunks = [];
  for (let first = start; first <= end; first += size) {
    const last = Math.min(end, first + size - 1);
    chunks.push(Array.from({ length: last - first + 1 }, (_, i) => first + i));
  }
  return chunks;
}

function verifiedPageBatch(file, expectedPages, expectedTotalPages = null) {
  const totalPages = Number(file?.totalPages ?? file?.total_pages);
  if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('Google Vision PDF OCR did not return a valid total page count.');
  if (expectedTotalPages != null && totalPages !== expectedTotalPages) throw new Error('Google Vision PDF OCR returned inconsistent total page count.');

  const responses = Array.isArray(file?.responses) ? file.responses : [];
  if (responses.length !== expectedPages.length) throw new Error('Google Vision PDF OCR returned incomplete page batch.');

  const pages = responses.map(response => ({ page: pageNumber(response), text: pageText(response) }));
  const actualNumbers = pages.map(item => item.page);
  if (new Set(actualNumbers).size !== actualNumbers.length) throw new Error('Google Vision PDF OCR returned duplicate page numbers.');
  if (actualNumbers.some((value, index) => value !== expectedPages[index])) {
    throw new Error('Google Vision PDF OCR returned unexpected page numbers.');
  }
  return { totalPages, pages };
}

export function createGoogleVisionOcrClient({
  projectId,
  accessTokenProvider,
  readDocumentBytes,
  fetchImpl = globalThis.fetch,
  location = 'eu',
  maxPagesPerDocument = 20,
  maxBytes = 15 * 1024 * 1024,
  timeoutMs = 20000
} = {}) {
  const project = requireString(projectId, 'Google Cloud project id');
  if (location !== 'eu') throw new Error('Fakturasjekk Google Vision OCR must use the EU location.');
  if (!accessTokenProvider?.getAccessToken) throw new Error('Google Vision OCR requires accessTokenProvider.getAccessToken.');
  if (typeof readDocumentBytes !== 'function') throw new Error('Google Vision OCR requires readDocumentBytes.');
  if (typeof fetchImpl !== 'function') throw new Error('Google Vision OCR requires fetch.');
  if (!Number.isInteger(maxPagesPerDocument) || maxPagesPerDocument < 1 || maxPagesPerDocument > 50) throw new Error('OCR page cap must be between 1 and 50.');
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error('OCR byte cap must be positive.');

  const origin = `https://${location}-vision.googleapis.com`;
  const parent = `projects/${encodeURIComponent(project)}/locations/${location}`;

  async function call(path, body) {
    const token = requireString(await accessTokenProvider.getAccessToken(), 'Google OAuth access token');
    let response;
    try {
      response = await fetchImpl(`${origin}/v1/${parent}/${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
        cache: 'no-store'
      });
    } catch (error) {
      throw new Error(`Google Vision OCR request failed: ${String(error?.message ?? 'network error')}`);
    }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { throw new Error('Google Vision OCR returned invalid JSON.'); }
    if (!response.ok) {
      const message = payload?.error?.message ?? payload?.message ?? `HTTP ${response.status}`;
      throw new Error(`Google Vision OCR failed: ${String(message).slice(0, 240)}`);
    }
    return payload;
  }

  async function read(document) {
    const bytes = await readDocumentBytes(document);
    if (!(bytes instanceof Uint8Array)) throw new Error('OCR document reader must return Uint8Array.');
    if (!bytes.length || bytes.length > maxBytes) throw new Error('OCR document byte size is invalid.');
    return bytes;
  }

  async function ocrImage(document, bytes) {
    const payload = await call('images:annotate', {
      requests: [{
        image: { content: base64(bytes) },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }]
    });
    const response = payload?.responses?.[0];
    if (!response) throw new Error('Google Vision image OCR returned no response.');
    return {
      document_id: document.id,
      role: document.role,
      mime_type: document.mime_type,
      total_pages: 1,
      pages: [{ page: 1, text: pageText(response) }],
      provider: 'google_cloud_vision',
      provider_location: location
    };
  }

  async function annotatePdf(bytes, pages = undefined) {
    const request = {
      inputConfig: { mimeType: 'application/pdf', content: base64(bytes) },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
    };
    if (pages?.length) request.pages = pages;
    const payload = await call('files:annotate', { requests: [request] });
    const file = payload?.responses?.[0];
    if (!file) throw new Error('Google Vision PDF OCR returned no file response.');
    if (file?.error?.message) throw new Error(`Google Vision PDF OCR failed: ${String(file.error.message).slice(0, 200)}`);
    return file;
  }

  async function ocrPdf(document, bytes) {
    // Google documents that an empty pages list annotates the first five pages. The
    // underlying AnnotateFileResponse schema also exposes total_pages. We verify
    // response context.pageNumber so completeness never depends on array position alone.
    const first = await annotatePdf(bytes);
    const rawTotalPages = Number(first.totalPages ?? first.total_pages);
    if (!Number.isInteger(rawTotalPages) || rawTotalPages < 1) throw new Error('Google Vision PDF OCR did not return a valid total page count.');
    if (rawTotalPages > maxPagesPerDocument) {
      const error = new Error(`PDF has ${rawTotalPages} pages; OCR cap is ${maxPagesPerDocument}.`);
      error.code = 'ocr_page_limit_exceeded';
      error.total_pages = rawTotalPages;
      throw error;
    }

    const firstExpected = Array.from({ length: Math.min(rawTotalPages, 5) }, (_, i) => i + 1);
    const firstBatch = verifiedPageBatch(first, firstExpected, rawTotalPages);
    const output = [...firstBatch.pages];

    if (rawTotalPages > 5) {
      for (const pages of chunkPages(6, rawTotalPages, 5)) {
        const batch = await annotatePdf(bytes, pages);
        const verified = verifiedPageBatch(batch, pages, rawTotalPages);
        output.push(...verified.pages);
      }
    }

    output.sort((a, b) => a.page - b.page);
    const expectedAll = Array.from({ length: rawTotalPages }, (_, i) => i + 1);
    if (output.length !== rawTotalPages || output.some((item, index) => item.page !== expectedAll[index])) {
      throw new Error('Google Vision PDF OCR returned incomplete document text.');
    }

    return {
      document_id: document.id,
      role: document.role,
      mime_type: document.mime_type,
      total_pages: rawTotalPages,
      pages: output,
      provider: 'google_cloud_vision',
      provider_location: location
    };
  }

  async function ocrDocument(document) {
    if (!document?.id || !document?.role || !document?.mime_type) throw new Error('OCR document requires id, role and mime_type.');
    const bytes = await read(document);
    if (document.mime_type === 'application/pdf') return ocrPdf(document, bytes);
    if (['image/jpeg', 'image/png', 'image/webp'].includes(document.mime_type)) return ocrImage(document, bytes);
    throw new Error(`Unsupported OCR MIME type: ${document.mime_type}`);
  }

  async function ocrDocuments(documents = []) {
    if (!Array.isArray(documents) || !documents.length) throw new Error('At least one document is required for OCR.');
    const output = [];
    for (const document of documents) output.push(await ocrDocument(document));
    return output;
  }

  return { ocrDocument, ocrDocuments, provider: 'google_cloud_vision', location, max_pages_per_document: maxPagesPerDocument };
}

export function createOcrBackedStructuredExtractor({ ocrClient, factInterpreter } = {}) {
  if (!ocrClient?.ocrDocuments) throw new Error('OCR-backed extractor requires ocrClient.ocrDocuments.');
  if (!factInterpreter?.extractFacts) throw new Error('OCR-backed extractor requires factInterpreter.extractFacts.');

  return {
    async extract({ case_id, owner_id, documents }) {
      const ocrDocuments = await ocrClient.ocrDocuments(documents);
      const result = await factInterpreter.extractFacts({
        case_id,
        owner_id,
        documents: ocrDocuments.map(document => ({
          document_id: document.document_id,
          role: document.role,
          mime_type: document.mime_type,
          total_pages: document.total_pages,
          pages: document.pages.map(page => ({ page: page.page, text: page.text }))
        }))
      });
      if (!result || typeof result !== 'object' || !result.fields || typeof result.fields !== 'object') {
        throw new Error('Fact interpreter returned invalid extraction result.');
      }
      return result;
    }
  };
}
