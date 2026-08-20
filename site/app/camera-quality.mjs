function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validateImageData(imageData) {
  const width = Number(imageData?.width ?? 0);
  const height = Number(imageData?.height ?? 0);
  const data = imageData?.data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) {
    const error = new Error('Bildeprøven har ugyldige dimensjoner.');
    error.code = 'camera_quality_invalid_dimensions';
    throw error;
  }
  if (!data || Number(data.length) !== width * height * 4) {
    const error = new Error('Bildeprøven har ugyldige pikseldata.');
    error.code = 'camera_quality_invalid_pixels';
    throw error;
  }
  return { width, height, data };
}

export function assessCameraImageData(imageData, {
  darkMeanThreshold = 62,
  brightMeanThreshold = 235,
  lowContrastStdDevThreshold = 28,
  lowEdgeThreshold = 8,
  extremePixelFractionThreshold = 0.62
} = {}) {
  const { width, height, data } = validateImageData(imageData);
  const pixels = width * height;
  const gray = new Float32Array(pixels);
  let sum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const y = luminance(data[offset], data[offset + 1], data[offset + 2]);
    gray[pixel] = y;
    sum += y;
    if (y < 40) darkPixels += 1;
    if (y > 245) brightPixels += 1;
  }

  const mean = sum / pixels;
  let varianceSum = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const delta = gray[pixel] - mean;
    varianceSum += delta * delta;
  }
  const stdDev = Math.sqrt(varianceSum / pixels);

  // Mean absolute Laplacian is used only as a cheap local edge/sharpness signal.
  // It is intentionally not treated as proof that text is readable or OCR-ready.
  let edgeSum = 0;
  let edgeSamples = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      edgeSum += Math.abs(laplacian);
      edgeSamples += 1;
    }
  }
  const edgeScore = edgeSamples ? edgeSum / edgeSamples : 0;
  const darkFraction = darkPixels / pixels;
  const brightFraction = brightPixels / pixels;

  const signals = {
    too_dark: mean < darkMeanThreshold || darkFraction > extremePixelFractionThreshold,
    too_bright: mean > brightMeanThreshold || brightFraction > extremePixelFractionThreshold,
    low_contrast: stdDev < lowContrastStdDevThreshold,
    possible_blur: edgeScore < lowEdgeThreshold,
    dark_fraction: round(darkFraction, 3),
    bright_fraction: round(brightFraction, 3),
    mean_luminance: round(mean),
    contrast_stddev: round(stdDev),
    edge_score: round(edgeScore)
  };

  const warnings = [];
  if (signals.too_dark) warnings.push({ code: 'camera_too_dark', message: 'Bildet kan være for mørkt. Prøv bedre lys og unngå skygger over fakturaen.' });
  if (signals.too_bright) warnings.push({ code: 'camera_too_bright', message: 'Bildet kan være overeksponert. Unngå direkte blitz eller gjenskinn i papiret.' });
  if (signals.low_contrast) warnings.push({ code: 'camera_low_contrast', message: 'Bildet har lav kontrast. Sørg for jevnt lys og tydelig tekst mot bakgrunnen.' });
  if (signals.possible_blur) warnings.push({ code: 'camera_possible_blur', message: 'Bildet kan være uskarpt. Hold mobilen rolig og ta bildet på nytt dersom teksten ser utydelig ut.' });

  const severeExposure = signals.too_dark || signals.too_bright;
  const detailRisk = signals.low_contrast && signals.possible_blur;
  return {
    assessed: true,
    recommend_retake: severeExposure || detailRisk,
    warnings,
    signals,
    disclaimer: 'Dette er bare en lokal bildekvalitetsindikasjon. Den sier ikke om OCR vil lykkes eller om dokumentet er tilstrekkelig som bevis.'
  };
}

function sampleDimensions(width, height, maxEdge) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(3, Math.round(width * scale)),
    height: Math.max(3, Math.round(height * scale))
  };
}

function getCanvas({ width, height, OffscreenCanvasImpl, documentImpl }) {
  if (typeof OffscreenCanvasImpl === 'function') return new OffscreenCanvasImpl(width, height);
  if (documentImpl?.createElement) {
    const canvas = documentImpl.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  const error = new Error('Nettleseren mangler lokal canvas-støtte for bildekvalitetskontroll.');
  error.code = 'camera_quality_canvas_unavailable';
  throw error;
}

export function createBrowserCameraQualityAssessor({
  createImageBitmapImpl = globalThis.createImageBitmap,
  OffscreenCanvasImpl = globalThis.OffscreenCanvas,
  documentImpl = globalThis.document,
  sampleMaxEdge = 320,
  thresholds = {}
} = {}) {
  const boundedSampleEdge = Math.round(clamp(Number(sampleMaxEdge) || 320, 96, 640));

  return async function assess(file) {
    if (!file || Number(file.size ?? 0) <= 0) {
      const error = new Error('Kamerafilen er tom.');
      error.code = 'camera_quality_file_empty';
      throw error;
    }
    if (typeof createImageBitmapImpl !== 'function') {
      const error = new Error('Nettleseren mangler lokal bildedekoding for kvalitetskontroll.');
      error.code = 'camera_quality_decode_unavailable';
      throw error;
    }

    let bitmap;
    try {
      try {
        bitmap = await createImageBitmapImpl(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmapImpl(file);
      }
      const sourceWidth = Number(bitmap?.width ?? 0);
      const sourceHeight = Number(bitmap?.height ?? 0);
      if (sourceWidth < 3 || sourceHeight < 3) {
        const error = new Error('Kamerabildet har ugyldige dimensjoner.');
        error.code = 'camera_quality_invalid_dimensions';
        throw error;
      }
      const sample = sampleDimensions(sourceWidth, sourceHeight, boundedSampleEdge);
      const canvas = getCanvas({ ...sample, OffscreenCanvasImpl, documentImpl });
      const context = canvas.getContext?.('2d', { willReadFrequently: true, alpha: false });
      if (!context?.drawImage || !context?.getImageData) {
        const error = new Error('Nettleseren kan ikke lese lokal bildeprøve for kvalitetskontroll.');
        error.code = 'camera_quality_context_unavailable';
        throw error;
      }
      context.drawImage(bitmap, 0, 0, sample.width, sample.height);
      const imageData = context.getImageData(0, 0, sample.width, sample.height);
      return {
        ...assessCameraImageData(imageData, thresholds),
        source_dimensions: { width: sourceWidth, height: sourceHeight },
        sample_dimensions: sample
      };
    } finally {
      bitmap?.close?.();
    }
  };
}
