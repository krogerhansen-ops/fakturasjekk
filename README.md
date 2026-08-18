# Fakturasjekk.no

Fakturasjekk.no er et norsk forbrukerverktøy for kontroll av faktura mot tilbud, avtale og relevant regelverk.

## Status

Aktuell utviklingsversjon: **V0.36**.

Kundepris i V1: **29 kr for full fakturasjekk + utkast til innsigelse.**

Demoen er gratis og bruker bare syntetiske saker.

## Testadresser etter at GitHub Pages er aktivert

- Kundedemo: `https://krogerhansen-ops.github.io/fakturasjekk/`
- Ende-til-ende motorflyt: `https://krogerhansen-ops.github.io/fakturasjekk/flow-test.html`
- Svarrunde 2: `https://krogerhansen-ops.github.io/fakturasjekk/followup-test.html`
- Motor-test: `https://krogerhansen-ops.github.io/fakturasjekk/motor-test.html`
- Regel- og overgangspanel: `https://krogerhansen-ops.github.io/fakturasjekk/admin/rules.html`

## Bygget så langt

- Ekstern kundedemo med fire syntetiske saker
- Kunde-demoene kjøres gjennom samme deterministiske motor som regresjonstestene
- Regel- og paragrafkontroll med Lovdata som primærkilde
- Versjonert regelregister med kontrollstatus og kontrolldato
- 11 aktive V1-regler fordelt på håndverkertjenester, forbrukerkjøp, prisopplysninger, formelle fakturakrav og inkasso
- Egen lovovergangsvakt for ny inkassolov av 2026
- Deterministisk analysemotor for prisavvik, 15 %-kontroll, fakturagebyr, dobbeltføringer, linjesummer og formelle mangler
- Separat inkassomotor som skiller hovedkravet fra inkassobehandlingen
- Inntaksmotor som stopper B2B og ikke-støttede sakstyper før regelanalyse
- Bevis-/provenienslag som skiller dokumentert, brukeropplyst, beregnet, regel og må-avklares
- Kontrollert utkastsgenerator som bare kan sitere aktive regler og aldri viser interne regel-ID-er
- Svarrunde 2 som vurderer hvert opprinnelige punkt som besvart, delvis besvart eller ubesvart og lager oppfølging bare for åpne punkter
- Saksservice som kjører inntak → analyse → inkasso → bevis → utkast som én strukturert flyt
- Saksmappe/tilstandsmaskin som bevarer historikk for dokumenter, analyser, 29 kr-betaling, utkast, leverandørsvar og oppfølging
- "Ingen dokumenterte avvik" som gyldig resultat
- Dokumentopplastingspolicy med filtype-, størrelse- og dokumentrolle-kontroll
- Kontrakt for dokumentuttrekk/OCR med krav til kildeplassering og confidence-score
- Kritiske verdier må være sikkert lest fra dokument; manglende verdier skal ikke gjettes
- Personvernorientert lagringsmotor med kortvarig standardmodus, eksplisitt valg for lagret sak og deterministiske slettetidspunkter
- Betalingsport som låser fullresultatet til server-verifisert betaling på nøyaktig 29 kr for riktig sak
- Leverandørnøytral backend service-kjerne som kobler sak, dokumenter, dokumenttolk, analyse, betaling, fullresultat, utkast, leverandørsvar og oppfølging
- Automatisk regresjons- og sikkerhetstest på push/PR
- Pris-/budskapstest som låser demo = gratis og full sjekk + innsigelse = 29 kr
- Daglig fail-closed kildevakt mot aktive Lovdata-kilder og lovoverganger
- Automatisk GitHub Pages-deploy når Pages er satt til GitHub Actions

## Viktig sikkerhetsprinsipp

Fakturasjekk skal ikke bruke KI som: `les dokument → finn en paragraf som høres riktig ut`.

Målarkitekturen er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → resultat → betaling → kontrollert utkast → eventuell svarrunde 2`

Hvis partstype, dokumentgrunnlag eller rettskilde er usikker skal det aktuelle sporet stoppe eller be om avklaring i stedet for å gjette.

## Eksterne produksjonskoblinger som fortsatt mangler

Motoren og tjenestelaget er bygget, men ekte kunder skal ikke slippes inn før følgende er koblet til og sikkerhetstestet:

- privat produksjonslagring for dokumenter
- faktisk dokumentuttrekk/OCR/KI gjennom extractor-adapteren
- valgt betalingsleverandør gjennom server-verifisert betalingsflyt
- autentisering og produksjonsdatabase
- produksjonshosting/backend-runtime
- gjennomført personvern-/risikovurdering og ferdige vilkår/personverntekster
- flere regelspor og et større syntetisk testbibliotek

GitHub Pages-testen skal fortsatt bare bruke syntetiske data og skal ikke brukes til å laste opp ekte kundedokumenter.
