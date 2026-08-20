# Fakturasjekk.no

Fakturasjekk.no er et norsk forbrukerverktøy for kontroll av faktura mot tilbud, avtale og relevant regelverk.

## Status

**Offentlig beta lansert 20.08.2026.**

Aktuell utviklingsversjon: **V0.50**.

Kundepris i V1: **29 kr for full fakturasjekk + utkast til innsigelse.**

Demoen er gratis og bruker bare syntetiske saker. Offentlig beta tar ikke imot ekte kundedokumenter før produksjonsflyten er eksplisitt åpnet og sikkerhetstestet.

Prosjektet er midlertidig satt i **zero-cost / sponsorvent-modus**. Betalt OCR/KI, produksjonsbetaling, offentlig kundopplasting og full produksjons-API skal forbli av til finansiering og eksplisitt godkjenning foreligger. Se `docs/ZERO-COST-MODE.md` og `docs/ZERO-COST-READINESS-2026-08-20.md`.

### Delbar kundedemo

`https://krogerhansen-ops.github.io/fakturasjekk/`

GitHub Pages bygges som en ren kunde-/testerdemo. Interne motor-, admin- og flytverktøy publiseres ikke som egne Pages-ruter; de beholdes i repoet og kvalitetstestes i CI.

## Produktarkitektur som er bygget

- Ekstern kundedemo med fem syntetiske saker og gratis demo før betaling
- Regel- og paragrafkontroll med Lovdata som primærkilde
- Versjonert regelregister med kontrollstatus, kilde og kontrolldato
- 16 aktive V1-regler, kandidatregler som er kundesperret, og egen overgangsvakt for ny inkassolov av 2026
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
- Mine saker + brukerstyrt sletting i backend-kontrakten
- Personvernorientert retention-motor med kortvarig standardmodus, eksplisitt lagret sak og automatiske utløpsdatoer
- Utførende purge-service for kildefiler og utløpt saksinnhold
- Manuell, kildebundet extractor som gratis intern fallback til OCR/KI
- Leverandørnøytral ordrebekreftelse/kvittering som bare kan klargjøres etter serververifisert betaling på nøyaktig 29 kr

## Dokument- og KI-sikkerhet

- Filpolicy for PDF/JPEG/PNG/WebP, antall filer og størrelsesgrenser
- Privat, signert og tidsbegrenset opplastingskontrakt
- Dedikert privat Supabase Storage-bucket `case-documents-private`, offentlig tilgang avslått
- Analyse blokkeres til hver reservert fil er server-verifisert
- Produksjonsadapter kontrollerer magic bytes, filstørrelse, MIME-type og malware-status før analyse kan fortsette
- Dokumentuttrekk/OCR har allowlist av tillatte faktuelle felt
- Ukjente extractor-felt og juridiske konklusjoner fra KI avvises
- Kritiske beløp krever høy confidence, dokument-ID og sidenummer
- Manglende eller tvetydige verdier skal ikke gjettes
- Fritekst fra bruker kan ikke bli dokumentert bevis uten dokumentkilde
- Google Vision/strukturert KI-adaptere er implementert, men skal ikke aktiveres i zero-cost-modus

## Betaling

- Fast pris: **29 kr**
- Fullresultatet er betalingslåst
- Kunden kan bare opprette checkout
- Checkout krever versjonert samtykke til betalingsplikt, umiddelbar tjenestestart og informasjon om angrerett ved full levering
- Det finnes ikke noe offentlig browser-endepunkt som kan sette `verified_server_side=true`
- Betaling registreres kun etter signaturverifisert server-til-server webhook fra betalingsleverandør
- Rå webhook-body bevares frem til signaturkontroll
- Kun bekreftet betalt/CAPTURED kan åpne fullresultatet og klargjøre ordrebekreftelse
- Klargjort ordrebekreftelse er ikke det samme som dokumentert levering på varig medium; faktisk levering må kobles før betalt launch
- Idempotens beskytter sakopprettelse, opplasting, checkout, betaling, sletting og andre mutasjoner mot duplikater
- Vipps ePayment-adapteren er implementert, men produksjons-Vipps er sperret i zero-cost-modus

## Backend/API

- Dedikert Supabase-produksjonsprosjekt `fakturasjekk-prod` i `eu-north-1`
- Produksjons-PostgreSQL-skjema er deployet og live-verifisert
- RLS er aktivert og browserrollene `anon`/`authenticated` har ingen direkte tabellprivilegier på kjernetabellene
- Privat Storage-bucket er opprettet og fail-closed uten offentlige Storage-policies
- Supabase Auth er valgt og prosjekt-/issuer-låst; live signup/session/JWT-E2E gjenstår
- Leverandørnøytral backend service-kjerne
- Native Node HTTP-runtime og Fetch/Edge-runtime uten forking av juridisk forretningslogikk
- Bearer-auth adapterkontrakt
- CORS/origin-policy, request limits, rate limiting og sikkerhetsheadere
- Standardiserte API-feil uten stack traces
- OpenAPI 3.1-kontrakt
- PostgreSQL-adaptere for saker, hendelser, dokumentmetadata, analyser, betaling, utkast, svar og audit
- Health- og readiness-endepunkter
- Readiness stopper produksjonsstatus dersom pris, regelkilder, privat lagring, extractor, Svarrunde 2-tolk eller betalingsgateway mangler
- Audit-logg er dataminimert og skal aldri inneholde dokumenttekst, fritekst, storage keys eller e-post
- Lokal syntetisk API kan startes med `npm run dev:api`; den nekter å kjøre utviklingsauth/-betaling i production mode

## Zero-cost utviklingsmodus

Følgende kan bygges og testes videre uten å aktivere betalte leverandører:

- GitHub Pages offentlig syntetisk beta
- eksisterende GitHub Actions-kvalitetsport
- Supabase Database/Auth/Storage/Edge innenfor tilgjengelig Free-kvote
- Brønnøysundregistrenes åpne registeroppslag
- syntetiske saker og full regresjonstest
- manuell, kildebundet faktatolk
- regelmotor, kundeutkast, sletting/retention og personverntester

`server/zero-cost-mode.mjs` blokkerer kostnadsutløsende konfigurasjon. Overgang til finansiert modus krever både eksplisitt `funded`-modus og separat godkjenning av betalte tjenester.

`server/free-tier-budget.mjs` gir varsel ved 70 % og stoppgrense ved 90 % av de konfigurerte gratisrammene.

Ved kontroll 20.08.2026 brukte produksjonsdatabasen ca. 11 MB og den private dokumentbucketen hadde 0 objekter / 0 byte.

## Automatisk kvalitetssikring

`npm test` oppdager automatisk alle `tests/*.test.mjs` og kjører dem i GitHub Actions ved push/PR.

Testpakken dekker blant annet:

- regelregister og lovoverganger
- inntak og B2B-stopp
- deterministisk analysemotor
- inkassospor
- bevis/proveniens
- dokumentpolicy og signert opplasting
- extractor allowlist/confidence og manuell fallback
- 29 kr betalingsport og webhook-grense
- checkout-samtykke og ordrebekreftelse
- Svarrunde 2
- saksmappe og sletting
- retention/purge
- API, auth, CORS og Node/Fetch-runtime
- kundesikker projeksjon
- pris-/versjonskonsistens
- zero-cost konfigurasjon og Free-kvotevakt

## Sikkerhetsprinsipp

Fakturasjekk skal ikke bruke KI som:

`les dokument → finn en paragraf som høres riktig ut`

Målarkitekturen er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → forhåndsvisning → 29 kr betaling → kundesikkert resultat → kontrollert utkast → eventuell Svarrunde 2`

Hvis partstype, dokumentgrunnlag, KI-uttrekk eller rettskilde er usikker skal det aktuelle sporet stoppe eller be om avklaring i stedet for å gjette.

## Gjenstående blokkere før ekte betalende kundesaker

Mye av produksjonsgrunnlaget er allerede etablert. Følgende må fortsatt lukkes før ekte kundedokumenter og betaling åpnes:

- live ende-til-ende-test av signert privat dokumentopplasting, scanner og sletting i Supabase Storage
- live Supabase Auth signup/session/JWT-verifisering med syntetisk testbruker
- live OCR/KI-provideroppsett, IAM/personvernkontroll og syntetisk provider-E2E
- live Svarrunde 2-provider og syntetisk kvalitetsbenchmark
- Vipps merchant credentials, registrert webhook, polling/reconciliation og testmiljø-E2E
- faktisk levering av ordrebekreftelse/kvittering på varig medium
- juridisk selger/controller-identitet og kundekontakt
- endelige databehandler-/overføringsvurderinger og DPIA-signoff for valgte produksjonsleverandører
- isolert backup/restore-test og full sletting/restore-E2E med syntetiske data
- ekstern betatest og eventuelle launch-funn

GitHub Pages-demoen skal fortsatt bare bruke syntetiske data og skal ikke brukes til å laste opp ekte kundedokumenter.
