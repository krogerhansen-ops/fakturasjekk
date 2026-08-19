# Fakturasjekk – P0 rettskildeutvidelse 19.08.2026

Formål: dokumentere de nye regelsporene som er lagt til etter produktgjennomgangen 19.08.2026. Dette er et tillegg til `LEGAL-REVIEW-2026-08-18.md`, ikke en erstatning for fullgjennomgangen.

## Prinsipp

Nye regler aktiveres ikke fordi en språkmodell finner en paragraf som ser relevant ut. Flyten er fortsatt:

`dokumentert faktum -> sakstype -> kontrollvilkår -> kontrollert regel -> kundesikkert funn`

Manglende dokumentasjon skal holdes adskilt fra dokumentert fravær av avtale. Et formelt avvik skal ikke automatisk presenteres som at hovedkravet bortfaller.

## Nye aktive spor

### Håndverkertjenesteloven § 7 – plikt til å frarå/kontakte

Kontrollert mot Lovdata 19.08.2026. Bestemmelsen krever blant annet kontakt med forbrukeren dersom tjenesteyteren under utføringen får grunn til å anta at prisen vil bli betydelig høyere enn forbrukeren måtte vente.

Fakturasjekk innfører **ingen egen prosentgrense** for hva som er «betydelig». Motoren kan bare vise kontrollpunktet når dokumentgrunnlaget viser prisøkning etter oppstart og manglende dokumentert varsling/kontakt.

### Håndverkertjenesteloven § 9 – tilleggsarbeid

Kontrollert mot Lovdata 19.08.2026. Kontakt med forbrukeren er hovedregelen når det viser seg behov for arbeid utenfor oppdraget. Bestemmelsen inneholder unntak når kunden ikke kan nås og vilkårene er oppfylt, samt ved arbeid som ikke kan utsettes uten fare for vesentlig skade.

Fakturasjekk skal derfor ikke konkludere med at et tillegg er ugyldig bare fordi opplastet materiale mangler en godkjenning. Kundespråket skal i stedet beskrive hva som mangler og be om dokumentasjon.

### Håndverkertjenesteloven § 34 – forundersøkelse/diagnose

Kontrollert mot Lovdata 19.08.2026. Forbrukeren skal bare betale for forberedende undersøkelse eller lignende arbeid for å klarlegge om en tjeneste skal bestilles dersom betaling ble opplyst om eller tatt forbehold om på forhånd.

Dette er særlig relevant for bilverksted, feilsøking, elektriker og andre reparasjonstjenester.

### Markedsføringsloven § 11 – betalingskrav uten avtale / tillegg utover hovedytelsen

Kontrollert mot Lovdata 19.08.2026. Bestemmelsen forbyr betalingskrav for varer/tjenester uten avtale og inneholder krav om uttrykkelig samtykke til betaling utover hovedytelsen før avtale inngås.

Fakturasjekk aktiverer ikke dette sporet bare fordi fakturaen inneholder et tillegg. Motoren krever et dokumentert separat betalingsbeløp og en kontrollert avtale-status (`not_found` eller `contradicted`). `not_found` skal uttrykkelig beskrives som manglende dokumentasjon, ikke bevist fravær av avtale.

### Prisopplysningsforskriften § 13 – spesifisert regning

Kontrollert mot Lovdata 19.08.2026. For tjenester skal regningen være utfyllende nok til at forbrukeren kan kontrollere mottatte varer/tjenester og beregnede priser.

Bestemmelsen har særregler/unntak, blant annet for nyoppføring av bolig og håndverkertjenester til forhåndsavtalt pris. Motoren skal derfor ikke flagge manglende spesifikasjon på en fastpriset håndverkertjeneste uten at vilkårene for spesifisert regning er oppfylt.

### Bokføringsforskriften § 5-1-2 – angivelse av partene

Kontrollert mot Lovdata 19.08.2026. Selgers navn og organisasjonsnummer skal fremgå, og relevant MVA-angivelse følger registreringsstatusen.

Fakturasjekk bruker dette som dokument-/registerkontroll. Avvik mellom faktura og offentlig register skal ikke automatisk presenteres som at hovedkravet faller bort.

## Kandidatspor – ikke automatisk aktivt

### Håndverkertjenesteloven § 8 – unnlatt fraråding

Kilden er kontrollert og regelen er registrert som `candidate`, men den er **ikke aktiv i automatisk kundekonklusjon**.

Begrunnelse: konsekvensen etter § 8 krever både at § 7-vilkårene er oppfylt og en konkret vurdering av hva forbrukeren ellers ville gjort, samt bestemmelsens rimelighetsbegrensning. Dette skal ikke gjettes ut fra en faktura eller en fri KI-vurdering.

## Regelpakker som denne utvidelsen forbereder

- varekjøp
- bilverksted/reparasjon av ting
- håndverk på bolig
- andre forbrukertjenester
- purring/inkasso

Regelpakkene er interne. Kunden skal fortsatt bare laste opp faktura og eventuelt støttedokumentasjon; systemet velger relevant kontrollspor i bakgrunnen.

## Oppdateringssikkerhet

`legal-source-check.mjs` overvåker nå både `active` og `candidate` regler. `legal-source-watch.yml` kjører:

- ved pull request som endrer regler/kildevakt
- ved push til `main` som endrer regler/kildevakt
- daglig
- manuelt ved behov

Hvis en forventet kontrollfrase ikke lenger finnes i rettskilden, feiler vakten og berørt regel skal behandles som ikke-verifisert til manuell gjennomgang er utført.

## Primærkilder

- Lovdata – håndverkertjenesteloven §§ 7, 8, 9 og 34
- Lovdata – markedsføringsloven § 11
- Lovdata – prisopplysningsforskriften § 13
- Lovdata – bokføringsforskriften § 5-1-2

Dette dokumentet beskriver den tekniske/juridiske kvalitetssikringen av regelmotoren. Det er ikke individuell juridisk rådgivning i en konkret tvist.
