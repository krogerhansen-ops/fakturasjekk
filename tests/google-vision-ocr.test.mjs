import assert from 'node:assert/strict';
import { createGoogleVisionOcrClient, createOcrBackedStructuredExtractor } from '../server/google-vision-ocr.mjs';

const pageResponse = (page, text) => ({ context: { pageNumber: page }, fullTextAnnotation: { text } });

const calls = [];
let fileCall = 0;
const fetchImpl = async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  if (url.endsWith('/files:annotate')) {
    fileCall += 1;
    if (fileCall === 1) {
      return new Response(JSON.stringify({
        responses: [{
          totalPages: 7,
          responses: Array.from({ length: 5 }, (_, i) => pageResponse(i + 1, `PDF page ${i + 1}`))
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      responses: [{
        totalPages: 7,
        responses: [
          pageResponse(6, 'PDF page 6'),
          pageResponse(7, 'PDF page 7')
        ]
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('/images:annotate')) {
    return new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'Image invoice text' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  throw new Error(`Unexpected URL: ${url}`);
};

const tokenProvider = { async getAccessToken() { return 'oauth-token-test'; } };
const reader = async document => document.mime_type === 'application/pdf'
  ? new Uint8Array([37, 80, 68, 70, 45, 49])
  : new Uint8Array([255, 216, 255, 224]);

const ocr = createGoogleVisionOcrClient({
  projectId: 'fakturasjekk-ocr-test',
  accessTokenProvider: tokenProvider,
  readDocumentBytes: reader,
  fetchImpl,
  location: 'eu',
  maxPagesPerDocument: 20
});

const pdf = await ocr.ocrDocument({ id: 'doc-pdf', role: 'invoice', mime_type: 'application/pdf' });
assert.equal(pdf.total_pages, 7);
assert.deepEqual(pdf.pages.map(page => page.page), [1, 2, 3, 4, 5, 6, 7]);
assert.equal(pdf.pages[6].text, 'PDF page 7');
assert.equal(pdf.provider_location, 'eu');
assert.equal(fileCall, 2);

const firstFileCall = calls[0];
assert.match(firstFileCall.url, /^https:\/\/eu-vision\.googleapis\.com\/v1\/projects\/fakturasjekk-ocr-test\/locations\/eu\/files:annotate$/);
assert.equal(firstFileCall.options.headers.authorization, 'Bearer oauth-token-test');
assert.equal(firstFileCall.options.cache, 'no-store');
assert.equal('pages' in firstFileCall.body.requests[0], false, 'first call should let Vision annotate its documented first-five default');
assert.equal(firstFileCall.body.requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION');
assert.equal(firstFileCall.body.requests[0].inputConfig.mimeType, 'application/pdf');

const secondFileCall = calls[1];
assert.deepEqual(secondFileCall.body.requests[0].pages, [6, 7]);

const image = await ocr.ocrDocument({ id: 'doc-image', role: 'quote', mime_type: 'image/jpeg' });
assert.equal(image.total_pages, 1);
assert.equal(image.pages[0].text, 'Image invoice text');
assert.match(calls[2].url, /\/locations\/eu\/images:annotate$/);

let capFetches = 0;
const capped = createGoogleVisionOcrClient({
  projectId: 'fakturasjekk-ocr-test',
  accessTokenProvider: tokenProvider,
  readDocumentBytes: reader,
  fetchImpl: async () => {
    capFetches += 1;
    return new Response(JSON.stringify({
      responses: [{ totalPages: 21, responses: Array.from({ length: 5 }, (_, i) => pageResponse(i + 1, `page ${i + 1}`)) }]
    }), { status: 200 });
  },
  maxPagesPerDocument: 20
});
await assert.rejects(
  () => capped.ocrDocument({ id: 'too-long', role: 'invoice', mime_type: 'application/pdf' }),
  error => error?.code === 'ocr_page_limit_exceeded' && error.total_pages === 21
);
assert.equal(capFetches, 1, 'page-cap must fail after first totalPages response without sending more document batches');

const wrongPageContext = createGoogleVisionOcrClient({
  projectId: 'fakturasjekk-ocr-test',
  accessTokenProvider: tokenProvider,
  readDocumentBytes: reader,
  fetchImpl: async () => new Response(JSON.stringify({
    responses: [{ totalPages: 2, responses: [pageResponse(1, 'one'), pageResponse(7, 'wrong page')] }]
  }), { status: 200 }),
  maxPagesPerDocument: 20
});
await assert.rejects(
  () => wrongPageContext.ocrDocument({ id: 'wrong-pages', role: 'invoice', mime_type: 'application/pdf' }),
  /unexpected page numbers/i
);

const inconsistentTotal = createGoogleVisionOcrClient({
  projectId: 'fakturasjekk-ocr-test',
  accessTokenProvider: tokenProvider,
  readDocumentBytes: reader,
  fetchImpl: (() => {
    let n = 0;
    return async () => {
      n += 1;
      if (n === 1) return new Response(JSON.stringify({ responses: [{ totalPages: 6, responses: [1,2,3,4,5].map(p => pageResponse(p, `p${p}`)) }] }), { status: 200 });
      return new Response(JSON.stringify({ responses: [{ totalPages: 7, responses: [pageResponse(6, 'p6')] }] }), { status: 200 });
    };
  })(),
  maxPagesPerDocument: 20
});
await assert.rejects(
  () => inconsistentTotal.ocrDocument({ id: 'inconsistent', role: 'invoice', mime_type: 'application/pdf' }),
  /inconsistent total page count/i
);

let interpreterInput = null;
const extractor = createOcrBackedStructuredExtractor({
  ocrClient: {
    async ocrDocuments() {
      return [{ document_id: 'd1', role: 'invoice', mime_type: 'application/pdf', total_pages: 1, pages: [{ page: 1, text: 'Faktura 29 kr' }], provider: 'google_cloud_vision', provider_location: 'eu' }];
    }
  },
  factInterpreter: {
    async extractFacts(input) {
      interpreterInput = input;
      return { fields: { invoice_total: { value: 29, confidence: 0.99, source_document_id: 'd1', source_page: 1 } } };
    }
  }
});
const extracted = await extractor.extract({ case_id: 'case-1', owner_id: 'u1', documents: [{ id: 'd1' }] });
assert.equal(extracted.fields.invoice_total.value, 29);
assert.deepEqual(interpreterInput.documents[0].pages, [{ page: 1, text: 'Faktura 29 kr' }]);
assert.equal(JSON.stringify(interpreterInput).includes('oauth-token-test'), false);

assert.throws(() => createGoogleVisionOcrClient({ projectId: 'x', accessTokenProvider: tokenProvider, readDocumentBytes: reader, location: 'us' }), /EU location/i);
assert.throws(() => createGoogleVisionOcrClient({ projectId: 'x', accessTokenProvider: tokenProvider, readDocumentBytes: reader, maxPagesPerDocument: 51 }), /between 1 and 50/i);

console.log('OK Google Vision OCR is EU-bound, verifies total pages/page identity and stays separated from fact interpretation');
