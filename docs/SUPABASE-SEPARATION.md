# Fakturasjekk – Supabase-separasjon

Fakturasjekk er et eget produkt og skal aldri dele Supabase-prosjekt, database, Storage, Auth, Edge Functions, nøkler, secrets, tabeller eller brukere med Karriere-appen.

## Hard regel

- Karriere-prosjektet er utenfor scope.
- Ingen project-ref, DATABASE_URL, service-role/secret, bucket, Auth-issuer eller annen ressurs fra Karriere skal brukes av Fakturasjekk.
- Produksjon skal bruke et dedikert Supabase-prosjekt, anbefalt navn `fakturasjekk-prod`, i en egen Supabase-organisasjon `Fakturasjekk` dersom mulig.
- Utvikling/test skal bruke egne Fakturasjekk-ressurser eller lokale/syntetiske fixtures.
- Kjente Karriere-identifikatorer skal aldri legges inn i Fakturasjekk-repoet eller runtime-konfigurasjonen.

## Målarkitektur på Supabase Free

Det dedikerte Fakturasjekk-prosjektet kan samle flere funksjoner for å holde faste kostnader lave:

- PostgreSQL: saker, dokumentmetadata, audit, betaling/idempotens og rate-limit state.
- Auth: brukersesjoner/JWT.
- Storage: private dokumentbuckets, aldri public.
- Edge Functions: API-adapter/webhook-endepunkter der runtime passer.
- RLS: eierisolasjon som ekstra lag i tillegg til server-side autorisasjon.

## Produksjonskrav

1. Alle tabeller i eksponerte schema har RLS aktivert.
2. Kunde-tilgjengelige policies krever både autentisering og eksplisitt eierskap (`auth.uid() = user_id`).
3. `service_role`/secret key finnes aldri i browser eller GitHub Pages.
4. Private dokumenter ligger i private buckets med eierbaserte Storage policies.
5. Signed upload/download er kortlivede og knyttet til riktig sak/eier.
6. Edge Functions er JWT-verifiserte som standard; webhooks er eneste unntak og må verifisere leverandørsignatur selv.
7. Backup, retention og sletting følger `config/retention-policy.json`.
8. Supabase Security Advisor skal være uten kritiske funn før launch.

## Organisasjon

Per 18.08.2026 er den eksisterende Supabase-organisasjonen `Karriere` på Free-plan. Fakturasjekk skal ikke opprettes i denne organisasjonen. Eier oppretter en egen Free-organisasjon `Fakturasjekk`; deretter kan ChatGPT/Supabase-integrasjonen opprette og konfigurere `fakturasjekk-prod`.
