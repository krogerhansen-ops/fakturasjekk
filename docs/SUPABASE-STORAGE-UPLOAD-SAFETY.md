# Fakturasjekk – sikker opplasting med Supabase Storage

Dato: 18.08.2026
Status: Produkt-/serverkontroll implementert. Faktisk Supabase Storage-provider og live E2E er fortsatt blokkert til provider-API, malware/magic-byte-kontroll og live prosjektverifisering er ferdig.

## Problem

Fakturasjekk ønsker et kort opplastingsvindu. Supabase sin nåværende signed-upload-mekanisme kan ha en lengre providerstyrt tokenlevetid enn produktets ønskede vindu. Providerens tokenlevetid skal derfor ikke definere hvor lenge Fakturasjekk godtar et dokument.

## Produktbeslutning

- Fakturasjekk sitt akseptvindu: **10 minutter / 600 sekunder**.
- Maks tillatt provider-token i dagens adapter: **2 timer / 7200 sekunder**.
- Klienten får bare Fakturasjekks `expires_at`.
- Providerens faktiske `provider_expires_at` holdes internt.
- Bekreftelse etter Fakturasjekks frist avvises **før** filen kan finaliseres, skannes eller analyseres.
- Et dokument med utløpt applikasjonsvindu får status `upload_window_expired`.
- Dokumenter med denne statusen behandles aldri som opplastet dokumentasjon.
- Analyse og faktabekreftelse sender bare dokumenter med status `uploaded` videre.

## Hvorfor orphan-filen ikke slettes ved minutt 10

Dersom provider-tokenet fortsatt teknisk er gyldig, kan klienten i teorien laste opp på nytt etter at vi har slettet objektet. Fakturasjekk godtar fortsatt ikke dokumentet, men gjentatt upload/delete kan skape unødvendig trafikk og lagringsstøy.

Derfor:

1. Ved minutt 10: Fakturasjekk slutter å akseptere reservasjonen.
2. Reservasjonen beholdes internt som utløpt, med providerens reelle utløpstid.
3. Når provider-tokenet også er utløpt: retention-jobben sletter eventuell orphan-fil og fjerner reservasjonsmetadata.
4. Housekeeping oppdaterer **ikke** sakens `updated_at`, slik at systemopprydding aldri forlenger 7/90-dagers retention.

## Intern vs offentlig metadata

Internt dokumentrecord kan inneholde:

- `storage_key`
- `upload_expires_at`
- `provider_upload_expires_at`

Offentlig upload-target kan inneholde:

- `document_id`
- signed upload URL
- Fakturasjekk `expires_at`
- nødvendige HTTP-headere

Offentlig target skal ikke inneholde:

- `storage_key`
- providerens faktiske utløpstid
- Supabase secret/service key
- database credentials

## Fail-closed regler

Upload finaliseres ikke dersom:

- Fakturasjekk-vinduet er utløpt
- objektet mangler
- objektstørrelse er ugyldig/for stor
- magic bytes ikke stemmer
- malware-kontroll ikke er eksplisitt trygg
- oppdaget MIME-type ikke står på allowlist
- storage-key ikke tilhører riktig sak/eier

## Supabase-provider ikke aktivert ennå

Denne endringen løser **produktets tids-/orphanmodell**, men den later ikke som den konkrete Supabase Storage-providerintegrasjonen er ferdig. Før live må vi fortsatt verifisere den eksakte current Supabase upload-metoden vi bruker, inkludert om browserflyten skal bruke signed URL direkte eller providerens tokenbaserte `uploadToSignedUrl`-metode.

Vi skal ikke eksponere en intern storage-key bare for å få en provider-SDK til å passe. Hvis den sikreste integrasjonen krever et annet kontraktformat, skal den kontrakten få egen review/test før kunde-API åpnes.

## Live tester før launch

Med syntetisk fil:

1. reserver upload
2. kontroller at klientens frist er 10 minutter
3. kontroller at providerfrist ikke returneres til klienten
4. bekreft innen 10 minutter → fil kan gå til server-side verifikasjon
5. ny reservasjon: vent/sett klokke etter 10 minutter → bekreftelse avvises før verifikasjon
6. bekreft at utløpt reservasjon ikke sendes til extractor
7. før provider-tokenets utløp: orphan-record beholdes
8. etter provider-tokenets utløp: retention-jobb fjerner fil og reservasjonsrecord
9. bekreft at cleanup ikke endrer sakens brukeraktivitet/retention-klokke
10. kjør storage/RLS/Security Advisor på live `fakturasjekk-prod`

## Kilder

- Supabase Storage signed upload URL: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
- Supabase upload to signed URL: https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Storage schema / bruk API for objektoperasjoner: https://supabase.com/docs/guides/storage/schema/design
