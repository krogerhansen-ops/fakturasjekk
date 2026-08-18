# Fakturasjekk – retention og verifiserbar sletting

Dato: 18.08.2026
Status: V1-policy og testkrav. Produksjons-E2E kan først godkjennes når faktiske lagrings-/backup-leverandører er valgt.

## Produktfrister

- Kildedokumenter i standardmodus: slettes senest 24 timer etter fullført analyse.
- Midlertidig saksinnhold: slettes 7 dager etter siste aktivitet.
- Lagret sak: 90 dager etter siste aktivitet; fornyelse krever aktiv brukerhandling.
- Sikkerhets-/auditlogger: mål maks 90 dager, og skal ikke inneholde dokumenttekst/secrets.
- Betalings-/regnskapsdata: håndteres separat etter faktisk rettslig oppbevaringsplikt og skal ikke brukes som grunn til å beholde kundens opplastede dokumenter.
- Backups med persondata: produksjonsleverandør må støtte dokumentert utløp. Produktkrav er kortest praktisk forsvarlige vindu og maksimalt 35 dager for ordinær roterende backup med mindre særskilt dokumentert behov tilsier annet.

Fristene er produktbeslutninger og skal godkjennes i endelig DPIA.

## Sletting betyr sletting fra alle operative lag

`delete_case_now` og automatisk purge skal omfatte:

1. private object-storage filer
2. uttrukket dokumentinnhold
3. saks-snapshot/analyse
4. genererte utkast
5. leverandørsvar/Svarrunde 2
6. cache/arbeidsfiler som kan identifisere saken
7. eventuelle provider-side artefakter der API/avtale støtter eksplisitt sletting

Minimal audit om at sletting skjedde kan beholdes etter egen retention, men skal ikke inneholde dokumenttekst, storage key, brukerfritekst eller hemmeligheter.

## Backup-regel

Slettede data kan eksistere i roterende backup frem til backupens utløp. De skal ikke gjeninnføres i aktiv behandling ved restore.

Produksjonskrav:

- dokumenter backup-retention per provider
- dokumenter kryptering og tilgangskontroll
- ved restore skal purge/deletion-ledger re-appliseres før gjenåpning for brukere
- en slettet sak skal forbli utilgjengelig selv om eldre backup gjenopprettes
- backup skal slettes ved utløp og ikke arkiveres «for sikkerhets skyld»

## E2E-verifikasjon før live

Test med syntetisk sak:

1. last opp privat test-PDF
2. kjør extraction/analyse
3. lagre saken
4. generer utkast og Svarrunde 2
5. slett saken
6. verifiser 404/forbidden via API
7. verifiser objekt ikke finnes i storage
8. verifiser saks-/analyse-/utkast-/svarinnhold er borte i database
9. verifiser audit bare inneholder tillatt minimal slettestatus
10. kjør purge-jobb på utløpt sak og bekreft samme resultat
11. gjennomfør restore-test fra backup i isolert miljø og bekreft at deletion-ledger/purge hindrer gjenoppliving

Launch-gatene `TECH_DELETE_END_TO_END_TEST` og `TECH_BACKUP_RETENTION_TEST` skal ikke settes complete før denne testen er kjørt mot faktisk produksjonsstack.

## Databehandlerkrav

Kontrakt/DPA med storage, database, AI/OCR, support/logging og andre relevante providere skal beskrive sletting/retur ved opphør og underveis, samt backup-retention der relevant.

## Kilder

- Datatilsynet – lagringsbegrensning: https://www.datatilsynet.no/rettigheter-og-plikter/personvernprinsippene/grunnleggende-personvernprinsipper/lagringsbegrensning/
- Datatilsynet – rett til sletting: https://www.datatilsynet.no/rettigheter-og-plikter/den-registrertes-rettigheter/rett-til-sletting/
