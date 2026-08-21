function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function outputName(role, index) {
  const safeRole = String(role || 'dokument').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'dokument';
  return `${safeRole}-bilde-${Number(index) + 1}.jpg`;
}

async function bitmapFromFile(file, createImageBitmapImpl) {
  if (typeof createImageBitmapImpl !== 'function') {
    const error = new Error('Nettleseren mangler sikker lokal bildedekoding for kameraflyt.');
    error.code = 'camera_decode_unavailable';
    throw error;
  }
  try {
    return await createImageBitmapImpl(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmapImpl(file);
  }
}

async function encodeWithOffscreenCanvas({ bitmap, width, height, type, quality, OffscreenCanvasImpl }) {
  if (typeof OffscreenCanvasImpl !== 'function') return null;
  const canvas = new OffscreenCanvasImpl(width, height);
  const context = canvas.getContext?.('2d', { alpha: false });
  if (!context?.drawImage || typeof canvas.convertToBlob !== 'function') return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type, quality });
}

async function encodeWithDomCanvas({ bitmap, width, height, type, quality, documentImpl }) {
  if (!documentImpl?.createElement) return null;
  const canvas = documentImpl.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext?.('2d', { alpha: false });
  if (!context?.drawImage || typeof canvas.toBlob !== 'function') return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(Object.assign(new Error('Kamerabildet kunne ikke re-encodes.'), { code: 'camera_encode_failed' }));
    }, type, quality);
  });
}

function toUploadFile(blob, { name, type, FileImpl }) {
  if (!blob || Number(blob.size ?? 0) <= 0) {
    const error = new Error('Re-encodet kamerabilde er tomt.');
    error.code = 'camera_encode_empty';
    throw error;
  }
  if (typeof FileImpl === 'function') return new FileImpl([blob], name, { type, lastModified: Date.now() });
  try {
    Object.defineProperty(blob, 'name', { value: name, configurable: true });
  } catch {
    // Blob is still a valid request body; document-intake generates a safe metadata name if needed.
  }
  return blob;
}

export function createBrowserCameraSanitizer({
  createImageBitmapImpl = globalThis.createImageBitmap,
  OffscreenCanvasImpl = globalThis.OffscreenCanvas,
  documentImpl = globalThis.document,
  FileImpl = globalThis.File,
  maxEdge = 3200,
  jpegQuality = 0.92,
  minimumShortEdge = 900,
  minimumLongEdge = 1200,
  maxInputBytes = 15 * 1024 * 1024,
  maxSourcePixels = 40_000_000,
  maxSourceEdge = 12000
} = {}) {
  const boundedMaxEdge = Math.round(clampNumber(maxEdge, 3200, 1200, 6000));
  const boundedQuality = clampNumber(jpegQuality, 0.92, 0.75, 0.98);
  const minShort = Math.round(clampNumber(minimumShortEdge, 900, 320, 2400));
  const minLong = Math.round(clampNumber(minimumLongEdge, 1200, 480, 3200));
  const boundedInputBytes = Math.round(clampNumber(maxInputBytes, 15 * 1024 * 1024, 1024 * 1024, 50 * 1024 * 1024));
  const boundedSourcePixels = Math.round(clampNumber(maxSourcePixels, 40_000_000, 4_000_000, 100_000_000));
  const boundedSourceEdge = Math.round(clampNumber(maxSourceEdge, 12000, 3200, 20000));

  return async function sanitizeCameraFile(file, { index = 0, role = 'invoice' } = {}) {
    const inputBytes = Number(file?.size ?? 0);
    if (!file || !Number.isFinite(inputBytes) || inputBytes <= 0) {
      const error = new Error('Kamerafilen er tom.');
      error.code = 'camera_file_empty';
      throw error;
    }
    if (inputBytes > boundedInputBytes) {
      const error = new Error('Kamerafilen er større enn tillatt grense.');
      error.code = 'camera_file_too_large';
      throw error;
    }
    const inputType = String(file.type ?? '').toLowerCase();
    if (inputType && !inputType.startsWith('image/')) {
      const error = new Error('Kamerafilen er ikke et bilde.');
      error.code = 'camera_not_image';
      throw error;
    }

    const bitmap = await bitmapFromFile(file, createImageBitmapImpl);
    try {
      const sourceWidth = Number(bitmap?.width ?? 0);
      const sourceHeight = Number(bitmap?.height ?? 0);
      if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        const error = new Error('Kamerabildet mangler gyldige dimensjoner.');
        error.code = 'camera_dimensions_invalid';
        throw error;
      }
      const sourcePixels = sourceWidth * sourceHeight;
      if (!Number.isSafeInteger(sourcePixels) || sourcePixels > boundedSourcePixels || sourceWidth > boundedSourceEdge || sourceHeight > boundedSourceEdge) {
        const error = new Error('Kamerabildet har uvanlig store dimensjoner og kan ikke behandles sikkert.');
        error.code = 'camera_dimensions_too_large';
        throw error;
      }

      const sourceLong = Math.max(sourceWidth, sourceHeight);
      const sourceShort = Math.min(sourceWidth, sourceHeight);
      const scale = sourceLong > boundedMaxEdge ? boundedMaxEdge / sourceLong : 1;
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const type = 'image/jpeg';

      let blob = await encodeWithOffscreenCanvas({ bitmap, width, height, type, quality: boundedQuality, OffscreenCanvasImpl });
      if (!blob) blob = await encodeWithDomCanvas({ bitmap, width, height, type, quality: boundedQuality, documentImpl });
      if (!blob) {
        const error = new Error('Nettleseren mangler sikker lokal re-encoding for kameraflyt.');
        error.code = 'camera_encode_unavailable';
        throw error;
      }

      const name = outputName(role, index);
      const sanitizedFile = toUploadFile(blob, { name, type, FileImpl });
      return {
        file: sanitizedFile,
        metadata_stripped: true,
        low_resolution: sourceShort < minShort || sourceLong < minLong,
        source_dimensions: { width: sourceWidth, height: sourceHeight },
        output_dimensions: { width, height },
        output_mime_type: type
      };
    } finally {
      bitmap?.close?.();
    }
  };
}
