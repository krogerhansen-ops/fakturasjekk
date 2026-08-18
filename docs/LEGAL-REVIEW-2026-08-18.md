# Fakturasjekk – rettskildekontroll før launch

Dato: 18.08.2026

Formål: dokumentere at de aktive V1-regelsporene er kontrollert mot gjeldende Lovdata-kilder før launch candidate.

## Resultat

De aktive regelsporene i `rules/rules.json` er gjennomgått mot Lovdata 18.08.2026. Kontrollen bekrefter følgende:

- **Håndverkertjenesteloven § 32**: prisoverslag kan som utgangspunkt ikke overskrides vesentlig og i alle fall ikke med mer enn 15 %, med uttrykkelige unntak for annen avtalt prisgrense og rett til pristillegg etter § 33.
- **Håndverkertjenesteloven § 33**: pristillegg kan kreves for dokumentert tilleggsarbeid innenfor lovens vilkår og for ekstra materialer/arbeid som skyldes uforutsette forhold på forbrukerens side.
- **Håndverkertjenesteloven § 36**: regningen skal gjøre det mulig å bedømme arbeidets/materialenes art og omfang, prisberegningen skal fremgå når tjenesten ikke er fastpris, pristillegg etter § 33 skal særskilt angis, og særskilt gebyr for skriving/sending av regning kan ikke kreves i tillegg.
- **Forbrukerkjøpsloven § 37**: gebyr for utstedelse/sending av regning kan ikke kreves i tillegg til kjøpesummen med mindre det klart følger av avtalen.
- **Prisopplysningsforskriften § 10**: tjenesteyter skal opplyse om fullstendige priser og relevante tillegg/betalingsbetingelser.
- **Prisopplysningsforskriften § 12**: skriftlig pristilbud skal på forespørsel angi deltjenester/varer og totalpris så langt praktisk mulig; nye forhold som øker prisen etter oppstart skal kommuniseres straks.
- **Bokføringsforskriften § 5-1-1**: salgsdokumentet skal minst inneholde dokumentnummer/-dato, parter, ytelsens art/omfang, leveringstid/-sted, vederlag/betalingsforfall og relevant MVA/avgift.
- **Inkassoloven 1988 §§ 8, 9, 10 og 17**: de registrerte sporene om god inkassoskikk, inkassovarsel, betalingsoppfordring/innsigelser og kostnader ved rimelig begrunnede innsigelser samsvarer med gjeldende Lovdata-tekst.

## Ny inkassolov 2026

Lov 22. mai 2026 nr. 19 om inkassovirksomhet og inndriving av forfalte pengekrav er vedtatt, men Lovdata oppgir fortsatt **«Ikrafttredelse: Kongen bestemmer»**. Den gjeldende 1988-loven opplyser samtidig at den oppheves når 2026-loven trer i kraft. Fakturasjekk skal derfor fortsatt bruke 1988-loven som aktivt runtime-spor inntil faktisk ikrafttredelsesdato er fastsatt.

Repoets `legal-source-watch.yml` og regelovergangstester skal fortsette å overvåke dette fail-closed.

## Juridiske sikkerhetsgrenser

- Regeltekst brukes ikke alene til å fastslå at et krav er ugyldig.
- Bokføringsmessige/formelle mangler presenteres ikke automatisk som bortfall av hovedkravet.
- Prisopplysningsforskriften brukes som prisopplysnings-/tilbudsspor, ikke som selvstendig grunnlag for å erklære et kontraktskrav ugyldig.
- Inkassobrudd og inkassokostnader holdes adskilt fra spørsmålet om selve hovedkravet består.
- Ved tvil om dokumentfakta eller rettslige vilkår skal saken stoppes eller be om avklaring.

## Primærkilder kontrollert

- https://lovdata.no/lov/1989-06-16-63
- https://lovdata.no/lov/2002-06-21-34
- https://lovdata.no/forskrift/2012-11-14-1066
- https://lovdata.no/forskrift/2004-12-01-1558
- https://lovdata.no/lov/1988-05-13-26
- https://lovdata.no/lov/2026-05-22-19

Denne gjennomgangen dokumenterer V1-regelregisteret slik det står 18.08.2026. Den erstatter ikke individuell juridisk rådgivning i konkrete tvister.
