# Fakturasjekk.no – pilotpartner søkes

## Problemet
Privatpersoner mottar fakturaer som kan være vanskelige å kontrollere mot tilbud, avtalt pris, tilleggsarbeid, gebyrer, fakturalinjer og relevant regelverk. Mange betaler uten å vite om beløpet og grunnlaget faktisk stemmer.

## Løsningen
**Fakturasjekk.no** er et enkelt forbrukerverktøy som skal gjøre kontrollen før betaling lettere:

1. Kunden legger inn faktura og eventuelt tilbud/avtalegrunnlag.
2. Systemet skiller dokumenterte fakta fra brukeropplysninger og beregninger.
3. Fakturaen kontrolleres mot prisgrunnlag, regnestykke og aktive, kvalitetssikrede regler.
4. Usikre forhold stoppes eller sendes til avklaring – systemet skal ikke gjette.
5. Kunden får et forståelig resultat og, når det finnes grunnlag, et kontrollert utkast til innsigelse/svar med relevante lovhenvisninger.

## Pris til kunde
- Offentlig demo med syntetiske saker: **gratis**.
- Full fakturasjekk + kontrollert utkast til innsigelse/svar: **29 kr per sak**.

Fakturasjekk er altså ikke planlagt som en gratis fullservice. En sponsor kan eventuelt dekke hele eller deler av kundens pris som en tydelig partnerfordel.

## Hvor langt produktet er kommet
Per 20.08.2026 er offentlig beta lansert med syntetiske demosaker.

Det er allerede bygget blant annet:
- deterministisk faktura- og regelmotor,
- kontrollert regel-/paragrafregister,
- kilde- og bevisstruktur,
- innsigelsesgenerator,
- fem syntetiske demosaker,
- privat Supabase-database og privat Storage-grunnmur,
- strenge personvern-/slette- og retention-mekanismer,
- 29-kroners betalingsport og Vipps-adapterkode,
- OCR/KI-adapterkode med strenge fakta- og kildegrenser,
- automatisert regresjonstest i GitHub Actions,
- nullkost-sperre som holder betalte tjenester av mens prosjektet venter på finansiering.

Offentlig beta:
`https://krogerhansen-ops.github.io/fakturasjekk/`

## Hva pilotfinansiering skal brukes til
Finansieringen skal ikke brukes til å bygge produktideen på nytt. Den skal primært brukes til å lukke de siste produksjonskoblingene og dokumentere at hele kjeden fungerer trygt med syntetiske live-tester før ekte kundedata åpnes.

Prioritet:
1. live OCR/KI-provideroppsett og ende-til-ende dokumenttest,
2. Vipps merchant-/webhook-oppsett og testbetaling,
3. live Auth-/opplastings-/slettingstest,
4. personvern- og leverandørkontroll/DPIA-signoff,
5. ekstern betatest og måling av faktisk brukeropplevd verdi.

## Hva partneren får
En pilotpartner kan få:
- synlighet som pilotpartner på avtalte flater,
- mulighet til å tilby fakturasjekker til egne medlemmer/kunder,
- aggregert og anonymisert rapportering om bruk og effekt når datagrunnlaget er tilstrekkelig,
- mulighet til å bidra i brukerinnsikt og evaluering av pilotens nytte,
- dokumentasjon på pilotens KPI-er og læringspunkter.

## Hva partneren aldri får
Fakturasjekk skal være faglig uavhengig. Sponsor/partner får ikke:
- kundedokumenter eller personopplysninger,
- innsyn i enkeltsaker,
- mulighet til å påvirke konklusjoner,
- mulighet til å betale for at bestemte avvik vises eller skjules,
- prioritet eller særbehandling i regelmotoren.

## Foreslått pilot
**3 måneders pilotpartnerskap**, med beløp og antall partnerfinansierte fakturasjekker avtalt individuelt.

Piloten bør måle:
- antall gjennomførte sjekker,
- andel med dokumenterte avvik,
- andel uten dokumenterte avvik,
- andel som gir kontrollert innsigelses-/svarutkast,
- brukeropplevd nytte,
- eventuell estimert økonomisk verdi for brukerne der dette kan beregnes på forsvarlig grunnlag.

## Målet
Første kommersielle milepæl er enkel:

**En helt ekstern bruker skal kunne gjennomføre en trygg fakturasjekk, betale 29 kr og motta et korrekt, dokumentbasert resultat uten at systemet gjetter.**

En pilotpartner kan være med på å finansiere og dokumentere denne siste veien fra offentlig beta til betalende produksjonstjeneste.
