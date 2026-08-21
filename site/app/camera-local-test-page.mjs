import { createBrowserCameraSanitizer } from './camera-sanitizer.mjs';
import { createBrowserCameraQualityAssessor } from './camera-quality.mjs';

const cameraInput = document.querySelector('#camera-input');
const fileInput = document.querySelector('#file-input');
const clearButton = document.querySelector('#clear');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const preview = document.querySelector('#preview');
const checks = document.querySelector('#checks');
const technical = document.querySelector('#technical');
const sanitize = createBrowserCameraSanitizer();
const assess = createBrowserCameraQualityAssessor();
let previewUrl = null;

function revokePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.removeAttribute('src');
}

function reset() {
  revokePreview();
  cameraInput.value = '';
  fileInput.value = '';
  checks.replaceChildren();
  technical.textContent = '';
  result.classList.remove('visible');
  status.textContent = 'Ingen test utført ennå.';
  clearButton.disabled = true;
}

function addCheck(text, warning = false) {
  const li = document.createElement('li');
  li.className = warning ? 'warn' : 'ok';
  li.textContent = text;
  checks.append(li);
}

async function run(file) {
  reset();
  clearButton.disabled = false;
  status.textContent = 'Tester bildet lokalt på enheten …';
  try {
    const quality = await assess(file);
    const sanitized = await sanitize(file, { role: 'invoice', index: 0 });
    previewUrl = URL.createObjectURL(sanitized.file);
    preview.src = previewUrl;
    result.classList.add('visible');

    addCheck('Metadata-stripping/re-encoding: OK');
    addCheck(`Utdataformat: ${sanitized.output_mime_type}`);
    addCheck(`Oppløsning etter klargjøring: ${sanitized.output_dimensions.width} × ${sanitized.output_dimensions.height}`,
      sanitized.low_resolution === true);

    if (!quality.warnings.length) addCheck('Ingen tydelig lokal lys-/kontrast-/uskarphetsadvarsel.');
    for (const warning of quality.warnings) addCheck(warning.message, true);
    addCheck('Ingen opplasting er utført.');

    technical.textContent = JSON.stringify({
      original: { type: file.type || null, bytes: file.size || null },
      sanitized: {
        type: sanitized.output_mime_type,
        bytes: sanitized.file.size,
        source_dimensions: sanitized.source_dimensions,
        output_dimensions: sanitized.output_dimensions,
        metadata_stripped: sanitized.metadata_stripped
      },
      quality: {
        recommend_retake: quality.recommend_retake,
        signals: quality.signals,
        sample_dimensions: quality.sample_dimensions
      }
    }, null, 2);
    status.textContent = quality.recommend_retake
      ? 'Test fullført. Bildet ble klargjort lokalt, men kvalitetssignalet anbefaler å vurdere et nytt bilde.'
      : 'Test fullført lokalt. Bildet ble klargjort uten opplasting.';
  } catch (error) {
    revokePreview();
    result.classList.remove('visible');
    const box = document.createElement('div');
    box.className = 'error';
    box.textContent = `Kameratesten kunne ikke fullføres sikkert: ${error?.message || 'ukjent feil'}`;
    status.replaceChildren(box);
  }
}

cameraInput.addEventListener('change', () => cameraInput.files?.[0] && run(cameraInput.files[0]));
fileInput.addEventListener('change', () => fileInput.files?.[0] && run(fileInput.files[0]));
clearButton.addEventListener('click', reset);
window.addEventListener('pagehide', revokePreview, { once: true });
