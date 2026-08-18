# Fakturasjekk – etterlevelse av digitalytelsesloven

Dato: 18.08.2026
Status: Produktpolicy for V1. Selgeridentitet og endelige vilkår må fylles inn før betalt launch.

## Konklusjon

Fakturasjekk skal behandles som en betalt digital tjeneste til forbruker. Produktet skal derfor utformes slik at det som faktisk leveres samsvarer med det som er lovet i checkout, produkttekst og vilkår.

## V1 – avtalt ytelse

For 29 kr per sak leveres:

- dokumentkontroll av innsendt faktura og relevant tilbud/avtale innenfor støttet V1-omfang
- deterministisk regne- og linjekontroll
- kontrollert regel- og paragrafkontroll når aktivt og verifisert rettsgrunnlag finnes
- forklaring av funn, usikkerhet og behov for avklaring
- kontrollert utkast til henvendelse/innsigelse når det finnes grunnlag
- ingen garanti for at kunden vinner en tvist eller at leverandørens krav er ugyldig

Hvis saken faller utenfor støttet område, skal systemet stoppe før det fremstiller en juridisk konklusjon.

## Leveringsstandard

Fakturasjekk skal:

1. samsvare med beskrivelsen kunden fikk før kjøp
2. fungere på støttede nettlesere/enheter som er opplyst før kjøp
3. ikke skjule kjente vesentlige begrensninger
4. gi kundeservicekanal for feil ved selve Fakturasjekk-tjenesten
5. bevare hvilken motor-/regelversjon som leverte resultatet
6. kunne dokumentere leveringshendelse, men uten å lagre unødvendig dokumentinnhold i audit

## Mangler ved Fakturasjekk

Vilkårene skal ikke forsøke å fraskrive ufravikelige forbrukerrettigheter. Dersom Fakturasjekk-tjenesten har en mangel, skal support kunne håndtere krav om retting/ny levering, prisavslag, heving eller andre krav som følger av ufravikelig lov.

## Oppdateringer og regelendringer

For enkeltleveranser vurderes resultatet på leveringstidspunktet. Systemet skal likevel ha fail-closed rettskildeferskhet og kildevakt slik at en regel som ikke lenger kan verifiseres ikke brukes i nye analyser.

Lagrede saker/Svarrunde 2 skal alltid bruke gjeldende aktiv regelmotor på tidspunktet for den nye analysen, samtidig som historikken viser hvilken versjon som ble brukt tidligere.

## Forbudt markedsføringstekst

Fakturasjekk skal ikke markedsføres som:

- advokat eller advokattjeneste
- garanti for korrekt juridisk resultat
- garanti for refusjon/medhold
- full juridisk vurdering av alle typer krav

## Launch-gate

Før betalt launch skal følgende være ferdig:

- juridisk selgeridentitet
- endelige kjøpsvilkår
- supportkanal
- tydelig støttet/ikke-støttet omfang
- beskrivelse av når ytelsen er levert
- feil-/mangelsupport for selve Fakturasjekk
- checkout og kvittering som samsvarer med produktløftet

## Kilder

- Lovdata – digitalytelsesloven §§ 7–10: https://lovdata.no/nav/lov/2022-06-17-56/kap3
- Lovdata – forbrukerens krav ved mangler, §§ 19–25: https://lovdata.no/lov/2022-06-17-56/%C2%A723
