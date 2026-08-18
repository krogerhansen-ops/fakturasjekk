# Fakturasjekk – backup/restore på Supabase Free

Dato: 18.08.2026
Status: Operasjonell kandidat. Launch-gaten for backup forblir blokkert til dette er kjørt mot live `fakturasjekk-prod` med syntetiske data og restore-verifisert.

## Mål

Beholde 0 kr i faste databasebackup-kostnader i tidlig fase uten å svekke personvernkravene.

Supabase Free brukes for `fakturasjekk-prod`. Free-planen har ikke automatiske databasebackuper. Derfor brukes en separat, kryptert logisk databasebackup inntil volum/inntekter tilsier at en betalt plan er mer hensiktsmessig.

## Hva backupen omfatter

Standardbackup omfatter PostgreSQL-data som er nødvendige for å gjenopprette Fakturasjekks database.

Den skal **ikke** kopiere kildefakturaer/tilbud fra Supabase Storage til et ekstra backup-lager. Kildedokumenter følger sin egen korte retention og slettes normalt etter 24 timer i midlertidig modus.

Betalings-/regnskapsdata kan ha separat retention og må vurderes mot bokføringsplikter før live.

## Verktøy

`scripts/backup-supabase-free.sh` krever:

- PostgreSQL-klient med `pg_dump`
- `age` for kryptering
- `DATABASE_URL` i runtime-miljøet
- `AGE_RECIPIENT` som offentlig age-recipient

Den private age-identiteten skal oppbevares separat fra backupfilene og aldri commits til GitHub.

## Backup-flyt

1. Bruk kun database-URL for `fakturasjekk-prod`.
2. Sett `AGE_RECIPIENT` til backupnøkkelens offentlige recipient.
3. Kjør `scripts/backup-supabase-free.sh` fra en betrodd maskin eller en senere dedikert backup-runner.
4. `pg_dump` sendes direkte via pipe til `age`; det skrives ikke en ukryptert dumpfil til permanent disk.
5. Kryptert fil får modus 0600.
6. Backuper eldre enn maksimalt 35 dager slettes.
7. Backupfiler skal ikke lastes opp til GitHub repo eller GitHub Actions artifacts.

Eksempel på miljø, uten ekte verdier:

```bash
export DATABASE_URL='postgresql://...'
export AGE_RECIPIENT='age1...'
export BACKUP_DIR="$HOME/.local/share/fakturasjekk-backups"
./scripts/backup-supabase-free.sh
```

## Restore-flyt – alltid isolert først

En backup skal aldri restores direkte over aktiv produksjon som første steg.

1. Opprett/bruk en isolert restore-database uten kundetrafikk.
2. Deaktiver all offentlig tilgang til restore-miljøet.
3. Dekrypter backupen med privat age-identitet og stream til `pg_restore`.
4. Kontroller migrasjons-/schema-kompatibilitet.
5. Koble restore-miljøet til den **samme private deletion ledger-kilden eller en verifisert kopi av ledgeren**.
6. Kjør `createRestoreSafety(...).reapplyDeletionTombstones()`.
7. Krev `safe_to_open_restored_data: true` før data kan gjøres tilgjengelig.
8. Verifiser at saker slettet etter backupdatoen ikke lenger kan leses.
9. Kjør retention/purge og sikkerhetskontroller.
10. Først deretter kan et kontrollert produksjons-restore vurderes.

## Restore-test som må bestås før live

Bruk kun syntetiske data:

- T0: opprett en test-sak med dokumentmetadata, analyse og utkast.
- T1: ta kryptert databasebackup.
- T2: slett saken gjennom Fakturasjekk API.
- T3: bekreft at deletion tombstone finnes og at operativt saksinnhold er purget.
- T4: restore T1-backup i isolert miljø; saken vil da teknisk finnes igjen.
- T5: kjør restore-safety før miljøet åpnes.
- T6: bekreft at saken purges på nytt.
- T7: bekreft at kildefilene ikke gjenoppstår fra databasebackupen.
- T8: bekreft at audit kun viser minimale tekniske hendelser.

Først etter dette kan `TECH_BACKUP_RETENTION_TEST` vurderes som complete.

## Deletion ledger

Deletion ledger er ikke en vanlig backup og skal ikke brukes til andre formål.

- inneholder kun `case_id`, `deleted_at` og formatversjon
- ingen owner-id
- ingen dokumentnavn
- ingen fakturadata
- ingen analyse eller utkast
- TTL: 45 dager

45 dager er valgt fordi ordinær backup maksimalt skal leve 35 dager. Tombstonen overlever dermed alle backuper den må beskytte mot, med 10 dagers margin, og slettes deretter.

## Når bør vi gå til Supabase Pro?

Ikke oppgrader bare fordi produktet eksisterer. Vurder betalt plan når minst ett av disse blir sant:

- betalende trafikk gjør pause-/driftsrisiko uakseptabel
- manuell/gratis backupdrift blir mer kostbar i tid enn abonnementet
- krav til automatiske backuper/PITR blir et reelt produksjonsbehov
- datavolum eller annen Free-kvote nærmer seg grensen
- inntektene gjør fast infrastrukturkostnad ubetydelig

En oppgradering må ikke endre 24t/7d/90d-retention uten ny personvernvurdering.

## Kilder

- Supabase – Database Backups: https://supabase.com/docs/guides/platform/backups
- Supabase – Manage Disk Usage / Free-plan-pausing og ressursgrenser: https://supabase.com/docs/guides/platform/manage-your-usage/disk-usage
- Datatilsynet – lagringsbegrensning: https://www.datatilsynet.no/rettigheter-og-plikter/personvernprinsippene/grunnleggende-personvernprinsipper/lagringsbegrensning/
