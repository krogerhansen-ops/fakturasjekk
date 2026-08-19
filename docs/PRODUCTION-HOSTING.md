# Fakturasjekk – produksjonshosting

Dato: 19.08.2026

## Beslutning

GitHub Pages brukes kun til offentlig, syntetisk demo og ekstern produkttest. Den betalende Fakturasjekk-tjenesten skal ikke kjøres som kommersiell SaaS på GitHub Pages.

Produksjonsmål for V1:

- frontend: Cloudflare Pages, statiske assets på Free-plan
- backend/API: dedikert Supabase-prosjekt `jxmkaxwflouacuboaetg`
- database/auth/private storage/Edge runtime: Supabase
- OCR: Google Cloud Vision EU
- strukturert dokumenttolking og Svarrunde 2: Google Vertex AI EU
- betaling: Vipps MobilePay ePayment

## Hvorfor splitte demo og produksjon

GitHub Pages-vilkårene sier at Pages ikke er ment eller tillatt som gratis hosting for en nettjeneste som primært driver kommersielle transaksjoner eller kommersiell SaaS. Den eksisterende demoen er derfor låst til syntetiske saker og skal ikke ta imot ekte dokumenter eller betaling.

Cloudflare Pages støtter statisk hosting og custom domain. Fakturasjekk trenger ikke Cloudflare Pages Functions i V1 fordi kunde-API-et ligger i Supabase. Dette holder frontend-hosting på null fast kostnad innenfor Free-planens grenser.

## Sikkerhetsgrense

Produksjonsfrontenden skal aldri inneholde:

- Supabase secret/service-role key
- database-URL med legitimasjon
- Google service-account private key
- Vipps client secret/subscription key/webhook secret
- kundedokumenter i statiske deploy-artifacts

Nettleseren får kun offentlige konfigurasjonsverdier og kortlivede, serverutstedte operasjoner. Betalingsstatus skal fortsatt verifiseres server-side; browser redirect alene kan aldri låse opp fullresultat.

## Go-live-port

`production_frontend.deployed` i `config/hosting-target.json` skal forbli `false` til følgende er utført:

1. Cloudflare Pages-prosjekt er opprettet mot Fakturasjekk-repoet.
2. Produksjonsdomene er koblet til og HTTPS er aktivt.
3. Tillatte origins/CORS i backend er satt til det faktiske produksjonsdomenet.
4. Supabase Auth redirect/site URLs er satt til produksjonsdomenet.
5. Kunde-API er deployet og verifisert med syntetisk E2E.
6. Ingen ekte dokumentopplasting eller Vipps-betaling åpnes før øvrige launch-gates er komplette.

## Kostnadsprinsipp

Cloudflare Pages brukes statisk slik at frontend ikke trenger fast hostingkostnad i V1. Eventuelle senere Functions/Workers skal være en eksplisitt ny arkitekturbeslutning og ikke innføres når Supabase allerede dekker backend-behovet.

Kilder for den løpende leverandørvurderingen er lagret i `config/hosting-target.json`. Pris og vilkår må re-verifiseres før betalt lansering.
