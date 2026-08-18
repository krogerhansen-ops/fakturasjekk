# Fakturasjekk – databehandler- og overføringsregister

Dato: 18.08.2026
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
| Dokumenttolk/OCR/KI | [velges] | databehandler forventet for saksinnhold | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Svarrunde 2-tolk | [velges] | databehandler forventet | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Betaling | [Vipps er foretrukket kandidat] | ofte selvstendig behandlingsansvarlig for deler / vurderes konkret | [kartlegges] | [kartlegges] | nei | kontrakt | ukjent | vurderes | BLOCKED |
| E-post/kvittering | [velges] | databehandler forventet for meldingsdata | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
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

Supabase dokumenterer at hvert prosjekt ligger i én valgt primærregion, at `eu-north-1` er Stockholm, og at deres hosted platform har sikkerhets-/compliance-kontroller under en delt ansvarsmodell. Fakturasjekk beholder ansvaret for egen arkitektur, tilgang, schema, brukere, dataminimering, retention og tredjepartsintegrasjoner.

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
