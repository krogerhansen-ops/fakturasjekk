# Fakturasjekk – launch-runbook for 19.08.2026

Målet er å kunne gå fra grønn launch candidate til første ekte betalende kunde uten å omgå sikkerhetsgrensene i produktet.

## Status etter RC-bygg

Følgende er allerede bygget i kode:

- deterministisk faktura-/avtaleanalyse
- dokumentlinje- og regnekontroll
- kontrollert Regel- og paragrafkontroll
- fail-closed rettskildeferskhet
- OCR/extractor-kontrakt med allowlist, confidence og kildekrav
- brukerbekreftelse av usikker dokumentavlesning
- privat signert upload-kontrakt
- PostgreSQL-adaptere for saker, audit, idempotens og betalingshendelser
- distribuert rate-limit via PostgreSQL
- JWT-auth-kontrakt med issuer + audience
- server-verifisert betalingsport og webhook-kontrakt
- 29 kr fastpris
- retention/purge og brukerstyrt sletting
- Svarrunde 2
- full CI-/sikkerhetstestpakke
- offentlig kunde-RC med syntetiske demosaker

## Det som fortsatt må provisioneres eksternt

Disse kan ikke ferdigstilles bare ved å skrive mer kode i repoet; de krever faktiske kontoer, nøkler, domener eller virksomhetsopplysninger.

### 1. Produksjonshosting

Velg en Node-kompatibel HTTPS-runtime for API-et og sett:

- `NODE_ENV=production`
- `APP_ORIGIN=https://...`
- `API_ORIGIN=https://...`

### 2. PostgreSQL

Opprett produksjonsdatabase, kjør repoets PostgreSQL-skjema/migrering og sett:

- `DATABASE_URL=postgresql://...`

Databasen brukes også til idempotens, betalingshendelser, audit og distribuert rate-limit.

### 3. Privat objektlagring

Velg privat object storage med støtte for signert PUT, metadata/head, sletting og malware-/filtypekontroll. Sett:

- `PRIVATE_STORAGE_BUCKET=...`
- `ENCRYPTION_KEY_ID=...`

Ingen kildefaktura skal publiseres eller lagres i en offentlig bucket.

### 4. Autentisering

Velg JWT-basert auth-leverandør og konfigurer verifier/JWKS i runtime. Sett:

- `AUTH_ISSUER=https://...`
- `AUTH_AUDIENCE=...`

Produksjon skal ikke starte hvis audience mangler.

### 5. Dokumenttolk / OCR

Koble en faktisk dokumenttolk bak den eksisterende validerte extractor-kontrakten. Sett:

- `DOCUMENT_EXTRACTOR_PROVIDER=...`

Leverandøren skal kun returnere tillatte faktuelle felt med `confidence`, `source_document_id` og `source_page`. Den får ikke returnere juridiske konklusjoner.

### 6. Svarrunde 2-tolk

Koble faktisk teksttolk bak den validerte response-interpreter-kontrakten. Sett:

- `RESPONSE_INTERPRETER_PROVIDER=...`

Klienten sender bare leverandørens tekst. Interne funnkoder skal ikke kunne injiseres fra browseren.

### 7. Betaling

Velg betalingsleverandør, implementer/konfigurer gateway-adapter og webhook-signaturverifisering. Sett:

- `PAYMENT_PROVIDER=...`

Fullresultat skal kun åpnes etter signaturverifisert server-til-server hendelse for nøyaktig 29 NOK og riktig sak.

### 8. Virksomhetsidentitet og kundekontakt

Før offentlig betalt launch må følgende være bestemt og stå konsekvent på side, checkout, kvittering, vilkår og personvernerklæring:

- juridisk selger / behandlingsansvarlig
- organisasjonsnummer dersom relevant
- forretnings-/postadresse der regelverket krever det
- kundeservice-e-post
- kontaktpunkt for personvern

### 9. Personvern og avtaler

Før ekte fakturaer kan lastes opp:

- avgjør og dokumenter DPIA-behov; fullfør DPIA dersom nødvendig
- dokumenter behandlingsgrunnlag per datatype/formål
- ferdigstill personvernerklæring
- inngå databehandleravtaler med valgte leverandører
- vurder eventuelle tredjelandsoverføringer
- godkjenn retention-perioder
- test innsyn/sletting/dataportabilitet der relevant
- ha hendelses-/avviksprosedyre

### 10. Kjøpsflyt

Før 29 kr-checkout åpnes:

- ferdige kjøpsvilkår
- totalpris 29 kr tydelig før betaling
- personvernlenke ved checkout
- gjennomgå angrerett/digital tjeneste-leveringsoppsett for den faktiske kjøpsflyten
- kvitterings-/ordrebekreftelsesflyt

## Go-live test i riktig rekkefølge

1. Kjør `npm test` – alt må være grønt.
2. Start produksjonsappen med ekte konfig – den skal nekte å starte hvis launch-gate/adapters mangler.
3. Opprett en testbruker via ekte auth.
4. Opprett testsak.
5. Last opp en ufarlig syntetisk PDF via ekte signert privat upload.
6. Bekreft magic bytes, MIME, størrelse og malware-status.
7. Kjør extractor og kontroller kilde/confidence.
8. Tving frem ett lav-confidence-felt og test brukerbekreftelse.
9. Kjør analyse og kontroller at internkoder ikke vises.
10. Start ekte testbetaling på 29 kr i leverandørens testmiljø.
11. Kontroller at browser redirect alene ikke åpner resultatet.
12. Send signaturverifisert webhook og kontroller at riktig sak åpnes.
13. Lag utkast og kontroller paragrafreferanser mot Lovdata.
14. Test leverandørsvar / Svarrunde 2.
15. Slett saken og verifiser database + object storage end-to-end.
16. Test retention/purge-jobb.
17. La minst én person uten prosjektkunnskap gjennomføre hele kundeopplevelsen.
18. Sett launch-gate-punktene til `complete` med konkret evidence.
19. Først da: sett `production_upload_enabled=true` og åpne betalt trafikk.

## Produksjonsregel

Ikke slå av eller omgå launch-gaten for å komme raskere på lufta. Fakturasjekk håndterer potensielt sensitive faktura- og tvistedata og produserer juridisk relevant informasjon. En blokkert produksjonsstart er en funksjon, ikke en feil.
