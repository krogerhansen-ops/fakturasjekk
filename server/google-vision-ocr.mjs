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

function chunkPages(start, end, size = 5) {
  const chunks = [];
  for (let first = start; first <= end; first += size) {
    const last = Math.min(end, first + size - 1);
    chunks.push(Array.from({ length: last - first + 1 }, (_, i) => first + i));
  }
  return chunks;
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
    // Empty pages means Google returns the first five pages and also totalPages.
    const first = await annotatePdf(bytes);
    const totalPages = Number(first.totalPages ?? first.total_pages);
    if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('Google Vision PDF OCR did not return a valid total page count.');
    if (totalPages > maxPagesPerDocument) {
      const error = new Error(`PDF has ${totalPages} pages; OCR cap is ${maxPagesPerDocument}.`);
      error.code = 'ocr_page_limit_exceeded';
      error.total_pages = totalPages;
      throw error;
    }

    const output = [];
    const firstResponses = Array.isArray(first.responses) ? first.responses : [];
    firstResponses.forEach((response, index) => output.push({ page: index + 1, text: pageText(response) }));

    if (totalPages > 5) {
      for (const pages of chunkPages(6, totalPages, 5)) {
        const batch = await annotatePdf(bytes, pages);
        const responses = Array.isArray(batch.responses) ? batch.responses : [];
        if (responses.length !== pages.length) throw new Error('Google Vision PDF OCR returned incomplete page batch.');
        responses.forEach((response, index) => output.push({ page: pages[index], text: pageText(response) }));
      }
    }

    if (output.length !== totalPages) throw new Error('Google Vision PDF OCR returned incomplete document text.');
    return {
      document_id: document.id,
      role: document.role,
      mime_type: document.mime_type,
      total_pages: totalPages,
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
