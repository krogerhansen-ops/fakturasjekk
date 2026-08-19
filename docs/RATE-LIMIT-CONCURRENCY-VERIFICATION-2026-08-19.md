# Fakturasjekk – live rate-limit concurrency verification

Dato: 19.08.2026
Miljø: dedikert Fakturasjekk-produksjon
Project ref: `jxmkaxwflouacuboaetg`
Status: **pågår – ikke godkjent før GitHub Actions-beviset er grønt**

## Krav for godkjenning

Verifikasjonen skal bruke den eksisterende service-only RPC-en `fakturasjekk_increment_rate_limit_window` med kun en syntetisk testnøkkel.

For å lukke launch-gaten må samme workflow-run dokumentere:

- 12 separate PostgreSQL-forbindelser
- 12 unike backend-PID-er
- samtidige kall mot samme syntetiske rate-limit-vindu
- høyeste returnerte teller = 12
- endelig lagret teller = 12
- syntetisk testdata slettet etter prøven
- ingen DDL eller aktivering av kundeporter

Dersom ett av punktene feiler, forblir `TECH_DISTRIBUTED_RATE_LIMIT` åpen.

## Resultat

Fylles først etter etterprøvbart, grønt GitHub Actions-resultat.
