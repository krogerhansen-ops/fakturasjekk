# Ekstern test – Fakturasjekk

## Formål

Denne testpakken skal gi strukturert tilbakemelding på den offentlige syntetiske betaen og den lokale mobilkameratesten uten å åpne ekte kundedokumenter eller samle inn personopplysninger.

QA-gaten `QA_EXTERNAL_TESTERS` skal **ikke** markeres complete bare fordi denne pakken finnes. Gaten kan først lukkes når faktiske eksterne testere har gjennomført testen og resultatene er vurdert.

## Testlenker

- Offentlig syntetisk beta: `https://krogerhansen-ops.github.io/fakturasjekk/`
- Lokal kamerakompatibilitet: `https://krogerhansen-ops.github.io/fakturasjekk/site/camera-local-test.html`
- Syntetisk utskrifts-/kameraark: `https://krogerhansen-ops.github.io/fakturasjekk/site/camera-test-sheet.html`
- Lokal tilbakemeldingsgenerator: `https://krogerhansen-ops.github.io/fakturasjekk/site/external-tester-feedback.html`

## Viktige testregler

1. Ikke bruk ekte faktura, tilbud, avtale eller inkassodokument.
2. Ikke skriv navn, telefonnummer, e-postadresse, adresse, kundenummer eller andre personopplysninger i tilbakemeldingen.
3. Betaen skal bare bruke de innebygde syntetiske sakene.
4. Kameratesten skal bruke det syntetiske testarket eller et annet ufarlig ark uten persondata.
5. Kameratesten er lokal: bilde skal ikke lastes opp eller sendes til Fakturasjekk/Supabase/Google.
6. Dersom noe på siden ber om ekte dokument eller faktisk betaling, stopp testen og rapporter dette som en kritisk feil.

## Minimum testmatrise

Målet er minst tre uavhengige testere før QA-gaten vurderes lukket, med variasjon i enhet der det er praktisk mulig.

Anbefalt dekning:

| Tester | Enhet/nettleser | Syntetisk beta | Kamera | Fokus |
| --- | --- | --- | --- | --- |
| A | iPhone / Safari | Ja | Ja | mobil, kamera, forståelighet |
| B | Android / Chrome | Ja | Ja | mobil, kamera, robusthet |
| C | PC eller Mac | Ja | valgfritt | desktop, tekst, tillit |

Flere testere er ønskelig dersom de er lett tilgjengelige.

## Testløp A – hovedbeta

Testeren skal:

1. Åpne den offentlige betaen.
2. Bekrefte at siden tydelig opplyser at demoen er syntetisk og at ekte dokumenter ikke skal lastes opp.
3. Prøve flere av demosakene, inkludert minst:
   - en sak med tydelig prisavvik,
   - en sak med flere samtidige avvik,
   - en sak med «ingen dokumenterte avvik».
4. Vurdere om det er tydelig:
   - hva Fakturasjekk fant,
   - hva som er dokumentert vs. usikkert,
   - hvilke regler/paragrafer vurderingen støttes på,
   - hva kunden kan gjøre videre,
   - at full tjeneste koster 29 kr.
5. Se etter rar tekst, interne ID-er, plassholdere, d1/d2, tekniske feltnavn eller påstander som virker oppdiktet.
6. Vurdere om innsigelsesutkastet oppleves saklig, konkret og forståelig.

## Testløp B – lokal kamerakompatibilitet

Testeren skal:

1. Åpne det syntetiske kamera-testarket på en annen skjerm eller skrive det ut.
2. Åpne den lokale kameratesten på mobilen.
3. Velge «Ta testbilde» og fotografere testarket.
4. Bekrefte at:
   - kameraet åpner på en naturlig måte,
   - bildet vises lokalt etter klargjøring,
   - siden sier at metadata-stripping/re-encoding er gjennomført,
   - eventuelle lys-/kontrast-/uskarphetsvarsler gir mening,
   - siden aldri påstår at OCR har lest dokumentet,
   - ingen opplasting eller betaling skjer.
5. Gjenta med et bevisst dårlig bilde, for eksempel svak belysning eller tydelig bevegelsesuskarphet, og vurder om varslet er forståelig.
6. Trykke «Fjern bilde» og kontrollere at forhåndsvisningen forsvinner.

## Hva som skal vurderes som kritisk feil

- Hovedbetaen tilbyr faktisk opplasting av ekte dokument.
- Kameratesten gjør nettverksopplasting av bildet.
- En test kan låse opp betalt resultat uten serververifisert 29 kr-betaling.
- Intern storage key, betalingshemmelighet, bearer-token eller annen hemmelig informasjon vises.
- Regel-/paragrafkontrollen presenterer en ikke-verifisert regel som sikkert gjeldende.
- Produktet finner på manglende faktum i stedet for å markere usikkerhet.
- Ekte personopplysninger blir etterspurt i testskjemaet.

## Tilbakemelding

Testeren åpner den lokale tilbakemeldingsgeneratoren, fyller ut vurderingen og velger «Lag testoppsummering». Siden sender ikke skjemaet noe sted; testeren kopierer teksten og sender den manuelt til testansvarlig.

Tilbakemeldingen bør inneholde:

- enhet og nettleser,
- hvilke demosaker som ble prøvd,
- forståelighet 1–5,
- opplevd tillit til regel-/paragrafkontroll 1–5,
- brukervennlighet 1–5,
- om 29 kr føles rimelig,
- hva som var uklart,
- hva som ikke virket,
- hva som manglet,
- hva som var mest nyttig.

## Kriterium før `QA_EXTERNAL_TESTERS` kan vurderes complete

Først når faktiske eksterne tester er gjennomført skal resultatene oppsummeres. Minimumskrav før lukking:

- minst tre reelle eksterne testere,
- ingen uavklarte kritiske feil,
- iOS/Android kamera testet dersom kamera skal inngå i V1,
- funn dokumentert og tydelige feil enten rettet eller eksplisitt akseptert med begrunnelse,
- hovedbeta fortsatt syntetisk/fail-closed,
- testresultatene refereres i launch-gate-evidensen.
