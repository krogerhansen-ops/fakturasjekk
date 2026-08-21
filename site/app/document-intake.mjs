import { privacySafeFileDescriptor } from './upload-metadata.mjs';

const CAMERA_SOURCE = 'camera';
const FILE_SOURCE = 'file';

function toArray(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Array.from(files);
}

function validatePreparedFiles(files, { role, source, policy }) {
  const errors = [];
  const warnings = [];
  const allowedMimeTypes = new Set(policy?.allowed_mime_types ?? []);
  const allowedRoles = new Set(policy?.document_roles ?? []);
  const maxFiles = Number(policy?.max_files ?? 0);
  const maxFileBytes = Number(policy?.max_file_bytes ?? 0);
  const maxTotalBytes = Number(policy?.max_total_bytes ?? 0);

  if (!allowedRoles.has(role)) errors.push({ code: 'invalid_document_role', message: `Dokumentrollen ${role || 'ukjent'} er ikke gyldig.` });
  if (maxFiles > 0 && files.length > maxFiles) errors.push({ code: 'too_many_files', message: `Maks ${maxFiles} filer per sak.` });

  let totalBytes = 0;
  const descriptors = [];
  files.forEach((file, index) => {
    const item = privacySafeFileDescriptor(file, role, index);
    descriptors.push(item);
    totalBytes += item.size;
    if (!allowedMimeTypes.has(item.mime_type)) errors.push({ code: 'mime_type_not_allowed', index, message: `Fil ${index + 1}: filtypen ${item.mime_type || 'ukjent'} er ikke tillatt.` });
    if (item.size <= 0) errors.push({ code: 'empty_file', index, message: `Fil ${index + 1}: filen er tom eller mangler størrelse.` });
    if (maxFileBytes > 0 && item.size > maxFileBytes) errors.push({ code: 'file_too_large', index, message: `Fil ${index + 1}: filen er større enn tillatt grense.` });
  });

  if (maxTotalBytes > 0 && totalBytes > maxTotalBytes) errors.push({ code: 'total_size_too_large', message: 'Samlet filstørrelse overstiger tillatt grense.' });
  if (source === CAMERA_SOURCE) warnings.push('Kamerabilder må være metadata-strippet før de sendes til Fakturasjekk. Original EXIF/GPS-metadata skal ikke lastes opp.');
  warnings.push('Originale lokale filnavn sendes ikke til backend; opplastingen bruker nøytrale dokumentnavn.');
  warnings.push('Nettleserens MIME-type er kun forhåndskontroll. Backend skal fortsatt verifisere magic bytes, størrelse og malware-status.');

  return { valid: errors.length === 0, errors, warnings, descriptors, total_bytes: totalBytes };
}

export function documentInputAttributes({ multiple = true } = {}) {
  return {
    accept: 'application/pdf,image/jpeg,image/png,image/webp',
    multiple: Boolean(multiple)
  };
}

export function cameraInputAttributes() {
  return {
    accept: 'image/*',
    capture: 'environment'
  };
}

export function createDocumentIntake({ policy, sanitizeCameraFile = null } = {}) {
  if (!policy || typeof policy !== 'object') throw new Error('Upload policy is required.');

  async function prepare(files, { role = 'invoice', source = FILE_SOURCE } = {}) {
    if (![FILE_SOURCE, CAMERA_SOURCE].includes(source)) {
      return { valid: false, source, role, files: [], descriptors: [], errors: [{ code: 'invalid_source', message: 'Dokumentkilden er ikke gyldig.' }], warnings: [] };
    }

    const incoming = toArray(files);
    const preparedFiles = [];
    const preparationErrors = [];
    const preparationWarnings = [];

    for (const [index, originalFile] of incoming.entries()) {
      if (source !== CAMERA_SOURCE) {
        preparedFiles.push(originalFile);
        continue;
      }

      if (typeof sanitizeCameraFile !== 'function') {
        preparationErrors.push({ code: 'camera_sanitizer_required', index, message: 'Kamerabilder kan ikke lastes opp før metadata-stripping er tilgjengelig.' });
        continue;
      }

      let sanitized;
      try {
        sanitized = await sanitizeCameraFile(originalFile, { index, role });
      } catch (error) {
        preparationErrors.push({ code: 'camera_sanitization_failed', index, message: 'Kamerabildet kunne ikke klargjøres sikkert.', details: String(error?.message ?? '') });
        continue;
      }

      if (!sanitized?.file || sanitized.metadata_stripped !== true) {
        preparationErrors.push({ code: 'camera_metadata_not_stripped', index, message: 'Kamerabildet mangler bekreftet metadata-stripping.' });
        continue;
      }

      preparedFiles.push(sanitized.file);
      if (sanitized.low_resolution === true) preparationWarnings.push(`Bilde ${index + 1} kan være for lavoppløselig for sikker lesing.`);
    }

    const validation = validatePreparedFiles(preparedFiles, { role, source, policy });
    const errors = [...preparationErrors, ...validation.errors];
    return {
      valid: errors.length === 0,
      source,
      role,
      files: preparedFiles,
      descriptors: validation.descriptors,
      errors,
      warnings: [...preparationWarnings, ...validation.warnings],
      total_bytes: validation.total_bytes
    };
  }

  async function uploadPrepared({ api, caseId, prepared }) {
    if (!api?.registerUploads || !api?.uploadSigned || !api?.confirmDocument) throw new Error('API client does not support the signed upload flow.');
    if (!caseId) throw new Error('caseId is required.');
    if (!prepared?.valid) throw new Error('Prepared document intake must be valid before upload.');
    if (!Array.isArray(prepared.files) || prepared.files.length !== prepared.descriptors?.length) throw new Error('Prepared files and descriptors are inconsistent.');

    const registration = await api.registerUploads(caseId, prepared.descriptors);
    if (registration?.accepted === false || registration?.validation?.valid === false) {
      const error = new Error('Backend rejected the document set.');
      error.code = 'upload_registration_rejected';
      error.validation = registration?.validation ?? null;
      throw error;
    }

    const targets = registration?.upload_targets ?? [];
    if (targets.length !== prepared.files.length) {
      const error = new Error('Signed upload target count does not match the prepared document count.');
      error.code = 'upload_target_mismatch';
      throw error;
    }

    const confirmed = [];
    for (let index = 0; index < prepared.files.length; index += 1) {
      const target = targets[index];
      const file = prepared.files[index];
      if (!target?.document_id) {
        const error = new Error(`Upload target ${index + 1} is missing document_id.`);
        error.code = 'invalid_upload_target';
        throw error;
      }
      await api.uploadSigned(target, file);
      const confirmation = await api.confirmDocument(caseId, target.document_id);
      if (confirmation?.uploaded !== true && confirmation?.document?.status !== 'uploaded') {
        const error = new Error(`Document ${index + 1} was not confirmed as uploaded.`);
        error.code = 'upload_confirmation_failed';
        throw error;
      }
      confirmed.push({ document_id: target.document_id, confirmation });
    }

    return { uploaded: true, case_id: caseId, confirmed, case: registration?.case ?? null };
  }

  return { prepare, uploadPrepared };
}
