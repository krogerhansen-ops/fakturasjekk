# Fakturasjekk – Google Cloud Vision OCR

Dato: 18.08.2026
Status: Kode/policy klar som OCR-kandidat. Ikke live-/GDPR-godkjent før credentials, avtaler, live EU-test og full provider review er gjennomført.

## Formål

Google Cloud Vision brukes kun som maskinlesingslag for dokumenttekst. OCR får ikke ansvar for:

- juridisk regelvalg
- paragrafhenvisninger
- rettslige konklusjoner
- endelig faktavurdering
- innsigelsestekst

OCR-tekst sendes videre til en separat, kontraktstyrt faktatolk. Fakturasjekks deterministiske regelmotor og verifiserte regelregister forblir egne lag.

## Region

V1 krever Vision location `eu` og bruker regionalt endpoint:

`https://eu-vision.googleapis.com`

Prosjekt-/location-path brukes også i requesten: `projects/{project}/locations/eu`.

Kode skal feile dersom en annen location forsøkes konfigurert.

## Dokumentstøtte

Bilder:

- JPEG
- PNG
- WebP

PDF:

- `files:annotate`
- første request lar Vision returnere første fem sider og `totalPages`
- dersom dokumentet har mer enn fem sider, fortsetter Fakturasjekk med eksplisitte 5-siders puljer
- alle sider må være returnert før dokumentet regnes som OCR-komplett
- V1 produktgrense: maks 20 sider per dokument
- >20 sider gir fail-closed `ocr_page_limit_exceeded`; systemet lager ikke resultat basert på et ufullstendig utdrag

## Kostnadskontroll

Vision priser OCR per side/enhet. Google oppgir en gratis kvote for de første 1 000 enhetene per måned for Text Detection / Document Text Detection på dagens prisside. Dette er en kostnadsfordel i tidlig fase, men gratisgrensen er **ikke** en juridisk eller teknisk antakelse i runtime.

Runtime-kontroller:

- maks 20 sider per dokument
- maks 15 MiB per dokument
- ingen ubundet retry-loop
- ingen ekstra GCS async-pipeline i V1
- ingen OCR når dokumentreservasjonen ikke er verifisert `uploaded`

Prisendringer hos provider skal kunne håndteres uten å endre juridisk motor.

## OAuth

`server/google-vision-ocr.mjs` tar en `accessTokenProvider` i stedet for å hardkode service-account secrets eller bygge dem inn i browseren.

Før live må Google Cloud auth velges og dokumenteres. Krav:

- credential kun server-side
- minst mulige IAM-rettigheter
- token/secrets aldri i audit eller frontend
- Fakturasjekk-Google-prosjekt skal være separat og tydelig navngitt
- OAuth scope begrenses til nødvendig Vision/Cloud-tilgang

## Dataminimering

OCR-klienten får kun de dokumentene som faktisk er `uploaded` og verifisert av Fakturasjekk.

Resultat fra OCR begrenses videre til:

- document id
- rolle
- MIME-type
- totalt sidetall
- sideindeks
- OCR-tekst

OAuth-token, storage-secret og provider-responsmetadata sendes ikke videre til faktatolken.

OCR-tekst skal ikke være bruker-synlig som standard og skal følge sakens retention.

## Fail-closed

Dokumentet avvises fra videre analyse dersom:

- EU-location ikke brukes
- access token mangler
- Vision returnerer feil
- total page count mangler/er ugyldig
- sidegrensen overstiges
- en sidebatch mangler sider
- Vision rapporterer sidefeil
- dokumentet er tomt/for stort
- MIME-type ikke støttes

## Live-gater som fortsatt gjenstår

- eget Google Cloud-prosjekt / credentials
- Vision API aktivert
- IAM/minimum scope
- faktisk request mot `eu` med syntetisk dokument
- DPA/databehandlerstatus og underleverandør-/support-/transfer review
- kostnadsvarsel/budsjett i Google Cloud
- sikker lesing av kildebytes fra privat Supabase Storage
- faktatolk som produserer Fakturasjekks strict extraction schema
- E2E: upload → OCR → faktatolk → extraction validation → rule engine

## Offisielle kilder

- Vision pricing: https://cloud.google.com/vision/pricing
- Vision locations: https://cloud.google.com/vision/docs/ocr#regionalization
- `projects.files.annotate`: https://docs.cloud.google.com/vision/docs/reference/rest/v1/projects.files/annotate
- `AnnotateFileRequest`: https://docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateFileRequest
- Vision authentication overview: https://cloud.google.com/docs/authentication
