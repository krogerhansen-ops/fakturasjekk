# Fakturasjekk – operativ vei til live

Dato: 19.08.2026

Dette er rekkefølgen som skal brukes fra dagens status til første ekte betalende kunde. Ingen senere fase åpnes bare for å spare tid dersom en obligatorisk gate fortsatt er åpen.

## Status nå

Ferdig/verifisert:

- deterministisk Fakturasjekk-motor og kontrollert utkast
- 29 NOK betalingsgate i kode
- fire syntetiske demoer og full syntetisk E2E
- dedikert Supabase-prosjekt `fakturasjekk-prod`
- produksjonsdatabaseskjema, RLS og minste privilegium
- privat `case-documents-private` bucket
- atomiske server-RPC-er for rate limit og betalingshendelser
- Security Advisor gjennomgått
- fail-closed Edge preflight aktiv
- kode for Supabase Auth-adapter, Google Vision OCR, Google strukturert KI og Vipps ePayment
- GitHub Pages er låst til syntetisk demo
- kommersiell frontend er besluttet flyttet til Cloudflare Pages

Fortsatt stengt:

- ekte dokumentopplasting
- produksjons-API
- betaling fra ekte kunder
- live OCR/KI-kall
- live Vipps-webhook

## Fase 1 – eierens eksterne forutsetninger

Disse punktene kan ikke ferdigstilles kun i kode.

### 1. Selgeridentitet

Må fastsettes før checkout kan åpnes:

- juridisk navn
- organisasjonsnummer
- postadresse
- kundestøtte-epost
- personvernkontakt
- korrekt MVA-status

Dersom egnet virksomhet ikke allerede finnes, må den registreres. Vipps krever organisasjonsnummer og norsk bankkonto knyttet til virksomhetens organisasjonsnummer.

### 2. Norsk bedriftskonto

Må være knyttet til organisasjonsnummeret som skal selge Fakturasjekk. Eventuell bankpris avhenger av valgt bank.

### 3. Produksjonsdomene

Anbefalt mål: `fakturasjekk.no` dersom domenet er tilgjengelig eller allerede eies. Domenets faktiske eierskap/tilgjengelighet skal bekreftes før produksjons-DNS settes.

### 4. Cloudflare-konto/tilkobling

Cloudflare Pages Free brukes som statisk produksjonsfrontend. Ingen Pages Functions skal brukes i V1; alle kunde-API-er skal ligge bak Fakturasjekks Supabase-runtime.

### 5. Supabase Pro

Oppgrader den dedikerte Fakturasjekk-organisasjonen til Pro rett før betalt produksjon åpnes. Begrunnelse: ingen automatisk pause ved lav aktivitet og automatiske daglige databasebackups.

PITR kjøpes ikke i V1 uten dokumentert behov.

### 6. Google Cloud billing

Et separat Google Cloud-prosjekt for Fakturasjekk må ha aktiv billing og riktig IAM for:

- Vision Document Text Detection i EU
- Vertex AI strukturert dokumenttolking i EU

Ingen Google-secret skal inn i browser eller GitHub Pages.

### 7. Vipps MobilePay merchant

Bestill API-basert Payment integration på virksomheten som skal selge tjenesten. Når avtalen er godkjent må følgende legges i server-secret store:

- merchant serial number
- client id
- client secret
- subscription key
- webhook secret

Ingen av verdiene skal inn i frontend eller repo.

### 8. SMTP for auth og ordrebekreftelse

Supabase custom SMTP må settes før vanlig produksjonsbruk. En gratis transaksjonsepost-plan kan brukes ved lavt volum, men leverandøren må inn i databehandler-/overføringsvurderingen før produksjon.

## Fase 2 – arbeid som kan fullføres straks Fase 1-verdiene finnes

1. Opprette Cloudflare Pages production project fra GitHub-repoet.
2. Koble production branch og custom domain.
3. Sette CSP/CORS/origin-konfigurasjon for production domain.
4. Aktivere Supabase Auth mot production origin og custom SMTP.
5. Verifisere signup/session/JWT med syntetisk bruker.
6. Koble signed upload til privat bucket.
7. E2E-teste magic bytes, MIME, størrelse, malware-status og purge.
8. Koble Google Vision OCR med syntetisk faktura.
9. Koble strukturert KI og verifisere at juridisk resonnering fortsatt avvises.
10. Koble Vipps testmiljø, webhook-signatur og CAPTURED-only unlock.
11. Koble polling/reconciliation for tapte webhook-hendelser.
12. Koble varig ordrebekreftelse/kvittering etter checkout.

## Fase 3 – juridisk/personvern før ekte dokumenter

Fyll og godkjenn med de faktiske leverandørene og selgeridentiteten:

- kjøpsvilkår
- personvernerklæring
- angrerett/informasjon om umiddelbar tjenestestart
- DPIA residual-risk sign-off
- ROPA
- databehandleroversikt
- DPA/subprocessor-vurdering
- overføringsvurdering
- retention-godkjenning
- innsyn/sletting-prosedyre
- incident response med navngitt ansvar

Checkout skal fortsatt feile lukket dersom versjonert samtykke eller varig bekreftelse mangler.

## Fase 4 – tekniske sluttprøver

Kjør kun med syntetiske data:

- full auth -> sak -> signed upload -> filverifisering -> OCR -> faktatolk -> deterministisk regelmotor
- 29 NOK testbetaling -> signaturverifisert webhook -> capture -> unlock
- utkast -> leverandørsvar -> Svarrunde 2
- sletting av database + Storage
- restore-test med deletion ledger
- rate-limit concurrency test
- backup/restore-test
- Security Advisor på nytt
- full GitHub quality gate

Ingen launch dersom én obligatorisk gate er rød.

## Fase 5 – ekstern tester

GitHub Pages-demo kan deles allerede, men bruker kun syntetiske saker. Produksjonskandidaten testes separat med syntetiske dokumenter og testbetaling. Tester skal kontrollere:

- forståelse av resultat og regelgrunnlag
- at interne ID-er aldri vises
- at «ingen dokumenterte avvik» oppleves som et reelt resultat
- at utkast ikke lover mer enn dokumentgrunnlaget støtter
- mobilflyt
- checkout/kvittering
- sletting/personvern

## Fase 6 – åpne første ekte kunde

Først når alle obligatoriske gates i `config/launch-gate.json` er `complete`:

1. sett production origins/domene
2. sett verifiserte provider secrets
3. aktiver customer upload
4. aktiver production API
5. aktiver live payment provider
6. deploy production frontend
7. kjør smoke test uten ekte persondata
8. åpne for første betalende 29 NOK-sak

## Betalingsrekkefølge – ikke betal tidligere enn nødvendig

1. Virksomhetsregistrering/bank bare dersom du ikke allerede har en egnet virksomhet og konto.
2. Domene når ønsket navn/eierskap er bekreftet.
3. Cloudflare Pages Free: ingen betaling planlagt.
4. Google Cloud: aktiver billing, men betal bare etter faktisk bruk.
5. Vipps: merchant-avtale, deretter transaksjonspris ved salg.
6. Supabase Pro: oppgrader rett før betalt produksjon, ikke måneder i forveien.
7. SMTP: start gratis dersom personvernvurderingen godkjennes og volumet er innen grensen.

Detaljerte prisestimater ligger i `docs/LIVE-COSTS-2026-08-19.md`.

## Fast driftsprinsipp

Fakturasjekk skal ha lav fast kostnad og variable leverandørkostnader som i størst mulig grad følger faktisk kundebruk. Stabilitet, personvern og juridisk sporbarhet skal likevel ikke ofres for å holde et abonnement på 0 kroner.
