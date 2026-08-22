#!/usr/bin/env bash
set -euo pipefail

# Restore a Fakturasjekk encrypted database backup into an ISOLATED target only.
# This script deliberately refuses the production Supabase project before any
# backup decryption or database connection begins.
#
# Required environment variables:
#   RESTORE_DATABASE_URL
#   RESTORE_CONFIRMATION=I_UNDERSTAND_ISOLATED_RESTORE_ONLY
#   AGE_IDENTITY_FILE
# Optional for localhost; required for Supabase restore targets:
#   RESTORE_TARGET_PROJECT_REF
#
# Usage:
#   ./scripts/restore-backup-isolated.sh /path/to/fakturasjekk-db-....dump.age

umask 077

backup_file="${1:-}"
if [[ -z "${backup_file}" || ! -f "${backup_file}" || ! -s "${backup_file}" ]]; then
  echo 'A non-empty encrypted backup file is required.' >&2
  exit 2
fi

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${RESTORE_CONFIRMATION:?RESTORE_CONFIRMATION is required}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"

if [[ ! -f "${AGE_IDENTITY_FILE}" ]]; then
  echo 'AGE_IDENTITY_FILE does not exist.' >&2
  exit 2
fi

for command_name in node age pg_restore; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 3
  fi
done

# Critical ordering: validate the destination before invoking age or pg_restore.
node ./scripts/validate-isolated-restore-target.mjs

echo 'Restore target accepted as isolated. Restoring encrypted database stream...'

# No plaintext dump is written to persistent disk. The restored database must
# remain quarantined after this command; deletion tombstones still need to be
# reapplied before any user/API access is permitted.
age --decrypt --identity "${AGE_IDENTITY_FILE}" "${backup_file}" \
  | pg_restore \
      --dbname="${RESTORE_DATABASE_URL}" \
      --no-owner \
      --no-privileges \
      --clean \
      --if-exists \
      --exit-on-error

echo 'DATABASE RESTORE COMPLETE — TARGET REMAINS QUARANTINED.'
echo 'Do NOT expose this database to users or an API yet.'
echo 'Next mandatory step: connect the verified deletion-ledger source and run createRestoreSafety(...).reapplyDeletionTombstones().' 
echo 'Only safe_to_open_restored_data=true plus post-restore verification may release quarantine.'
