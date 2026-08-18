# Fakturasjekk – databehandler- og overføringsregister

Dato: 18.08.2026
Status: Kontrollmal og launch-gate. Faktiske leverandører fylles inn før ekte kundedata behandles.

## Leverandørkrav

Ingen produksjonsleverandør kan godkjennes før følgende er dokumentert:

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
| Hosting/API | [velges] | [vurderes] | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| PostgreSQL | [velges] | databehandler forventet | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Privat object storage | [velges] | databehandler forventet | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Auth | [velges] | [vurderes] | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Dokumenttolk/OCR/KI | [velges] | databehandler forventet for saksinnhold | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Svarrunde 2-tolk | [velges] | databehandler forventet | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Betaling | [velges] | ofte selvstendig behandlingsansvarlig for deler / vurderes konkret | [kartlegges] | [kartlegges] | nei | kontrakt | ukjent | vurderes | BLOCKED |
| E-post/kvittering | [velges] | databehandler forventet for meldingsdata | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |
| Sikkerhetslogging | [velges eller self-hosted] | databehandler hvis ekstern | EØS foretrekkes | [kartlegges] | nei | nei | ukjent | ikke vurdert | BLOCKED |

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
