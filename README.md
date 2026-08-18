# Fakturasjekk.no

Fakturasjekk.no er et norsk forbrukerverktøy for kontroll av faktura mot tilbud, avtale og relevant regelverk.

## Status

Aktuell utviklingsversjon: **V0.31**.

Kundepris i V1: **29 kr for full fakturasjekk + utkast til innsigelse.**

Demoen er gratis og bruker bare syntetiske saker.

## Testadresser etter at GitHub Pages er aktivert

- Kundedemo: `https://krogerhansen-ops.github.io/fakturasjekk/`
- Ende-til-ende motorflyt: `https://krogerhansen-ops.github.io/fakturasjekk/flow-test.html`
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
- Saksservice som kjører inntak → analyse → inkasso → bevis → utkast som én strukturert flyt
- "Ingen dokumenterte avvik" som gyldig resultat
- Dokumentopplastingspolicy med filtype-, størrelse- og dokumentrolle-kontroll
- Kontrakt for dokumentuttrekk/OCR med krav til kildeplassering og confidence-score
- Kritiske verdier må være sikkert lest fra dokument; manglende verdier skal ikke gjettes
- Automatisk regresjons- og sikkerhetstest på push/PR
- Pris-/budskapstest som låser demo = gratis og full sjekk + innsigelse = 29 kr
- Daglig fail-closed kildevakt mot aktive Lovdata-kilder og lovoverganger
- Automatisk GitHub Pages-deploy når Pages er satt til GitHub Actions

## Viktig sikkerhetsprinsipp

Fakturasjekk skal ikke bruke KI som: `les dokument → finn en paragraf som høres riktig ut`.

Målarkitekturen er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → resultat → eventuelt utkast`

Hvis partstype, dokumentgrunnlag eller rettskilde er usikker skal det aktuelle sporet stoppe eller be om avklaring i stedet for å gjette.

## Ikke produksjonsklart ennå

Testversjonen behandler ikke ekte kundedokumenter. Produksjonsversjonen krever fortsatt sikker backend og fillagring, faktisk dokumentuttrekk/OCR, betalingsintegrasjon, saksdatabase, autentisering/saksadgang, personvern-/slettelogikk, svarrunde 2 og videre utvidelse av regelmotoren.
