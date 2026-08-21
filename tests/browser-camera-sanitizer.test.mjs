import assert from 'node:assert/strict';
import { createBrowserCameraSanitizer } from '../site/app/camera-sanitizer.mjs';

class FakeFile {
  constructor(parts, name, options = {}) {
    this.parts = parts;
    this.name = name;
    this.type = options.type ?? '';
    this.lastModified = options.lastModified ?? 0;
    this.size = parts.reduce((sum, part) => sum + Number(part?.size ?? part?.length ?? 0), 0);
  }
}

let bitmapClosed = 0;
const bitmap = { width: 4000, height: 3000, close() { bitmapClosed += 1; } };
const decoded = [];
const createImageBitmapImpl = async (...args) => {
  decoded.push(args);
  return bitmap;
};

let canvasDimensions = null;
let drawCount = 0;
class FakeOffscreenCanvas {
  constructor(width, height) {
    canvasDimensions = { width, height };
  }
  getContext() {
    return { drawImage() { drawCount += 1; } };
  }
  async convertToBlob({ type, quality }) {
    assert.equal(type, 'image/jpeg');
    assert.equal(quality, 0.92);
    return new Blob(['reencoded-pixels-only'], { type });
  }
}

const sanitizer = createBrowserCameraSanitizer({
  createImageBitmapImpl,
  OffscreenCanvasImpl: FakeOffscreenCanvas,
  documentImpl: null,
  FileImpl: FakeFile,
  maxEdge: 3200
});

const source = { name: 'IMG_1234.HEIC', type: 'image/heic', size: 4500000, exif: { GPSLatitude: 'should-not-survive' } };
const result = await sanitizer(source, { index: 0, role: 'invoice' });
assert.equal(result.metadata_stripped, true);
assert.equal(result.file.name, 'invoice-bilde-1.jpg');
assert.equal(result.file.type, 'image/jpeg');
assert.equal(result.file.exif, undefined, 'sanitized output must not preserve arbitrary source metadata properties');
assert.deepEqual(result.source_dimensions, { width: 4000, height: 3000 });
assert.deepEqual(result.output_dimensions, { width: 3200, height: 2400 });
assert.deepEqual(canvasDimensions, { width: 3200, height: 2400 });
assert.equal(result.low_resolution, false);
assert.equal(drawCount, 1);
assert.equal(bitmapClosed, 1);
assert.ok(decoded.length >= 1);

let fallbackDraw = 0;
const fallbackDocument = {
  createElement(name) {
    assert.equal(name, 'canvas');
    return {
      width: 0,
      height: 0,
      getContext() { return { drawImage() { fallbackDraw += 1; } }; },
      toBlob(callback, type) { callback(new Blob(['dom-canvas-pixels'], { type })); }
    };
  }
};
const fallbackSanitizer = createBrowserCameraSanitizer({
  createImageBitmapImpl: async () => ({ width: 1600, height: 1000, close() {} }),
  OffscreenCanvasImpl: null,
  documentImpl: fallbackDocument,
  FileImpl: FakeFile
});
const fallback = await fallbackSanitizer({ name: 'camera.jpg', type: 'image/jpeg', size: 500000 }, { index: 1, role: 'quote' });
assert.equal(fallback.metadata_stripped, true);
assert.equal(fallback.file.name, 'quote-bilde-2.jpg');
assert.equal(fallbackDraw, 1);

const lowResolutionSanitizer = createBrowserCameraSanitizer({
  createImageBitmapImpl: async () => ({ width: 800, height: 600, close() {} }),
  OffscreenCanvasImpl: FakeOffscreenCanvas,
  documentImpl: null,
  FileImpl: FakeFile
});
const low = await lowResolutionSanitizer({ name: 'small.jpg', type: 'image/jpeg', size: 100000 });
assert.equal(low.low_resolution, true, 'quality heuristic must warn rather than pretend OCR has failed');

let oversizedDecodeCalls = 0;
const sizeBoundSanitizer = createBrowserCameraSanitizer({
  createImageBitmapImpl: async () => { oversizedDecodeCalls += 1; return bitmap; },
  OffscreenCanvasImpl: FakeOffscreenCanvas,
  FileImpl: FakeFile,
  maxInputBytes: 15 * 1024 * 1024
});
await assert.rejects(
  () => sizeBoundSanitizer({ name: 'huge.jpg', type: 'image/jpeg', size: 15 * 1024 * 1024 + 1 }),
  error => error?.code === 'camera_file_too_large'
);
assert.equal(oversizedDecodeCalls, 0, 'oversized compressed input must be rejected before browser image decoding');

let extremeClosed = 0;
let extremeDrawn = 0;
class ExtremeCanvas {
  getContext() { return { drawImage() { extremeDrawn += 1; } }; }
  async convertToBlob() { return new Blob(['x'], { type: 'image/jpeg' }); }
}
const dimensionBoundSanitizer = createBrowserCameraSanitizer({
  createImageBitmapImpl: async () => ({ width: 13000, height: 4000, close() { extremeClosed += 1; } }),
  OffscreenCanvasImpl: ExtremeCanvas,
  documentImpl: null,
  FileImpl: FakeFile
});
await assert.rejects(
  () => dimensionBoundSanitizer({ name: 'decompression-risk.jpg', type: 'image/jpeg', size: 500000 }),
  error => error?.code === 'camera_dimensions_too_large'
);
assert.equal(extremeDrawn, 0, 'extreme decoded dimensions must be rejected before canvas allocation/drawing');
assert.equal(extremeClosed, 1, 'decoded bitmap must be released when dimensions are rejected');

const noDecode = createBrowserCameraSanitizer({ createImageBitmapImpl: null, OffscreenCanvasImpl: FakeOffscreenCanvas, FileImpl: FakeFile });
await assert.rejects(
  () => noDecode({ name: 'camera.jpg', type: 'image/jpeg', size: 10 }),
  error => error?.code === 'camera_decode_unavailable'
);

await assert.rejects(
  () => sanitizer({ name: 'not-an-image.pdf', type: 'application/pdf', size: 1000 }),
  error => error?.code === 'camera_not_image'
);

console.log('OK camera sanitizer strips metadata and fails closed on unsafe browser primitives, oversized inputs and extreme dimensions');
