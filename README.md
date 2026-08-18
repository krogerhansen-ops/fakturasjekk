# Fakturasjekk.no

Fakturasjekk.no er et norsk forbrukerverktøy for kontroll av faktura mot tilbud, avtale og relevant regelverk.

## Status

Aktuell utviklingsversjon: **V0.50**.

Kundepris i V1: **29 kr for full fakturasjekk + utkast til innsigelse.**

Demoen er gratis og bruker bare syntetiske saker.

### Delbar kundedemo

`https://krogerhansen-ops.github.io/fakturasjekk/`

GitHub Pages bygges nå som en ren kunde-/testerdemo. Interne motor-, admin- og flytverktøy publiseres ikke lenger som egne Pages-ruter; de beholdes i repoet og kvalitetstestes i CI.

## Produktarkitektur som er bygget

- Ekstern kundedemo med fire syntetiske saker og gratis demo før betaling
- Regel- og paragrafkontroll med Lovdata som primærkilde
- Versjonert regelregister med kontrollstatus, kilde og kontrolldato
- 11 aktive V1-regler og egen overgangsvakt for ny inkassolov av 2026
- Daglig fail-closed kildevakt for aktive Lovdata-kilder og lovoverganger
- Deterministisk analysemotor for prisavvik, 15 %-kontroll, fakturagebyr, dobbeltføringer, linjesummer og formelle mangler
- Separat inkassomotor som skiller hovedkravet fra inkassobehandlingen
- Inntaksmotor som stopper B2B og ikke-støttede sakstyper før regelanalyse
- Bevis-/provenienslag: dokumentert, brukeropplyst, beregnet, regel og må-avklares
- Kontrollert utkastsgenerator som bare kan sitere aktive regler
- Kundesikker resultatprojeksjon som fjerner interne regel-ID-er, funnkoder, storage keys og betalingsreferanser
- «Ingen dokumenterte avvik» som gyldig resultat
- Svarrunde 2: klienten sender bare leverandørens svartekst; serveren mapper svaret mot eksisterende funn og lager kun oppfølging for åpne punkter
- Saksmappe/tilstandsmaskin som bevarer hendelseshistorikk for dokumenter, analyser, betaling, utkast, leverandørsvar og oppfølging
- Mine saker + brukerstyrt sletting
- Personvernorientert retention-motor med kortvarig standardmodus, eksplisitt lagret sak og automatiske utløpsdatoer
- Utførende purge-service for kildefiler og utløpt saksinnhold

## Dokument- og KI-sikkerhet

- Filpolicy for PDF/JPEG/PNG/WebP, antall filer og størrelsesgrenser
- Privat, signert og tidsbegrenset opplastingskontrakt
- Analyse blokkeres til hver reservert fil er server-verifisert
- Produksjonsadapter skal kontrollere magic bytes, filstørrelse, MIME-type og malware-status
- Dokumentuttrekk/OCR har allowlist av tillatte faktuelle felt
- Ukjente extractor-felt og juridiske konklusjoner fra KI avvises
- Kritiske beløp krever høy confidence, dokument-ID og sidenummer
- Manglende eller tvetydige verdier skal ikke gjettes
- Fritekst fra bruker kan ikke bli dokumentert bevis uten dokumentkilde

## Betaling

- Fast pris: **29 kr**
- Fullresultatet er betalingslåst
- Kunden kan bare opprette checkout
- Det finnes ikke noe offentlig browser-endepunkt som kan sette `verified_server_side=true`
- Betaling registreres kun etter signaturverifisert server-til-server webhook fra betalingsleverandør
- Rå webhook-body bevares frem til signaturkontroll
- Idempotens beskytter sakopprettelse, opplasting, checkout, sletting og andre mutasjoner mot duplikater

## Backend/API

- Leverandørnøytral backend service-kjerne
- Native Node HTTP-runtime uten rammeverksbinding
- Bearer-auth adapterkontrakt
- CORS/origin-policy, request limits, rate limiting og sikkerhetsheadere
- Standardiserte API-feil uten stack traces
- OpenAPI 3.1-kontrakt
- PostgreSQL referanseskjema for saker, hendelser, dokumentmetadata, analyser, betaling, utkast, svar og audit
- Health- og readiness-endepunkter
- Readiness stopper produksjonsstatus dersom pris, regelkilder, privat lagring, extractor, Svarrunde 2-tolk eller betalingsgateway mangler
- Audit-logg er dataminimert og skal aldri inneholde dokumenttekst, fritekst, storage keys eller e-post
- Lokal syntetisk API kan startes med `npm run dev:api`; den nekter å kjøre utviklingsauth/-betaling i production mode

## Automatisk kvalitetssikring

`npm test` oppdager automatisk alle `tests/*.test.mjs` og kjører dem i GitHub Actions ved push/PR.

Testpakken dekker blant annet:

- regelregister og lovoverganger
- inntak og B2B-stopp
- deterministisk analysemotor
- inkassospor
- bevis/proveniens
- dokumentpolicy og signert opplasting
- extractor allowlist/confidence
- 29 kr betalingsport og webhook-grense
- Svarrunde 2
- saksmappe og sletting
- retention/purge
- API, auth, CORS og Node-runtime
- kundesikker projeksjon
- pris-/versjonskonsistens

## Sikkerhetsprinsipp

Fakturasjekk skal ikke bruke KI som:

`les dokument → finn en paragraf som høres riktig ut`

Målarkitekturen er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → forhåndsvisning → 29 kr betaling → kundesikkert resultat → kontrollert utkast → eventuell Svarrunde 2`

Hvis partstype, dokumentgrunnlag, KI-uttrekk eller rettskilde er usikker skal det aktuelle sporet stoppe eller be om avklaring i stedet for å gjette.

## Eksterne produksjonskoblinger som fortsatt mangler

Selve motoren, sikkerhetskontraktene og backend-kjernen er bygget videre, men ekte kunder skal ikke slippes inn før følgende er valgt, koblet til og sikkerhetstestet:

- faktisk privat produksjonslagring/object storage
- faktisk OCR/KI-dokumenttolk bak den validerte extractor-adapteren
- faktisk Svarrunde 2-tolk bak serverkontrakten
- valgt betalingsleverandør med ekte webhook-signaturverifisering
- valgt autentiseringsleverandør
- produksjons-PostgreSQL/databaseadapter
- produksjonshosting/runtime og hemmelighetshåndtering
- gjennomført DPIA/personvern-/risikovurdering og ferdige vilkår/personverntekster
- flere regelspor og større syntetisk testbibliotek

GitHub Pages-demoen skal fortsatt bare bruke syntetiske data og skal ikke brukes til å laste opp ekte kundedokumenter.
