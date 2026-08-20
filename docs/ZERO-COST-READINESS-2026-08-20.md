# Fakturasjekk – nullkost-status 20.08.2026

## Konklusjon
Fakturasjekk kan videreutvikles betydelig uten nye betalte leverandører. Offentlig beta forblir syntetisk. Ekte kundedokumenter, betalt OCR/KI, produksjonsbetaling og full produksjons-API er bevisst sperret mens prosjektet venter på finansiering.

## Live verifisert uten kundedata
- Dedikert Supabase-prosjekt: `jxmkaxwflouacuboaetg`.
- Region: `eu-north-1`.
- Produksjonsdatabase er aktiv og healthy.
- Databasestørrelse ved kontroll: ca. 11 MB.
- Privat bucket `case-documents-private` finnes og er `public=false`.
- Privat bucket hadde 0 objekter / 0 byte ved kontroll.
- Bucket tillater PDF, JPEG, PNG og WebP, maks 15 MiB per fil.
- Ingen offentlige Storage-policies var installert.
- `anon` og `authenticated` hadde ingen direkte tabellprivilegier på public-kjernetabellene.
- Syntetisk sak -> analyse -> utkast -> sletting ble verifisert i live database. Testdata ble slettet og ingen probe-rader ble liggende igjen.

## Gratis-utvikling som nå er på plass
### Kostnadssperre
`server/zero-cost-mode.mjs` krever eksplisitt finansiert modus før kostnadsutløsende tjenester kan godkjennes.

Zero-cost standard:
- `FAKTURASJEKK_COST_MODE=zero`
- `FAKTURASJEKK_PAID_SERVICES_APPROVED=no`
- `CUSTOMER_UPLOAD_ENABLED=false`
- `PRODUCTION_API_ENABLED=false`
- `PAYMENT_PROVIDER=unset`
- `DOCUMENT_EXTRACTOR_PROVIDER=manual`
- `RESPONSE_INTERPRETER_PROVIDER=synthetic`
- `VIPPS_ENVIRONMENT=test`

### Gratis kvotevakt
`server/free-tier-budget.mjs` varsler ved 70 % og stopper videre intern ekspansjon ved 90 % av de konfigurerte Free-rammene.

### Intern pilot
`fakturasjekk-internal-pilot` er syntetisk-only og avviser kundedata, dokumenttekst, filpayload, storage key, e-post og telefon.

### Manuell extractor
`server/manual-extractor.mjs` gir en gratis intern fallback til OCR/KI. Den godtar bare strukturerte fakta med dokument-id og sidenummer og bruker samme strenge extractor-kontrakt som framtidig produksjonstolk.

### Regelmotor og kundeutkast
Nullkost smoke-test går fra syntetisk faktum -> regelmotor -> kontrollert kundeutkast over hele demo-biblioteket. Intern regel-ID skal aldri lekke til kundetekst.

### Checkout og kvittering
Eksisterende checkout-kontrakt krever betalingsplikt, uttrykkelig ønske om umiddelbar tjenestestart og korrekt informasjon om angrerett/full levering før betalingssesjon kan opprettes.

`server/order-confirmation-service.mjs` er lagt til som leverandørnøytralt lag for ordrebekreftelse/kvittering. Det krever:
- ferdig selgeridentitet,
- validert checkout-samtykke,
- nøyaktig 29 NOK,
- serververifisert betalt-status.

Betalingswebhook kan klargjøre ordrebekreftelsen først etter bekreftet betalt hendelse. Klargjøring er ikke det samme som levering på varig medium; faktisk levering må kobles og dokumenteres senere.

## Personvern og sletting
Eksisterende policy og kode gir:
- midlertidig sak som standard,
- kildedokumenter slettes normalt innen 24 timer etter ferdig analyse,
- midlertidig saksinnhold innen 7 dager etter siste aktivitet,
- lagret sak krever uttrykkelig valg og har 90-dagers livsløp,
- deletion ledger før sletting,
- restore-sikkerhet mot at slettede saker gjenoppstår,
- innholdsdata slettes separat fra eventuelle betalings-/regnskapsdata som kan ha egne lovlige oppbevaringskrav.

## Ferdig kode som ikke skal aktiveres ennå
Følgende er allerede implementert bak adaptergrenser, men skal ikke brukes live i zero-cost modus:
- Google Vision OCR,
- strukturert Google/Vertex-basert faktatolk,
- Svarrunde 2 KI-tolk,
- Vipps ePayment,
- full produksjonskundestrøm.

Det reduserer senere integrasjonsarbeid: finansiering skal i hovedsak låse opp og live-verifisere eksisterende adaptere, ikke utløse et redesign.

## Det som må vente på finansiering / eksterne opplysninger
- Faktiske OCR/KI-provider credentials og live provider-E2E.
- Vipps merchant credentials, registrert webhook og test-/produksjons-E2E.
- Faktisk selger/controller-identitet og kontaktopplysninger.
- Endelige databehandleravtaler, underleverandør-/overføringsvurderinger og DPIA-signoff for valgte leverandører.
- Levering av ordrebekreftelse/kvittering på ekte varig medium.

## Gratis arbeid som fortsatt kan gjøres
1. Utvide realistiske syntetiske bransjecaser og edge cases.
2. Styrke regelmotorens regresjonsmatrise og fail-closed-ruting.
3. Gjøre flere syntetiske live database-/sletteverifikasjoner uten kundedata.
4. Teste Supabase Auth med syntetisk testbruker dersom det kan gjøres uten å åpne offentlig kundetrafikk.
5. Styrke rate-limit-/misbrukstester.
6. Ferdigstille personvern-, checkout- og driftsrunbooks med plassholdere for senere juridisk selgeridentitet/providerinfo.
7. Fortsette offentlig beta- og sponsormateriell med kun syntetiske data.

## Ikke gjør i zero-cost modus
- Ikke slå på offentlig opplasting.
- Ikke send ekte kundedokumenter til eksterne leverandører.
- Ikke aktivér Google OCR/Vertex eller andre betalte API-er.
- Ikke aktivér produksjons-Vipps.
- Ikke endre produktet til at full sjekk er gratis. Ordinær pris for full sjekk + kontrollert innsigelsesutkast er 29 kr.
