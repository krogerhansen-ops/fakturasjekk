# Fakturasjekk – live rate-limit concurrency verification

Dato: 19.08.2026
Miljø: dedikert Fakturasjekk-produksjon
Project ref: `jxmkaxwflouacuboaetg`
Status: **pågår – launch-gaten er fortsatt åpen**

## Krav

Den godkjente GitHub-workflowen på `main` skal bevise:

- 12 separate PostgreSQL-forbindelser
- 12 unike backend-PID-er
- samme syntetiske rate-limit-nøkkel/vindu
- høyeste returnerte teller = 12
- endelig lagret teller = 12
- syntetisk testdata slettet etterpå
- ingen DDL, ingen endring av produksjonsporter og ingen kundedata

Launch-gaten `TECH_DISTRIBUTED_RATE_LIMIT` endres først når både denne live-jobben og ordinær quality gate er grønne og loggene er kontrollert.

## Resultat

Fylles etter verifisert GitHub Actions-run.
