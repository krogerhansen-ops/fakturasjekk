# Fakturasjekk – interne regelpakker

Dato: 19.08.2026

## Formål

Fakturasjekk skal ikke ha merkevarespesifikke regler som «Elkjøp-regler» eller «Mekonomen-regler». Samme norske regelverk skal gjelde uavhengig av hvilket firma som har sendt fakturaen.

Regelpakkene er derfor et internt sikkerhetslag som kobler en støttet sakstype til hvilke aktive regelspor analysemotoren i det hele tatt får lov til å returnere.

Kunden skal ikke måtte velge eller forstå regelpakken.

## Aktive interne pakker

### `goods`

Typiske saker: elektronikk, møbler, andre varekjøp og tilsvarende kjøp fra forhandler/nettbutikk.

Tillater varekjøps- og generelle fakturaspor, men ikke håndverkertjenesteloven.

### `vehicle_repair`

Typiske saker: merkeverksted, kjedeverksted og frittstående bilverksted.

Bruker håndverkertjenestelovens relevante regler om blant annet prisøkning, tilleggsarbeid, prisoverslag, pristillegg, diagnose/forundersøkelse og regning, samt relevante generelle tjeneste-/fakturaspor.

Pakken velges bare når en kontrollert kategori tilsier kjøretøyreparasjon. Ved usikker kategori faller saken tilbake til den bredere håndverkspakken; Fakturasjekk skal ikke gjette bransje.

### `home_handcraft`

Typiske saker: elektriker, rørlegger, tømrer, maler, montering og andre støttede håndverkertjenester.

Dette er trygg standardpakke for `handcraft_service` når en mer spesifikk, kontrollert underkategori ikke er tilgjengelig.

### `other_service`

Typiske saker: flytting, renhold og andre støttede forbrukertjenester med pris-/tilbudsgrunnlag.

Tillater relevante generelle tjeneste-, prisopplysnings- og fakturaspor, men ikke håndverkertjenestelovens spesialregler.

### Inkasso-overlegg

Inkassoreglene er et separat overlegg. De kan kombineres med den underliggende pakka når fakturaen også har gått til purring/inkasso. Inkassovurderingen skal fortsatt holdes adskilt fra spørsmålet om hovedkravet er riktig.

## Sikkerhetsregel

Et analyseresultat som forsøker å returnere en regel-ID utenfor den valgte pakkas tillatte regler skal **stoppe** med intern `rule_package_violation`. Regelen skal ikke bare filtreres bort i stillhet. En slik situasjon betyr at kode, klassifisering eller regelkobling må undersøkes.

Dette gir to uavhengige sikkerhetsgrenser:

1. Regel-ID må finnes som aktiv, fersk og kontrollert rettskilde.
2. Regel-ID må være tillatt for den konkrete sakspakken.

## Kundespråk

Interne pakke-ID-er skal ikke vises i kunde-API eller resultat. Kunden skal fortsatt møte en enkel kontrollflyt og resultatkategorier som «Avtale og pris», «Timer og arbeid», «Materialer og tillegg», «Regnestykke og MVA» og «Regel- og paragrafkontroll».

## Videre utvikling

Nye regler legges først til en pakke når:

- rettskilden er kontrollert,
- vilkårene kan representeres uten gjetting,
- aktuelle sakstyper er definert,
- negative tester viser at regelen ikke lekker til andre pakker,
- kundespråket ikke konkluderer sterkere enn dokumentasjonen gir grunnlag for.

Dette dokumentet beskriver intern produktarkitektur og er ikke juridisk rådgivning.
