# Fakturasjekk – Supabase private Storage

Dato: 19.08.2026

## Formål

Dette dokumentet beskriver produksjonsgrensen mellom Fakturasjekks dokumentflyt og den private Supabase Storage-bucketen `case-documents-private`.

Kundeopplasting er fortsatt deaktivert. Implementasjonen er forberedelse til syntetisk live E2E og åpner ingen kundeport.

## Prinsipper

- Bucketen forblir privat (`public=false`).
- Ingen browser-policy gir direkte liste-/lese-/slettetilgang til Storage.
- Serverlaget er hardlåst til Supabase-prosjekt `jxmkaxwflouacuboaetg`.
- Supabase secret key brukes kun i serverkall og skal aldri inn i URL, kundesvar, logger eller offentlig frontend.
- Signert upload URL opprettes server-side.
- Supabases signed-upload-token kan leve lenger enn Fakturasjekks applikasjonsfrist. Fakturasjekk godtar likevel kun ferdigstilt upload innen sin egen korte akseptfrist, standard 10 minutter.
- En opplastet fil er ikke godkjent bare fordi objektet finnes i Storage.

## Ferdigstillingsgrense

Før et dokument kan gå videre til OCR/analyse må den eksisterende private-storage-adapteren kontrollere:

1. storage key tilhører riktig eier og sak,
2. objektet finnes,
3. faktisk størrelse er gyldig og innen 15 MiB,
4. malware-scan er eksplisitt `safe`,
5. magic bytes er verifisert,
6. detektert MIME er i allowlisten,
7. opplastingen er innen Fakturasjekks egen akseptfrist.

Providerlaget utfører ikke malware- eller magic-byte-scanning selv. Disse kontrollene skal komme fra en separat produksjonsscanner. Manglende scannerbevis skal stoppe flyten.

## Sletting og restore-sikkerhet

Saksobjekter lagres under eier-/saksprefix. Ved sletting:

1. deletion tombstone skrives først til en separat `deletion-ledger/`-sti,
2. saksobjektene slettes og slettingen verifiseres,
3. databaseinnholdet slettes,
4. deletion-ledger beholdes tidsbegrenset for å kunne re-applisere sletting etter eventuell restore.

Deletion-ledger ligger utenfor saksobjektets prefix slik at vanlig sletning av en sak ikke samtidig sletter restore-sikkerhetsbeviset.

## Hva som fortsatt mangler før launch-gaten kan lukkes

- live signed-upload mot den private produksjonsbucketen med syntetisk dokument,
- faktisk produksjonsscanner for malware + magic bytes,
- serververifisert finalize,
- purge/sletting mot både database og Storage,
- restore E2E som viser at deletion-ledger re-appliserer sletting.

Ingen av disse punktene skal markeres complete kun fordi providerkoden finnes.
