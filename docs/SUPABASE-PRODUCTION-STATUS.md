# Fakturasjekk – Supabase production status

Dato: 18.08.2026

## Confirmed setup

- Dedicated Supabase organization: `Fakturasjekk`
- Dedicated project: `fakturasjekk-prod`
- Project ref: `jxmkaxwflouacuboaetg`
- Region: `eu-north-1` (Stockholm)
- Plan: Free
- Confirmed project cost at creation: 0 per month
- Shared with other products: no
- Karriere project/database/storage/auth/keys: out of scope and must never be used by Fakturasjekk

## Architecture decision

Supabase is the V1 target for:

- PostgreSQL
- Auth
- private object storage
- optionally Edge Functions where it reduces infrastructure cost without weakening security

The browser must not receive database credentials or a Supabase secret/service-role key. Direct browser CRUD against Fakturasjekk application tables is intentionally revoked in V1. Trusted API/server logic remains the authorization and payment boundary, with RLS as defense in depth.

## Production identity lock

`server/production-config.mjs` rejects production configuration unless all of the following agree with the dedicated Fakturasjekk project:

- `SUPABASE_PROJECT_REF=jxmkaxwflouacuboaetg`
- `SUPABASE_URL=https://jxmkaxwflouacuboaetg.supabase.co`
- `DATABASE_URL` belongs to this project, either via the direct `db.<ref>.supabase.co` endpoint or Supavisor username `postgres.<ref>`
- `AUTH_ISSUER=https://jxmkaxwflouacuboaetg.supabase.co/auth/v1`
- private bucket name is `case-documents-private`

This is intended to prevent accidental connection of Fakturasjekk production code to another Supabase project.

## Prepared schema/security migration

`supabase/migrations/20260818231500_fakturasjekk_core.sql` prepares:

- cases and case events
- document metadata
- analyses
- payment records and replay claims
- drafts, supplier responses and follow-ups
- idempotency records
- data-minimized audit records
- distributed rate-limit counters
- RLS enabled on every app table
- browser CRUD revoked for `anon` and `authenticated`
- private `case-documents-private` bucket
- 15 MiB file-size ceiling
- PDF/JPEG/PNG/WebP allowlist
- no direct browser Storage policies

## Still blocked pending live verification

The following MUST NOT be marked complete from repository code alone:

1. migration exists in the live project and all expected tables are present
2. RLS is enabled in the live database
3. browser roles have no unintended grants
4. private bucket exists and is not public
5. Security Advisor has been run and launch-relevant warnings resolved
6. Auth JWT/signing configuration has been verified against the live project
7. actual database/pooler credentials are stored only in a server-side secret store
8. deletion/retention behavior has been tested end-to-end

The Supabase connector became unavailable while live migration read-back was being attempted. Therefore `production_upload_enabled` remains false and the launch gate remains fail-closed.

## Provider/privacy review

Supabase documents `eu-north-1` as Stockholm and states that hosted projects operate under its security/compliance controls and shared-responsibility model. This does not replace Fakturasjekk's own GDPR obligations. Before live customer documents are processed, the processor agreement, subprocessors, support-access paths and any transfers outside the EEA must be documented in the processor/transfer register and final DPIA.

Official references:

- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/docs/guides/security
- https://supabase.com/docs/guides/deployment/shared-responsibility-model
- https://supabase.com/docs/guides/auth/jwt-fields
- https://supabase.com/docs/guides/database/connecting-to-postgres
