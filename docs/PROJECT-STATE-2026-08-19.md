# Fakturasjekk – kanonisk prosjektstatus

Dato: 19.08.2026
Statusgrunnlag: GitHub `main`, tidligere produktbeslutninger og verifisert produksjonsmiljø.

Dette dokumentet er arbeidsfasit for videre utvikling av Fakturasjekk. Ved konflikt mellom eldre notater og dette dokumentet skal nyere eksplisitte beslutninger og verifisert kode/status ha forrang.

## 1. Produktet

Fakturasjekk.no er en norsk forbrukertjeneste som kontrollerer faktura mot tilbud, avtale og relevant norsk regelverk.

V1-produktet er:

- full fakturasjekk
- dokumenterte avvik og beregninger
- kontrollert Regel- og paragrafkontroll når vilkårene faktisk er oppfylt
- utkast til innsigelse/forespørsel når det finnes grunnlag
- fast kundepris: **29 kr per sak**
- gratis demo med kun syntetiske saker

Tjenesten skal også kunne konkludere med **«ingen dokumenterte avvik funnet»**. Kunden betaler for kontrollen, ikke for et forhåndsbestemt klageresultat.

## 2. V1-avgrensning

Fakturasjekk er aktivt V1-produkt. Tilbud eller avtale brukes som sammenligningsgrunnlag når kunden har dette, men et separat Tilbudssjekk-produkt skal ikke introduseres i V1 uten en ny eksplisitt produktbeslutning.

V1 er rettet mot privatpersoner/forbrukersaker. B2B og ikke-støttede sakstyper skal stoppes før regelanalyse.

## 3. Juridisk sikkerhetsmodell

Absolutt prinsipp: **ingen gjetting**.

Fakturasjekk skal aldri bruke arbeidsmåten:

`les dokument → finn en paragraf som høres riktig ut`

Korrekt kjede er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → kundesikkert resultat → kontrollert utkast`

Regler:

- juridiske konklusjoner fra OCR/KI avvises
- en paragraf vises bare når et aktivt regelspor matcher dokumenterte fakta og relevante vilkår
- rettskilder skal ha kilde, kontrollstatus og kontrolldato
- usikkert dokumentfaktum blir «må avklares» og skal ikke fylles inn ved antakelse
- brukerfritekst er ikke automatisk dokumentert bevis
- formelle/bokføringsmessige mangler betyr ikke automatisk at hovedkravet faller bort
- inkassofeil og hovedkrav vurderes separat
- ved rettskildeendring eller uklar ikrafttredelse skal systemet feile lukket

Lovdata er primærkilde for aktive lov-/forskriftsspor.

## 4. Regel- og paragrafkontroll

Utformingen fra V0.16 er designreferanse for denne seksjonen. Videre UI-utvikling skal beholde de samme visuelle og strukturelle prinsippene: tydelig lov/paragraf, kontrollstatus, kort forklaring på relevans og sporbar primærkilde – uten interne regel-ID-er som D1/D2 eller annen utviklertekst i kundesvaret.

V0.50-demoen bruker overskriften **«Regel- og paragrafkontroll»** og viser kontrollerte rettskilder brukt i den aktuelle saken.

## 5. Aktivt rettskildegrunnlag

Rettsskildegjennomgangen 18.08.2026 dokumenterer aktive V1-spor for blant annet:

- håndverkertjenesteloven §§ 32, 33 og 36
- forbrukerkjøpsloven § 37
- prisopplysningsforskriften §§ 10 og 12
- bokføringsforskriften § 5-1-1
- gjeldende inkassolov-spor for god inkassoskikk, varsling, betalingsoppfordring/innsigelser og relevante kostnader

Ny inkassolov av 22.05.2026 er vedtatt, men skal ikke brukes som aktiv runtime-lov før faktisk ikrafttredelse er bekreftet. Regelovergangen overvåkes fail-closed.

## 6. Dokument- og KI-sikkerhet

Bygget kontrakt:

- PDF/JPEG/PNG/WebP med filpolicy og størrelsesgrenser
- privat, signert og tidsbegrenset opplasting
- analyse først etter serververifisering av reservert fil
- produksjonsadapter skal validere magic bytes, størrelse, MIME og malware-status
- extractor har allowlist for faktuelle felt
- kritiske beløp krever høy confidence, dokument-ID og sidenummer
- ukjente extractor-felt og juridiske konklusjoner skal avvises

KI skal brukes til strukturert dokumenttolking og språkoppgaver innenfor validerte kontrakter, ikke til fri juridisk improvisasjon.

## 7. Betaling og forbrukerflyt

Fast pris: **29 NOK / 2900 øre**.

Fullresultatet er betalingslåst. Browseren kan ikke markere betaling som verifisert. Betaling skal bare registreres gjennom signaturverifisert server-til-server webhook for riktig beløp, valuta og sak.

Checkout-koden er fail-closed og krever versjonerte samtykker for:

- betalingsplikt
- uttrykkelig ønske om umiddelbar oppstart
- informasjon om tap av angrerett når tjenesten er fullt levert etter relevante vilkår

Live checkout er fortsatt blokkert fordi selgeridentitet, varig bekreftelseskanal og faktisk betalingsleverandør ikke er ferdigstilt.

## 8. Kundeopplevelse og design

Designretning:

- norsk, ryddig og tillitsvekkende
- nordisk/premium fremfor «AI-chatbot»
- tydelig blå hovedhandling
- enkel språkføring for privatpersoner
- kunden skal forstå dokumentgrunnlag, avvik, regelgrunnlag og neste steg
- ingen interne motorbegreper eller tekniske ID-er i kundesvaret

Offentlig demo skal kun bruke syntetiske saker og må aldri oppfordre til opplasting av ekte kundedokumenter før produksjonslagring/API er åpnet.

Delbar demo:

`https://krogerhansen-ops.github.io/fakturasjekk/`

## 9. Bygget arkitektur

Repoet inneholder allerede:

- deterministisk analysemotor
- prisavvik og 15 %-kontroll
- gebyr-, dobbeltførings-, linjesum- og formalkontroller
- separat inkassomotor
- inntak/B2B-stopp
- proveniens/bevislag
- kontrollert utkastsgenerator
- kundesikker resultatprojeksjon
- saksmappe/tilstandsmaskin
- Mine saker og sletting
- retention/purge
- Svarrunde 2
- API-kontrakt, auth-/CORS-/rate-limit-/audit-grenser
- PostgreSQL-referanseskjema og adapterkontrakter
- automatiske tester og juridisk kildevakt i GitHub Actions

## 10. Produksjonsmiljø – verifisert 19.08.2026

Dedikert Supabase-produksjonsprosjekt:

- navn: `fakturasjekk-prod`
- project ref: `jxmkaxwflouacuboaetg`
- region: `eu-north-1`
- status: ACTIVE_HEALTHY

Verifisert status:

- ingen Fakturasjekk-tabeller er deployet ennå
- ingen Supabase security-advisor-varsler ble returnert ved kontroll
- Edge Function `fakturasjekk-preflight` versjon 1 er deployet og ACTIVE
- preflight er hardbundet til riktig project ref
- `customer_upload_enabled=false`
- `production_api_enabled=false`

Dette er tilsiktet. Produksjonsmiljøet skal forbli fail-closed til nødvendige produksjonskoblinger og sikkerhetstester er fullført.

## 11. Det som fortsatt blokkerer ekte kunder

Før ekte kundeopplasting/betaling kan åpnes må minst følgende ferdigstilles og verifiseres end-to-end:

1. produksjonsdatabaseskjema/migrering og databaseadapter
2. privat object storage med riktig tilgangskontroll og filverifisering
3. produksjonsauth
4. faktisk OCR/dokumenttolk bak valideringskontrakten
5. faktisk Svarrunde 2-tolk
6. betalingsleverandør + ekte webhook-signaturverifisering
7. juridisk selger/behandlingsansvarlig og kontaktopplysninger
8. ferdige kjøpsvilkår, personvernerklæring og angrerett/ordrebekreftelse på varig medium
9. gjennomført personvern-/DPIA-/databehandler-/overføringsvurdering for de faktiske leverandørene
10. end-to-end go-live-test med syntetisk dokument og testbetaling

Ingen av disse portene skal omgås for å lansere raskere.

## 12. Neste byggerekkefølge

Prioritet for videre arbeid:

1. holde demo/UI skarp og V0.16-forankret
2. utvide syntetiske høyrisiko-/høyvanskelighets-saker og negative tester
3. verifisere/brede ut aktive regelspor uten å redusere fail-closed-kravene
4. ferdigstille Supabase database/storage/auth på en sikker måte
5. koble dokumenttolk
6. koble betaling
7. ferdigstille kunde-/personvern-/kjøpsdokumenter med faktisk virksomhetsidentitet
8. end-to-end sikkerhetstest
9. ekstern test
10. første betalende 29 kr-kunde

## 13. Ikke-forhandlingsbare prinsipper

- ingen oppdiktede fakta
- ingen oppdiktede paragrafer
- ingen juridisk sikkerhet uten dokumentert grunnlag
- ingen ekte dokumenter i offentlig demo
- ingen åpning av fullresultat kun fra browser-redirect
- ingen live produksjonsflyt før alle relevante gates er verifisert
- personvern er en produktfunksjon, ikke etterarbeid
- Fakturasjekk skal være et kontrollverktøy, ikke markedsføres som «AI-advokat»
