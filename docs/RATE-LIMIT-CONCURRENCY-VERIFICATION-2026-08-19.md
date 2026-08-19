# Fakturasjekk – live rate-limit concurrency verification

Dato: 19.08.2026
Miljø: dedikert Fakturasjekk-produksjon
Project ref: `jxmkaxwflouacuboaetg`
Status: **pågår – launch-gaten er fortsatt åpen**

## Godkjenningskrav

Den permanente, CI-validerte workflowen på `main` skal bevise:

- 12 separate PostgreSQL-forbindelser
- 12 unike backend-PID-er
- samme syntetiske rate-limit-nøkkel/vindu
- høyeste returnerte teller = 12
- endelig lagret teller = 12
- syntetisk testdata slettes etterpå
- ingen DDL, ingen produksjonsport-aktivering og ingen kundedata

Launch-gaten `TECH_DISTRIBUTED_RATE_LIMIT` endres først etter grønn live-workflow, grønn ordinær quality gate og kontroll av loggene.

## Resultat

Fylles først etter etterprøvbart GitHub Actions-bevis.
