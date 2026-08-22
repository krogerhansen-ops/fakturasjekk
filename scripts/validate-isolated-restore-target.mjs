const PROD_REF = 'jxmkaxwflouacuboaetg';
const PROD_HOST = `db.${PROD_REF}.supabase.co`;

export function validateIsolatedRestoreTarget({ databaseUrl, targetProjectRef = '', confirmation = '' } = {}) {
  const errors = [];
  if (confirmation !== 'I_UNDERSTAND_ISOLATED_RESTORE_ONLY') errors.push('Explicit isolated-restore confirmation is required.');

  let url;
  try { url = new URL(databaseUrl); } catch { errors.push('RESTORE_DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (url && !['postgres:', 'postgresql:'].includes(url.protocol)) errors.push('Restore target must use PostgreSQL.');

  const host = String(url?.hostname ?? '').toLowerCase();
  const ref = String(targetProjectRef || '').trim().toLowerCase();
  if (!host) errors.push('Restore target host is missing.');
  if (host === PROD_HOST || host.includes(PROD_REF) || ref === PROD_REF) errors.push('Production Fakturasjekk Supabase project is forbidden as a restore-test target.');

  const localhost = ['localhost', '127.0.0.1', '::1'].includes(host);
  const supabaseMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!localhost && !supabaseMatch) errors.push('Restore target must be localhost or an explicitly identified non-production Supabase project.');
  if (supabaseMatch && !ref) errors.push('RESTORE_TARGET_PROJECT_REF is required for a Supabase restore target.');
  if (supabaseMatch && ref && supabaseMatch[1] !== ref) errors.push('Restore target host and RESTORE_TARGET_PROJECT_REF do not match.');

  return {
    safe: errors.length === 0,
    errors,
    target: errors.length ? null : { host, project_ref: localhost ? 'local' : ref, database: url.pathname.replace(/^\//, '') || null }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateIsolatedRestoreTarget({
    databaseUrl: process.env.RESTORE_DATABASE_URL,
    targetProjectRef: process.env.RESTORE_TARGET_PROJECT_REF,
    confirmation: process.env.RESTORE_CONFIRMATION
  });
  if (!result.safe) {
    console.error(`BLOCKED: ${result.errors.join(' ')}`);
    process.exit(2);
  }
  console.log(`OK isolated restore target: ${result.target.host} (${result.target.project_ref})`);
}
