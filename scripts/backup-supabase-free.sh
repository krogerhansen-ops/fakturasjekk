#!/usr/bin/env bash
set -euo pipefail

# Fakturasjekk database backup for Supabase Free.
# Produces only an encrypted database dump. Source documents in Supabase Storage are deliberately NOT backed up here.
# Required environment variables:
#   DATABASE_URL   - Fakturasjekk production PostgreSQL connection string
#   AGE_RECIPIENT  - age public recipient, e.g. age1...
# Optional:
#   BACKUP_DIR     - defaults outside the repository
#   BACKUP_MAX_DAYS - defaults to 35 and may not exceed 35

umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"

BACKUP_DIR="${BACKUP_DIR:-${HOME}/.local/share/fakturasjekk-backups}"
BACKUP_MAX_DAYS="${BACKUP_MAX_DAYS:-35}"

if ! [[ "${BACKUP_MAX_DAYS}" =~ ^[0-9]+$ ]] || (( BACKUP_MAX_DAYS < 1 || BACKUP_MAX_DAYS > 35 )); then
  echo "BACKUP_MAX_DAYS must be an integer between 1 and 35." >&2
  exit 2
fi

for command_name in pg_dump age; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 3
  fi
done

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${BACKUP_DIR}/fakturasjekk-db-${timestamp}.dump.age"
temporary_destination="${destination}.partial"

cleanup() {
  rm -f "${temporary_destination}"
}
trap cleanup EXIT INT TERM

# pg_dump writes its custom-format dump to stdout, which is piped directly into age.
# No plaintext database dump is written to disk.
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file=- \
  | age --recipient "${AGE_RECIPIENT}" --output "${temporary_destination}"

if [[ ! -s "${temporary_destination}" ]]; then
  echo "Encrypted backup is empty; refusing to publish it." >&2
  exit 4
fi

mv "${temporary_destination}" "${destination}"
chmod 600 "${destination}"
trap - EXIT INT TERM

# Enforce the product's maximum rotating-backup window.
find "${BACKUP_DIR}" -type f -name 'fakturasjekk-db-*.dump.age' -mtime "+${BACKUP_MAX_DAYS}" -delete

echo "Encrypted Fakturasjekk database backup created: ${destination}"
echo "Retention: maximum ${BACKUP_MAX_DAYS} days. Supabase Storage source documents are not included."
