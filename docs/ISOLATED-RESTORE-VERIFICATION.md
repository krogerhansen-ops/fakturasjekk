# Fakturasjekk — isolert restore-verifikasjon

## Formål

En backup/restore-test skal aldri bruke aktiv `fakturasjekk-prod` som restore-mål. Restore utføres først mot localhost eller et separat, eksplisitt identifisert Supabase-prosjekt uten kundetrafikk.

## Hard sperre

`scripts/validate-isolated-restore-target.mjs` må bestå før backupen dekrypteres eller en databaseforbindelse brukes til restore. Den nekter blant annet:

- produksjonsref `jxmkaxwflouacuboaetg`;
- produksjonshost `db.jxmkaxwflouacuboaetg.supabase.co`;
- andre hostnavn som inneholder produksjonsrefen;
- ukjent ekstern PostgreSQL-host;
- Supabase-host der eksplisitt prosjektref mangler eller ikke samsvarer;
- kjøring uten bekreftelsen `I_UNDERSTAND_ISOLATED_RESTORE_ONLY`.

Tillatte mål er localhost eller `db.<annen-ref>.supabase.co` med samsvarende `RESTORE_TARGET_PROJECT_REF`.

## Kryptert restore

`scripts/restore-backup-isolated.sh`:

1. validerer mål før dekryptering;
2. krever separat age-identitetsfil;
3. streamer `age --decrypt` direkte til `pg_restore`;
4. skriver ingen ukryptert dump til permanent eller midlertidig fil;
5. bruker `--no-owner`, `--no-privileges`, `--clean`, `--if-exists` og `--exit-on-error`;
6. erklærer den gjenopprettede databasen som **karantene**, ikke produksjonsklar.

## Obligatorisk etter restore

Restore i seg selv er ikke nok. Før et isolert restore-miljø kan anses trygt:

- koble til den samme private deletion-ledger-kilden eller en verifisert kopi;
- kjør `createRestoreSafety(...).reapplyDeletionTombstones()`;
- krev `safe_to_open_restored_data: true`;
- verifiser at saker slettet etter backupdatoen er borte igjen;
- verifiser at kildefiler fra Storage ikke har gjenoppstått;
- kjør retention-/sikkerhetskontroller;
- dokumenter tidspunkt, backup-ID/hash, restore-mål og testresultat uten kundedata.

## Launch-status

Kode og guardrails kan være grønne uten at `TECH_BACKUP_RETENTION_TEST` er complete. Den gaten kan først vurderes som fullført når en faktisk kryptert backup av den syntetiske produksjonstesten er restored i et isolert mål og deletion-ledger-flyten er verifisert ende-til-ende.
