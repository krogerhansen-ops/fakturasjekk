import assert from 'node:assert/strict';
import { assessCameraImageData, createBrowserCameraQualityAssessor } from '../site/app/camera-quality.mjs';

function imageData(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixelAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

const dark = assessCameraImageData(imageData(20, 20, () => 15));
assert.equal(dark.signals.too_dark, true);
assert.equal(dark.recommend_retake, true);
assert.ok(dark.warnings.some(item => item.code === 'camera_too_dark'));
assert.ok(dark.disclaimer.includes('ikke om OCR vil lykkes'));

const washedOut = assessCameraImageData(imageData(20, 20, () => 250));
assert.equal(washedOut.signals.too_bright, true);
assert.equal(washedOut.signals.low_contrast, true);
assert.equal(washedOut.recommend_retake, true);

const flatMidtone = assessCameraImageData(imageData(20, 20, () => 140));
assert.equal(flatMidtone.signals.low_contrast, true);
assert.equal(flatMidtone.signals.possible_blur, true);
assert.equal(flatMidtone.recommend_retake, true);

const documentLike = assessCameraImageData(imageData(40, 40, (x, y) => {
  const paper = 232;
  const textRow = y % 8 === 3 || y % 8 === 4;
  const textColumn = x > 4 && x < 35 && x % 4 !== 0;
  return textRow && textColumn ? 25 : paper;
}));
assert.equal(documentLike.signals.too_dark, false);
assert.equal(documentLike.signals.too_bright, false);
assert.equal(documentLike.signals.low_contrast, false);
assert.equal(documentLike.signals.possible_blur, false);
assert.equal(documentLike.recommend_retake, false);

assert.throws(
  () => assessCameraImageData({ width: 2, height: 2, data: new Uint8ClampedArray(16) }),
  error => error?.code === 'camera_quality_invalid_dimensions'
);

let closed = 0;
const bitmap = { width: 1600, height: 1200, close() { closed += 1; } };
const sampled = imageData(320, 240, (x, y) => (y % 16 < 2 && x > 20 ? 30 : 230));
class FakeOffscreenCanvas {
  constructor(width, height) {
    assert.equal(width, 320);
    assert.equal(height, 240);
  }
  getContext() {
    return {
      drawImage(source, x, y, width, height) {
        assert.equal(source, bitmap);
        assert.deepEqual([x, y, width, height], [0, 0, 320, 240]);
      },
      getImageData(x, y, width, height) {
        assert.deepEqual([x, y, width, height], [0, 0, 320, 240]);
        return sampled;
      }
    };
  }
}

const browserAssessor = createBrowserCameraQualityAssessor({
  createImageBitmapImpl: async () => bitmap,
  OffscreenCanvasImpl: FakeOffscreenCanvas,
  documentImpl: null
});
const browserResult = await browserAssessor({ name: 'invoice.jpg', type: 'image/jpeg', size: 12345 });
assert.equal(browserResult.assessed, true);
assert.deepEqual(browserResult.source_dimensions, { width: 1600, height: 1200 });
assert.deepEqual(browserResult.sample_dimensions, { width: 320, height: 240 });
assert.equal(closed, 1);

const noDecoder = createBrowserCameraQualityAssessor({ createImageBitmapImpl: null, OffscreenCanvasImpl: FakeOffscreenCanvas });
await assert.rejects(
  () => noDecoder({ name: 'invoice.jpg', type: 'image/jpeg', size: 10 }),
  error => error?.code === 'camera_quality_decode_unavailable'
);

console.log('OK camera quality check gives local retake signals without claiming OCR or legal readability');
