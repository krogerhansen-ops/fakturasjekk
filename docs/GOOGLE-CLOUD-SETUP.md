# Fakturasjekk – Google Cloud-oppsett

Dato: 19.08.2026
Status: Oppsettsguide. Ikke live-godkjent.

## Mål

Fakturasjekk skal ha et **eget Google Cloud-prosjekt**, adskilt fra alle andre apper/prosjekter. Dette prosjektet brukes kun til:

- Google Cloud Vision OCR
- Google Vertex AI strukturert faktatolk
- Google Vertex AI Svarrunde 2

Ikke gjenbruk Google Cloud-prosjekt, service account eller credentials fra Karriere eller andre produkter.

## Kostnadsprinsipp

Start på pay-as-you-go og bruk de eksisterende produktgrensene for å holde volum nede:

- Vision: maks 20 sider per dokument / 15 MiB
- Gemini: maks 100 000 OCR-tegn til faktatolk
- maks 120 000 request-JSON-tegn
- maks 4 096 output tokens
- én kandidat, temperatur 0

Sett et lavt Google Cloud-budgett og kostnadsvarsler før live. Et budgett er et varsel og må ikke behandles som en automatisk hard kostnadssperre; produktets egne volumgrenser er fortsatt nødvendige.

## Manuell opprettelse

1. Opprett et nytt Google Cloud-prosjekt med et tydelig Fakturasjekk-navn.
2. Knytt prosjektet til egen billing-konto/billing-oppsett som er godkjent for Fakturasjekk.
3. Aktiver bare API-ene V1 trenger:
   - Cloud Vision API (`vision.googleapis.com`)
   - Vertex AI API (`aiplatform.googleapis.com`)
4. Opprett en dedikert runtime-identitet, foreslått navn `fakturasjekk-ai-runtime`.
5. Ikke gi runtime-identiteten Owner eller Editor.
6. Vurder/minimer IAM til det som faktisk trengs. V1-koden forventer at minst følgende vurderes:
   - `roles/aiplatform.user` for Vertex AI-kall
   - `roles/serviceusage.serviceUsageConsumer` der quota/service usage krever det
7. V1 OCR sender dokumentbytes direkte til Vision. Den trenger derfor ikke en egen Google Cloud Storage-bucket eller GCS-rolle med dagens arkitektur.
8. Verifiser at Vision bruker `eu` og at Vertex bruker EU-multiregion-endepunktet før kundedata tillates.

## Autentisering – prioritet

### 1. Foretrukket: nøkkelfri federation

Dersom Supabase Edge senere kan autentiseres mot Google gjennom en verifisert workload-identity federation uten en langtids service-account key, skal dette foretrekkes. Det reduserer risikoen ved statiske private nøkler.

Dette skal **ikke improviseres**. Federation-gaten kan først lukkes når issuer/audience/subject-binding og minste IAM faktisk er testet fra Fakturasjekk-runtime.

### 2. Kontrollert fallback: service-account key

Repoet har `server/google-service-account-token.mjs` som fallback dersom nøkkelfri federation ikke er praktisk ved første lansering.

Fallbacken:

- signerer en RS256 JWT assertion server-side
- bruker service-account e-post som `iss`
- bruker `cloud-platform` scope
- bruker Googles offisielle OAuth-tokenendepunkt som `aud`
- setter JWT-levetid til én time
- bytter assertion mot et kortlevd access token
- cacher bare access token og fornyer det før utløp
- bruker ikke `sub` / domain-wide delegation

Hvis fallback brukes:

1. Opprett **én** key for `fakturasjekk-ai-runtime`.
2. Last ned JSON én gang.
3. Legg hele JSON-verdien inn som server-side secret med navnet `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Ikke lim nøkkelen inn i kildekode, GitHub issue, ChatGPT, frontend-konfig eller GitHub Pages.
5. Ikke opprett flere keys «for sikkerhets skyld».
6. Roter/slett key ved mistanke om eksponering og ved overgang til federation.

## Secrets

Følgende er server-only:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- eventuelle federation credentials/config som gir runtime-token

Følgende kan være ikke-hemmelig konfig:

- `GOOGLE_CLOUD_PROJECT_ID`
- location `eu`
- modell-ID
- API-hosts

GitHub Pages skal aldri få service-account JSON, private key, OAuth access token eller Supabase/Vipps server secrets.

## Samme auth-grense for Vision og Vertex

Både `server/google-vision-ocr.mjs` og `server/google-structured-ai-client.mjs` forventer kun et objekt med `getAccessToken()`.

Dermed kan samme kortlevde token-provider brukes for begge. Dette unngår ekstra SDK, ekstra credential-format og ekstra leverandør.

## Logging og personvern

Før live skal Google-oppsettet kontrolleres for:

- request/response logging
- caching
- supporttilgang
- underleverandører
- behandlingssteder
- eventuell tredjelandstilgang
- DPA og relevante overføringsmekanismer
- bruk av kundedata til produktforbedring/trening

Fakturasjekks egen kode logger ikke dokumenttekst eller modellrespons i providerklientene. Numeric usage metadata kan brukes til kostnadskontroll uten kundetekst.

## Live-verifikasjon med syntetiske data

Før en eneste ekte faktura:

1. hent kortlevd Google access token fra Fakturasjekk-runtime
2. kjør én syntetisk Vision OCR-request mot EU-endepunktet
3. bekreft at side-/total-page-kontroll består
4. kjør én syntetisk Gemini structured-output-request mot EU-endepunktet
5. bekreft schema, modell-ID og token usage
6. kjør prompt-injection-syntetikk
7. kontroller Cloud logs for at uønsket dokument-/modellinnhold ikke lagres av vårt oppsett
8. dokumenter IAM som faktisk var nødvendig
9. oppdater providerregister, DPIA og launch-gate

## Ikke gjør dette

- ikke bland med Karriere
- ikke bruk personlig Google OAuth som produksjonsruntime
- ikke bruk global Vertex-host når policy krever EU
- ikke gi Owner/Editor til runtime-service-account
- ikke lag service-account JSON i repoet
- ikke sende source docs til GitHub Pages
- ikke aktivere ekte kundeopplasting før launch-gatene er grønne

## Offisielle referanser

- Google server-to-server OAuth: https://developers.google.com/identity/protocols/oauth2/service-account
- Google authentication overview / federation: https://cloud.google.com/docs/authentication
- Google service-account key security: https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
- Vertex AI access control: https://cloud.google.com/vertex-ai/docs/general/access-control
- Vision authentication: https://cloud.google.com/vision/docs/authentication
