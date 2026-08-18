#!/usr/bin/env bash
set -euo pipefail

EXPECTED_REF='jxmkaxwflouacuboaetg'
FUNCTION_NAME='fakturasjekk-preflight'

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required by the Supabase CLI}"

if ! command -v supabase >/dev/null 2>&1; then
  echo 'Supabase CLI is required.' >&2
  exit 2
fi

project_ref="${SUPABASE_PROJECT_REF:-${EXPECTED_REF}}"
if [[ "${project_ref}" != "${EXPECTED_REF}" ]]; then
  echo "Refusing deploy: expected Fakturasjekk project ${EXPECTED_REF}, got ${project_ref}." >&2
  exit 3
fi

# API-based deployment is intentional: it supports the repository/monorepo layout without Docker.
supabase functions deploy "${FUNCTION_NAME}" \
  --project-ref "${EXPECTED_REF}" \
  --use-api

echo "Deployed ${FUNCTION_NAME} to dedicated Fakturasjekk project ${EXPECTED_REF}."
echo "This preflight does not enable customer uploads or the production API."
