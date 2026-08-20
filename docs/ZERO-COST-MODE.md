# Fakturasjekk – 0-kroners utviklingsmodus

## Formål
Fakturasjekk skal kunne bygges, testes og demonstreres videre uten nye løpende kostnader mens prosjektet venter på sponsor-/partnerfinansiering.

## Aktiv modus
`FAKTURASJEKK_COST_MODE=zero`

I denne modusen skal følgende forbli av:

- offentlig opplasting av ekte kundedokumenter
- produksjons-API for ekte kundesaker
- Vipps/annen betalingsleverandør
- Google Cloud Vision eller annen betalt OCR
- Vertex AI/annen betalt strukturert KI-tolk
- betalt Svarrunde 2-tolk

## Det som kan brukes gratis nå

- GitHub Pages til offentlig syntetisk beta
- GitHub Actions innenfor tilgjengelig gratisbruk
- eksisterende Supabase-prosjekt innenfor Free-kvotene
- privat Supabase Storage innenfor Free-kvoten
- Supabase Database/Auth/Edge Functions innenfor Free-kvotene
- Brønnøysundregistrenes åpne API
- Lovdata/offentlige rettskilder til kildekontroll i den eksisterende kildevakten
- syntetiske demoer og regresjonstester
- manuell eller lokal dokumentuttrekking i intern test

## Gratis Supabase-ramme kontrollert 20.08.2026
Supabase oppgir for Free blant annet 500 MB database, 1 GB filstorage, 5 GB egress, 50 000 MAU og 500 000 Edge Function-kall per planperiode. Prosjektet skal ikke forutsette overforbruk eller betalte add-ons mens 0-kroners modus er aktiv.

## Sikkerhetsregel
`server/zero-cost-mode.mjs` stopper kostnadsutløsende konfigurasjon. For å gå over til finansiert modus kreves både:

- `FAKTURASJEKK_COST_MODE=funded`
- `FAKTURASJEKK_PAID_SERVICES_APPROVED=approved`

Dette skal være en bevisst overgang etter finansiering – ikke en sideeffekt av at en API-nøkkel blir lagt inn.

## Nåværende produksjonsgrense
Supabase-prosjektet og privat bucket kan klargjøres og sikkerhetstestes, men offentlig kundopplasting forblir av frem til dokumenttolk, personvern, retention/sletting og hele ende-til-ende-kjeden er kontrollert.

## Prioritet mens vi venter på sponsor
1. Maksimer testdekning og juridisk/regelmessig sikkerhet.
2. Verifiser privat lagring, databaseintegritet og sletting.
3. Bygg manuell/syntetisk extractor som gratis erstatning i intern pilot.
4. Forbered adaptergrensene for OCR og betaling slik at leverandører kan kobles på senere uten redesign.
5. Forbedre offentlig beta, demoer, sponsorunderlag og måling uten ekte kundedata.
