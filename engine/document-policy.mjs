export function validateUploadSet(files = [], policy) {
  const errors = [];
  const warnings = [];
  const allowed = new Set(policy.allowed_mime_types ?? []);
  const roles = new Set(policy.document_roles ?? []);

  if (!Array.isArray(files)) return { valid: false, errors: ['Filer må oppgis som en liste.'], warnings: [] };
  if (files.length > Number(policy.max_files ?? 0)) errors.push(`Maks ${policy.max_files} filer per sak.`);

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size ?? 0), 0);
  if (totalBytes > Number(policy.max_total_bytes ?? 0)) errors.push('Samlet filstørrelse overstiger tillatt grense.');

  const presentRoles = new Set();
  for (const [index, file] of files.entries()) {
    if (!allowed.has(file.mime_type)) errors.push(`Fil ${index + 1}: filtypen ${file.mime_type || 'ukjent'} er ikke tillatt.`);
    if (Number(file.size ?? 0) <= 0) errors.push(`Fil ${index + 1}: filen er tom eller mangler størrelse.`);
    if (Number(file.size ?? 0) > Number(policy.max_file_bytes ?? 0)) errors.push(`Fil ${index + 1}: filen er større enn tillatt grense.`);
    if (!roles.has(file.role)) errors.push(`Fil ${index + 1}: dokumentrollen ${file.role || 'ukjent'} er ikke gyldig.`);
    else presentRoles.add(file.role);

    if (!file.name) warnings.push(`Fil ${index + 1}: mangler filnavn i metadata.`);
  }

  for (const required of policy.required_roles ?? []) {
    if (!presentRoles.has(required)) errors.push(`Påkrevd dokument mangler: ${required}.`);
  }

  warnings.push('MIME-type fra nettleseren er ikke tilstrekkelig sikkerhetskontroll. Backend må verifisere filsignatur/magic bytes før behandling.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    file_count: files.length,
    total_bytes: totalBytes,
    roles: [...presentRoles]
  };
}
