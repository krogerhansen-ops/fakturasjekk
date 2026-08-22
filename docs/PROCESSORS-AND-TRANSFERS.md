# Fakturasjekk – databehandler- og overføringsregister

Dato: 22.08.2026
Status: Levende launch-register. Leverandørvalg kan registreres før juridisk godkjenning; ekte kundedata er blokkert inntil DPA/underleverandører/overføringer er kontrollert.

## Leverandørkrav

Ingen produksjonsleverandør som behandler kundedata kan godkjennes før følgende er dokumentert:

- rolle: databehandler / selvstendig behandlingsansvarlig / annet
- behandlingsformål og datakategorier
- lagrings-/behandlingsregioner
- teknisk support/fjerntilgang og hvor den skjer fra
- underleverandører og endringsvarsel
- databehandleravtale etter artikkel 28 når påkrevd
- sletting ved opphør og underveis
- sikkerhetstiltak og hendelsesvarsel
- om data brukes til leverandørens egen modelltrening/produktforbedring; dette skal være deaktivert/forbudt for kundedokumentinnhold i V1
- overføringsgrunnlag dersom opplysninger gjøres tilgjengelig utenfor EØS
- vurdering av tilleggstiltak der tredjelandsoverføring krever det

## Produksjonsregister

| Funksjon | Leverandør | Rolle | Primær region | Support-/fjernaksess | Underleverandører godkjent | DPA | Tredjeland | Overføringsgrunnlag/TIA | Status |
|---|---|---|---|---|---|---|---|---|---|
| Statisk frontend | GitHub Pages | vurderes; ingen kundedokumenter eller saksinnhold skal sendes hit | offentlig CDN | kartlegges ved endelig personvernreview | ikke vurdert | vurderes ved behov | mulig | ikke relevant for saksinnhold så lenge frontend forblir dataminimert | LIMITED / REVIEW |
| API/serverlogikk | Supabase Edge Functions er foretrukket V1-mål for å redusere leverandører og faste kostnader | databehandler forventet for saksinnhold | prosjekt `eu-north-1`; faktisk Edge-/supportflyt må dokumenteres | kartlegges | nei | ikke godkjent | ukjent | ikke vurdert | BLOCKED UNTIL DEPLOY/REVIEW |
| PostgreSQL | Supabase, prosjekt `fakturasjekk-prod` | databehandler forventet | `eu-north-1` (Stockholm) | kartlegges | nei | ikke godkjent | ukjent | ikke vurdert | SELECTED / BLOCKED FOR LIVE DATA |
| Privat object storage | Supabase Storage, bucket `case-documents-private` | databehandler forventet | `eu-north-1` prosjektregion; faktisk lagringsarkitektur bekreftes i provider review | kartlegges | nei | ikke godkjent | ukjent | ikke vurdert | SELECTED / BLOCKED FOR LIVE DATA |
| Auth | Supabase Auth | databehandler forventet for bruker-/identitetsdata | `eu-north-1` prosjektregion; faktisk behandlingsflyt bekreftes | kartlegges | nei | ikke godkjent | ukjent | ikke vurdert | SELECTED / BLOCKED FOR LIVE DATA |
| OCR / maskinlesing | Google Cloud Vision, `DOCUMENT_TEXT_DETECTION` | databehandler forventet for dokumentinnhold; må bekreftes kontraktuelt | Vision location `eu` er hardt krav i kode | kartlegges | nei | ikke godkjent | ukjent; support/underleverandørtilgang må kartlegges selv om OCR-endepunkt er EU | ikke vurdert | SELECTED / CODE READY / BLOCKED FOR LIVE DATA |
| Faktatolk etter OCR | Google Vertex AI, `gemini-3.1-flash-lite` | databehandler forventet for OCR-tekst/saksinnhold; må bekreftes kontraktuelt | hardlåst `eu` multi-region, `aiplatform.eu.rep.googleapis.com` | kartlegges | nei | ikke godkjent | ukjent; support/underleverandørtilgang må kartlegges | ikke vurdert | SELECTED / CODE READY / BLOCKED FOR LIVE DATA |
| Svarrunde 2-tolk | Google Vertex AI, `gemini-3.1-flash-lite` | databehandler forventet for leverandørsvar og eksisterende funn | hardlåst `eu` multi-region | kartlegges | nei | ikke godkjent | ukjent | ikke vurdert | SELECTED / CODE READY / BLOCKED FOR LIVE DATA |
| Betaling | Vipps MobilePay ePayment | rolle må vurderes konkret; leverandøren kan være selvstendig behandlingsansvarlig for deler av betalingsbehandlingen | kartlegges fra avtale/providerinfo | kartlegges | nei | kontrakt/providerreview gjenstår | kartlegges | vurderes | SELECTED / CODE READY / BLOCKED FOR LIVE PAYMENT |
| E-post/kvittering | Brevo transactional email | databehandler forventet for mottakeradresse og ordrebekreftelses-/kvitteringsinnhold | Brevo oppgir databasehosting i EU: OVH Frankrike/Tyskland og Google Cloud Belgia | må kartlegges kontraktuelt, inkludert support og konsern-/underleverandørtilgang | nei | Brevo oppgir DPA tilgjengelig; ikke gjennomgått/godkjent for Fakturasjekk | mulig via support/underleverandørkjede; må kartlegges selv om databasehosting er i EU | DPA, underleverandørliste og eventuell transfer-vurdering gjenstår | SELECTED / CODE READY / BLOCKED FOR LIVE EMAIL |
| Sikkerhetslogging | Supabase/minimal egen audit foretrekkes fremfor ekstra SaaS | databehandler hvis ekstern | EØS foretrekkes | [kartlegges] | nei | vurderes | ukjent | ikke vurdert | BLOCKED UNTIL LIVE VERIFY |

## Supabase – kjent teknisk status

Dedikert Supabase-organisasjon og prosjekt er opprettet særskilt for Fakturasjekk:

- organisasjon: `Fakturasjekk`
- prosjekt: `fakturasjekk-prod`
- project ref: `jxmkaxwflouacuboaetg`
- region: `eu-north-1` / Stockholm
- Free-plan ved opprettelse
- bekreftet prosjektkostnad ved opprettelse: 0 per måned

Dette er et **leverandørvalg**, ikke en GDPR-godkjenning. Før ekte dokumenter behandles skal DPA, underleverandørliste, supporttilgang, behandlingssteder og eventuelle overføringer utenfor EØS vurderes og føres inn her.

## Google Cloud Vision – kjent teknisk status

Google Cloud Vision er valgt som OCR-kandidat. Implementert kode/policy:

- `server/google-vision-ocr.mjs`
- `config/ocr-policy.json`
- `docs/GOOGLE-VISION-OCR.md`
- hard fail dersom location ikke er `eu`
- fler-siders PDF behandles i maks fem sider per request
- `totalPages` og faktisk `context.pageNumber` kontrolleres fail-closed
- V1-grense maks 20 sider per dokument og 15 MiB
- OCR er separert fra juridisk motor og faktatolk

Dette er **ikke** en GDPR-godkjenning. Før live må Google Cloud-prosjekt, IAM/OAuth, DPA, underleverandører, supporttilgang, behandlingssteder og eventuell tredjelandstilgang dokumenteres.

## Google Vertex AI – strukturert faktatolk og Svarrunde 2

Google Vertex AI / `gemini-3.1-flash-lite` er valgt som kodeklar kandidat for de to smale språkoppgavene. Dette gjenbruker Google som leverandørfamilie etter OCR og reduserer antall eksterne aktører.

Implementert:

- `server/google-structured-ai-client.mjs`
- `server/ocr-fact-interpreter.mjs`
- `config/structured-ai-policy.json`
- `docs/GOOGLE-STRUCTURED-AI.md`
- EU multi-region hardlåst
- modell allowlistet
- response schema + JSON-output påkrevd
- tools, grounding/ekstern nettverkstilgang og juridisk resonnering er forbudt i kontrakten
- `owner_id`, storage key og signed URLs sendes ikke til språkmodellen
- ingen request-/response-content logging i klienten
- input-/output-kostnadsgrenser er fail-closed

Før live kreves et eget Fakturasjekk Google Cloud-prosjekt, Vertex AI API, least-privilege IAM, faktisk EU-test, logging-/cachingkontroll, kostnadsvarsling og juridisk providerreview.

## Vipps MobilePay – kjent teknisk status

Vipps ePayment er valgt betalingskandidat for 29 kr-produktet.

Implementert:

- `server/vipps-epayment-provider.mjs`
- `config/payment-provider.json`
- `docs/VIPPS-EPAYMENT.md`
- nøyaktig 2900 øre/NOK
- server-side access token
- idempotent create og capture
- rå-body HMAC-verifisering av webhooks
- `AUTHORIZED` gir aldri tilgang; serveren ber om full capture
- bare verifisert `CAPTURED` kan bli intern `paid`
- polling-grense finnes som fallback

Live er blokkert til Fakturasjekk har eget Vipps-salgssted/ePayment, merchant credentials, webhook-registrering, endelig selgeridentitet, testmiljø-E2E og provider-/personvernreview.

## Brevo – ordrebekreftelse og betalingskvittering

Brevo transactional email er valgt som kodeklar kandidat for levering av ordrebekreftelse/betalingskvittering på e-post. Brevo skal **ikke** motta faktura, tilbud, OCR-tekst, regelanalyse, innsigelsesutkast eller andre kundedokumenter. Den planlagte datamengden er begrenset til verifisert mottakeradresse og selve ordrebekreftelsen/kvitteringen, inkludert kjøps-/betalingsreferanse og versjonerte avtaleopplysninger.

Implementert:

- `server/brevo-order-confirmation-delivery.mjs`
- `server/order-confirmation-delivery-webhook-service.mjs`
- `config/brevo-delivery-target.json`
- `scripts/verify-brevo-live.mjs`
- mottakeradresse hentes server-side fra bekreftet Supabase Auth-konto; browseren får ikke velge kvitteringsadresse
- provider-aksept og faktisk `delivered` er separate tilstander
- bare autentisert `delivered`-webhook kan fullføre varig-medium-levering
- provider-idempotens og lagret message-id hindrer dobbeltsending etter aksept
- `contactPixelTrackingConsent:false` brukes. Brevo opplyser per 21.07.2026 at dette anonymiserer open-pixel-hendelser; det betyr **ikke** at all teknisk leveringslogging er deaktivert
- webhook krever egen Fakturasjekk custom secret-header og ikke-batched transactional events
- den manuelle live-verifikatoren returnerer ikke e-postadresse, API-nøkkel, webhook-hemmelighet eller provider message-id

Brevo oppgir at deres databasehosting er innen EU, med OVH i Frankrike/Tyskland og Google Cloud i Belgia. Brevo oppgir også at DPA er tilgjengelig i deres Terms of Service. Disse leverandøropplysningene er **ikke** Fakturasjekks juridiske godkjenning. Før live e-post må faktisk DPA, underleverandørliste/endringsvarsel, support-/fjernaksess, eventuell tredjelandstilgang, retention/logging, sletting/blocklist og sikkerhetshendelsesvilkår gjennomgås og dokumenteres. Senderdomene, webhook og syntetisk live send→`delivered` må også verifiseres.

## EØS-first beslutning

V1 skal prioritere behandling og lagring i EØS. Dette er ikke i seg selv tilstrekkelig dersom leverandør-/supportstrukturen gir tilgang fra tredjeland; slik tilgang må kartlegges.

## Tredjeland

Hvis en produksjonsleverandør innebærer overføring utenfor EØS skal følgende foreligge før launch:

1. identifisert overføring og dataimportør
2. gyldig overføringsgrunnlag, f.eks. adekvans eller relevante SCC-er
3. vurdering av om beskyttelsesnivået undergraves i praksis når dette kreves
4. nødvendige tilleggstiltak
5. dokumentasjon i ROPA og personvernerklæring
6. kartlegging av videreoverføringer/underleverandører

## Modell-/AI-data

Produksjonsavtalen for OCR/KI/Svarrunde 2 skal kreve at kundedokumenter og saksinnhold ikke brukes til leverandørens generelle modelltrening eller produktforbedring med mindre en helt separat, lovlig og uttrykkelig produktbeslutning senere tas. V1 har ingen slik sekundærbruk.

## Kilder

- Datatilsynet – databehandleravtale og underleverandører: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/hvordan-lage-en-databehandleravtale/hva-ma-en-databehandleravtale-inneholde/
- Datatilsynet – overføring ut av EØS: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/overforing-av-personopplysninger-ut-av-eos/
- Datatilsynet – tilleggskrav/Schrems II: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/overforing-av-personopplysninger-ut-av-eos/tilleggskrav-til-overforingsgrunnlag-schrems-ii/
- Supabase – regions: https://supabase.com/docs/guides/platform/regions
- Supabase – security: https://supabase.com/docs/guides/security
- Supabase – shared responsibility: https://supabase.com/docs/guides/deployment/shared-responsibility-model
- Google Cloud Vision – pricing: https://cloud.google.com/vision/pricing
- Google Cloud Vision – regionalization: https://cloud.google.com/vision/docs/ocr#regionalization
- Google Gemini 3.1 Flash-Lite: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite
- Google multi-region endpoints: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations
- Google structured output: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output
- Vipps ePayment: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
- Brevo – transactional email API: https://developers.brevo.com/reference/send-transac-email
- Brevo – transactional webhooks: https://developers.brevo.com/docs/transactional-webhooks
- Brevo – secured webhooks: https://developers.brevo.com/docs/secured-webhooks
- Brevo – data storage location: https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location
- Brevo – DPA location: https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA
