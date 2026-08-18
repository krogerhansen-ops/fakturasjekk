# Fakturasjekk – tredjepersonopplysninger og særlige kategorier

Dato: 18.08.2026
Status: V1-policy. Skal innarbeides i DPIA, personvernerklæring og upload-flow før produksjonsopplasting åpnes.

## 1. Utgangspunkt

Kundens faktura, tilbud og avtale kan inneholde personopplysninger om andre enn kunden, for eksempel montør, saksbehandler, kontaktperson, ektefelle eller andre navngitte personer.

Behandlingsgrunnlaget «nødvendig for å oppfylle en avtale» brukes bare for behandling som er nødvendig for en avtale der den registrerte selv er part. Det skal derfor ikke brukes som blankogrunnlag for tredjepersoner i kundens dokumenter.

## 2. Tredjepersonopplysninger – V1-beslutning

For ordinære tredjepersonopplysninger vurderes artikkel 6 nr. 1 bokstav f (berettiget interesse) som foreløpig grunnlag når alle vilkår er oppfylt.

### Berettiget interesse

Interessen er å kunne levere den kontrolltjenesten kunden ber om, herunder forstå hvem som har utstedt dokumentet, hvem som har utført arbeid og hvilken dokumentasjon som knytter fakturalinjer til leveransen.

### Nødvendighet

Fakturasjekk skal:

- bare trekke ut allowlistede felt som er nødvendige for kontrollen
- ikke bygge profiler av tredjepersoner
- ikke bruke tredjepersondata til markedsføring, trening eller sekundær analyse
- ikke lagre mer tredjepersondata enn nødvendig for saken
- maskere/utelate identifikatorer i audit og driftslogger

### Interesseavveiing

Faktorer som taler for behandlingen:

- dokumentet er levert av kunden for en konkret kontroll
- behandlingen er avgrenset til samme sak og formål
- lagringstiden er kort
- opplysningene publiseres ikke
- det foretas ingen beslutning om tredjepersonen

Faktorer som kan tale mot behandlingen:

- tredjepersonen forventer ikke nødvendigvis at dokumentet analyseres av Fakturasjekk
- fakturaer kan inneholde private eller svært personlige opplysninger
- KI-/skyleverandører kan øke eksponeringsrisikoen

Konklusjon: V1 kan bare bruke berettiget interesse for ordinære tredjepersonopplysninger når dataminimering, privat behandling, kort retention og leverandørkontroll er på plass. Dette skal dokumenteres i DPIA/ROPA og valideres mot faktisk produksjonsstack.

## 3. Særlige kategorier – fail-closed policy

Fakturasjekk skal ikke be om eller bevisst behandle særlige kategorier av personopplysninger som normal del av V1, herunder helseopplysninger, fagforeningsmedlemskap, religion, politisk oppfatning, biometriske/genetiske data eller opplysninger om seksuelle forhold/orientering.

### Hvis slikt innhold oppdages

1. Automatisk juridisk analyse skal stoppe.
2. Dokumentet skal ikke sendes videre til flere underleverandører enn nødvendig for sikker håndtering.
3. Brukeren skal få beskjed om å laste opp en redigert/redigert kopi uten irrelevante sensitive opplysninger når det er mulig.
4. Originalen skal purges etter den korteste teknisk forsvarlige fristen.
5. Det skal ikke antas at artikkel 9 nr. 2 bokstav f (rettskrav) gjelder automatisk.
6. Dersom behandling av slike opplysninger faktisk er nødvendig for å fastsette, gjøre gjeldende eller forsvare et rettskrav, kreves særskilt dokumentert vurdering av både artikkel 6-grunnlag og artikkel 9-unntak før videre behandling.

## 4. Upload-tekst før live

Før ekte opplasting aktiveres skal UI-et tydelig si:

«Ikke last opp irrelevante helseopplysninger eller andre sensitive personopplysninger. Dersom dokumentet inneholder slike opplysninger som ikke er nødvendige for fakturakontrollen, bør du sladde dem først.»

## 5. Transparens

Personvernerklæringen skal forklare at dokumenter kan inneholde opplysninger om andre personer, at slike opplysninger bare behandles når nødvendig for saken, og at de ikke brukes til andre formål.

## Kilder

- Datatilsynet – nødvendig for avtale: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/nodvendig-for-a-oppfylle-en-avtale/
- Datatilsynet – berettiget interesse/interesseavveiing: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/nodvendig-for-a-ivareta-legitime-interesser---interesseavveiing/
- Lovdata – GDPR artikkel 9: https://lovdata.no/dokument/NL/lov/2018-06-15-38/gdpr%2FARTIKKEL_9
