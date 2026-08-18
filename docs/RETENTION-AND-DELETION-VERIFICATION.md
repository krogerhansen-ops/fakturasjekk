# Fakturasjekk – retention og verifiserbar sletting

Dato: 18.08.2026
Status: V1-policy og implementerte kodekontroller. Produksjons-E2E kan først godkjennes når live Supabase database/storage og faktisk backup/restore er verifisert.

## Produktfrister

- Kildedokumenter i standardmodus: slettes senest 24 timer etter fullført analyse.
- Midlertidig saksinnhold: slettes 7 dager etter siste aktivitet.
- Lagret sak: 90 dager etter siste aktivitet; fornyelse krever aktiv brukerhandling.
- Sikkerhets-/auditlogger: mål maks 90 dager, og skal ikke inneholde dokumenttekst/secrets.
- Betalings-/regnskapsdata: håndteres separat etter faktisk rettslig oppbevaringsplikt og skal ikke brukes som grunn til å beholde kundens opplastede dokumenter.
- Ordinær roterende databasebackup med persondata: maks 35 dager.
- Restore-sikker deletion ledger: 45 dager. Dette er lengre enn maksimalt backupvindu, men kort nok til at sikkerhetsmekanismen ikke blir et permanent sletteregister.

Fristene er produktbeslutninger og skal godkjennes i endelig DPIA.

## Sletting betyr sletting fra operative lag

`delete_case_now` og automatisk purge skal omfatte:

1. private object-storage filer
2. uttrukket dokumentinnhold
3. saks-snapshot/analyse
4. genererte utkast
5. leverandørsvar/Svarrunde 2
6. hendelser og cache/arbeidsfiler som kan identifisere saksinnhold
7. eventuelle provider-side artefakter der API/avtale støtter eksplisitt sletting

Produksjonsadapteren skal ikke beholde hele saks-snapshotet som en soft-delete. Etter sletting beholdes bare et minimalt database-tombstone med tekniske tids-/statusfelter. Innholdsbærende child records slettes.

Betalings-/regnskapsdata og minimal sikkerhetsaudit vurderes separat fordi de kan ha et annet lovlig oppbevaringsformål. Dette skal aldri brukes som grunn til å beholde opplastede dokumenter, analyseinnhold eller utkast.

## Restore-sikker deletion ledger

Før en manuell eller automatisk full saks-sletting utføres, lagres et minimalt tombstone i privat storage under `deletion-ledger/`.

Tombstonen inneholder bare:

- versjon
- tilfeldig/teknisk `case_id`
- `deleted_at`

Den skal ikke inneholde navn, e-post, owner-id, dokumentnavn, fakturadata, analyse, utkast eller leverandørsvar.

Formålet er utelukkende restore-sikkerhet: Hvis en gammel databasebackup gjenopprettes, skal tombstonene re-appliseres før den gjenopprettede databasen gjøres tilgjengelig. Saker som brukeren allerede hadde slettet skal dermed purges på nytt.

Tombstone slettes automatisk etter 45 dager. Med maks backupvindu på 35 dager gir dette 10 dagers sikkerhetsmargin.

## Backup-regel

Slettede data kan eksistere i kryptert roterende backup frem til backupens utløp, maksimalt 35 dager etter dagens produktkrav. De skal ikke gjeninnføres i aktiv behandling ved restore.

Produksjonskrav:

- backup skal være kryptert før den skrives permanent til disk
- backupfiler skal ikke legges i GitHub-repo eller GitHub Actions artifacts
- backupkatalog/-lager skal ha begrenset operatørtilgang
- databasebackup skal ikke brukes som grunn til å sikkerhetskopiere kildefakturaer i Storage; disse følger egen korte retention
- ved restore skal deletion ledger re-appliseres før gjenåpning for brukere
- en slettet sak skal forbli utilgjengelig selv om eldre backup gjenopprettes
- backup skal slettes ved utløp og ikke arkiveres «for sikkerhets skyld»

`scripts/backup-supabase-free.sh` er en kostnadsfri operasjonell kandidat som streamer `pg_dump` direkte til `age`-kryptering og roterer krypterte databasebackuper etter maksimalt 35 dager. Den er ikke grunnlag for å lukke backup-launch-gaten før den er kjørt og restore-testet mot faktisk produksjonsstack.

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
9. verifiser database-raden bare inneholder minimalt tombstone og ingen sensitive snapshot-data
10. verifiser restore-tombstone er opprettet uten owner-id eller saksinnhold
11. verifiser audit bare inneholder tillatt minimal slettestatus
12. kjør purge-jobb på utløpt sak og bekreft samme resultat
13. ta en kryptert databasebackup med syntetisk data
14. slett test-saken etter at backupen er tatt
15. restore den eldre backupen i isolert miljø
16. kjør `reapplyDeletionTombstones()` før gjenåpning
17. bekreft at den slettede saken purges på nytt og ikke kan leses
18. bekreft at tombstones eldre enn 45 dager slettes

Launch-gatene `TECH_DELETE_END_TO_END_TEST` og `TECH_BACKUP_RETENTION_TEST` skal ikke settes complete før denne testen er kjørt mot faktisk produksjonsstack.

## Supabase Free

Free-planen brukes av kostnadshensyn i første fase. Den mangler automatiske databasebackuper, så Fakturasjekk må ha en egen operasjonell backup-rutine før ekte kundedata åpnes. Dersom en betalt plan senere tas i bruk, må provider-backupens retention og restore-egenskaper fortsatt samsvare med denne policyen; en leverandørbackup erstatter ikke deletion-ledger-kravet.

## Databehandlerkrav

Kontrakt/DPA med storage, database, AI/OCR, support/logging og andre relevante providere skal beskrive sletting/retur ved opphør og underveis, samt backup-retention der relevant.

## Kilder

- Datatilsynet – lagringsbegrensning: https://www.datatilsynet.no/rettigheter-og-plikter/personvernprinsippene/grunnleggende-personvernprinsipper/lagringsbegrensning/
- Datatilsynet – rett til sletting: https://www.datatilsynet.no/rettigheter-og-plikter/den-registrertes-rettigheter/rett-til-sletting/
- Supabase – database backups: https://supabase.com/docs/guides/platform/backups
