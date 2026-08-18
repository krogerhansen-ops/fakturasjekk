# Fakturasjekk – Supabase Edge runtime

Dato: 18.08.2026
Status: Runtime- og preflight-kode klar. Kunde-API er ikke aktivert eller deployet.

## Mål

Bruke Supabase Edge Functions som mulig V1 API-runtime for å holde faste kostnader nær 0 kr og redusere antall databehandlere, uten å svekke eksisterende auth-, betaling-, rate-limit-, retention- eller sikkerhetsgrenser.

## Arkitektur

Fakturasjekk har nå to HTTP-runtimeformer over samme `api.invoke(...)` og samme rutemanifest:

- Node HTTP runtime: `server/node-runtime.mjs`
- Web Fetch runtime: `server/fetch-runtime.mjs`

`server/production-app.mjs` eksponerer både `handler` (Node) og `fetchHandler` (Web/Edge). Dermed skal vi ikke vedlikeholde en separat juridisk-/forretningslogikk for Edge Functions.

Fetch-runtimeen håndhever:

- samme `ROUTES` og route-parametre
- samme auth-adapter
- samme origin/CORS-regler
- samme JSON/body size limits
- samme rate-limit service
- raw-body bevaring for signerte betalingswebhooks
- samme fail-closed API-feil
- samme produksjons-security headers og `no-store`

## Auth-strategi på Edge

Fakturasjekk har både:

- brukerbeskyttede API-ruter
- offentlige tekniske health/readiness-ruter
- en betalingswebhook som må kunne kalles uten bruker-JWT, men som verifiseres kryptografisk av betalingsproviderens egen webhook-adapter

Derfor skal vi ikke stole på at én gateway-level JWT-regel alene kan uttrykke alle rutetypene i én «fat function».

`server/supabase-auth-adapter.mjs` kan validere en Bearer JWT direkte mot **Fakturasjekks eget Supabase Auth endpoint**:

`GET https://jxmkaxwflouacuboaetg.supabase.co/auth/v1/user`

med prosjektets publishable key og brukerens JWT. Ved nettverksfeil, ikke-200 eller ugyldig user-id returnerer adapteren null og den eksisterende Fakturasjekk-auth-rutinen avviser beskyttede ruter. Bare `user.id` returneres videre til applikasjonen; e-post og user metadata kastes bort.

Dette gjør det mulig å bruke funksjonsnivå `verify_jwt = false` for en senere samlet API-funksjon **kun dersom** Fakturasjekks egen route-auth og signaturverifisering fortsatt er aktiv. Alternativt kan webhooks splittes i en egen funksjon og kunde-API bruke Supabase gateway JWT-verifisering. Dette valget tas først når betalingsprovider er implementert og live Edge-test kan gjennomføres.

## Preflight-funksjon

`supabase/functions/fakturasjekk-preflight/index.ts` er den eneste Edge Function som er konfigurert nå.

Den:

- tar kun GET
- leser `SUPABASE_URL`
- krever eksakt project origin `https://jxmkaxwflouacuboaetg.supabase.co`
- returnerer 503 ved feil prosjekt
- returnerer ingen secret, databaseinformasjon eller kundedata
- har `customer_upload_enabled: false`
- har `production_api_enabled: false`
- bruker `no-store` og strenge sikkerhetsheadere

Den er offentlig (`verify_jwt = false`) fordi den ikke gir tilgang til data eller handlinger. Det virkelige `fakturasjekk-api` er bevisst ikke konfigurert ennå.

## Hvorfor preflight først

Preflight lar oss verifisere:

1. at Edge Functions kan deployes til riktig Fakturasjekk-prosjekt
2. at funksjons-URL og region/prosjektbinding fungerer
3. at GitHub/CLI-deploy ikke peker på Karriere eller et annet prosjekt
4. at ingen kundebehandling åpnes samtidig

## Deployment

Supabase CLI kan deploye funksjoner fra `supabase/functions`. Nyere CLI/API-deploy støtter også monorepo-importer utenfor `supabase/`, som er nødvendig dersom den ferdige Edge-funksjonen skal importere Fakturasjekks eksisterende servermoduler direkte i stedet for å kopiere logikk.

Deployment skal være pinned/CI-kontrollert og bruke prosjekt-ref `jxmkaxwflouacuboaetg`. Production API skal ikke deployes fra en generisk `latest`-avhengighet uten ny supply-chain review.

## Blokkere før ekte `fakturasjekk-api`

- live Supabase schema/RLS/bucket read-back
- Security Advisor gjennomført
- Supabase Auth live-test
- server-side Supabase database/storage adapter
- malware/magic-byte scanner
- dokumenttolk/OCR
- response interpreter
- betalingsprovider og signert webhook
- distributed rate limit live-test
- DPA/transfer review
- DPIA endelig godkjenning
- deletion + backup/restore E2E
- launch-gate grønn

`production_upload_enabled` skal forbli false til alle nødvendige gater er complete.

## Offisielle Supabase-kilder

- Edge Functions: https://supabase.com/docs/guides/functions
- Development environment / shared code: https://supabase.com/docs/guides/functions/development-environment
- Deploy to production: https://supabase.com/docs/guides/functions/deploy
- Function configuration: https://supabase.com/docs/guides/functions/function-configuration
- Authorization headers: https://supabase.com/docs/guides/functions/auth-headers
- Securing Edge Functions: https://supabase.com/docs/guides/functions/auth
- JWT verification: https://supabase.com/docs/guides/auth/jwts
