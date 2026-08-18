# Fakturasjekk.no

Fakturasjekk.no er et norsk forbrukerverktøy for kontroll av faktura mot tilbud, avtale og relevant regelverk.

## Status

Aktuell utviklingsversjon: V0.23.

Kundepris i V1: **29 kr for full fakturasjekk + utkast til innsigelse.**

Demoen er gratis og bruker bare syntetiske saker.

## Testadresser etter at GitHub Pages er aktivert

- Kundedemo: `https://krogerhansen-ops.github.io/fakturasjekk/`
- Motor-test: `https://krogerhansen-ops.github.io/fakturasjekk/motor-test.html`
- Regelpanel: `https://krogerhansen-ops.github.io/fakturasjekk/admin/rules.html`

## Bygget så langt

- Ekstern kundedemo med fire syntetiske saker
- Regel- og paragrafkontroll med Lovdata som primærkilde
- Versjonert regelregister med kontrollstatus og dato
- Deterministisk analysemotor for sentrale V1-kontroller
- Kontrollert utkastsgenerator som bare siterer aktive regler
- B2B-stopp i forbruker-V1
- "Ingen avvik" som gyldig resultat
- Automatisk regresjonstest på push/PR
- Pris-/budskapstest som låser demo = gratis og full sjekk + innsigelse = 29 kr
- Daglig fail-closed kildevakt mot aktive Lovdata-kilder
- Automatisk GitHub Pages-deploy når Pages er satt til GitHub Actions

## Viktig sikkerhetsprinsipp

Fakturasjekk skal ikke bruke KI som: `les dokument → finn en paragraf som høres riktig ut`.

Målarkitekturen er:

`Dokument → faktum → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → resultat → eventuelt utkast`

Hvis partstype, dokumentgrunnlag eller rettskilde er usikker skal det aktuelle sporet stoppe eller be om avklaring i stedet for å gjette.

## Ikke produksjonsklart ennå

Testversjonen behandler ikke ekte kundedokumenter. Produksjonsversjonen krever fortsatt sikker filopplasting, separat backend, dokumentuttrekk/OCR, betalingsintegrasjon, saksmappe, personvern-/slettelogikk og videre utvidelse av regelmotoren.
