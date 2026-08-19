# Fakturasjekk – aktiveringskontroll for regelmotor

Dato: 19.08.2026

## Formål

Et juridisk regelspor kan være korrekt og oppdatert uten at det dermed er trygt å bruke automatisk i en konkret kundesak.

Fakturasjekk skiller derfor mellom:

- **active**: rettskilden er kontrollert, og motoren har en deterministisk faktabetingelse som kan aktiveres fra dokumentert grunnlag uten fri juridisk gjetting.
- **candidate**: rettskilden er kontrollert og relevant for produktet, men minst ett nødvendig aktiveringsvilkår mangler en tilstrekkelig sikker automatisk faktasti. Kandidatregler overvåkes, men får ikke nå kundesvaret.

## Endring 19.08.2026

Prisopplysningsforskriften § 10 er fortsatt en kontrollert og relevant rettskilde, men flyttes fra `active` til `candidate`.

Begrunnelse:

- bestemmelsen gjelder prisinformasjon som skal gis før/ved avtaleinngåelsen,
- fravær av et prisdokument i det kunden har lastet opp er ikke bevis for at informasjonen aldri ble gitt,
- dagens analysemotor har derfor ikke en deterministisk nok dokumentbetingelse til å bruke § 10 som automatisk kundekonklusjon.

§ 10 kan aktiveres senere når Fakturasjekk har en dokumentbasert sammenligningssti som sikkert skiller mellom:

1. dokumentasjon kunden ikke har lastet opp,
2. manglende dokumentasjon i det kontrollerte materialet,
3. dokumentert motstrid mellom faktisk forhåndsinformasjon og senere fakturering.

Håndverkertjenesteloven § 8 forblir også `candidate`, fordi konsekvensen ved unnlatt fraråding krever en konkret vurdering av hva forbrukeren ellers ville gjort. Fakturasjekk skal ikke gjette denne kontrafaktiske vurderingen.

## Ny permanent kvalitetsregel

Hver regel med status `active` skal ha minst én kjent positiv testcase som faktisk aktiverer regelen gjennom kundemotoren eller inkassomotoren.

CI skal feile dersom:

- en aktiv regel mangler en deterministisk positiv testcase,
- en motor returnerer en regel som ikke er `active`,
- en `candidate`-regel slipper inn i kundens rule-ID-er,
- offentlig demo-regelregister avviker fra det kanoniske regelregisteret.

Dette gjør status `active` til mer enn en juridisk kildeetikett: den betyr at både rettskilden **og** aktiveringsmekanismen er kontrollert.

## Runtime-status etter denne gjennomgangen

Automatisk aktive V1-spor: **16**.

Kildeverifiserte kandidater uten automatisk kundebruk: **2**:

- håndverkertjenesteloven § 8
- prisopplysningsforskriften § 10

Kandidatene skal fortsatt inngå i den automatiske rettskildevakten slik at de ikke blir foreldet mens aktiveringslogikken utvikles.

## Historikk

`docs/LEGAL-REVIEW-2026-08-18.md` er et datert øyeblikksbilde av rettskildegjennomgangen 18.08.2026. Dette dokumentet er den nyere runtime-aktiveringsvurderingen og har forrang når det gjelder om en kontrollert regel kan brukes automatisk i kundesvar.
