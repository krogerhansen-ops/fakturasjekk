# Mobil dokumentinntak – fil og kamera

## Mål

Fakturasjekk skal kunne motta samme dokumentgrunnlag på to enkle måter:

1. Velg/last opp eksisterende dokument.
2. Ta bilde av faktura, tilbud eller annet støttedokument med mobilkamera.

Begge innganger skal ende i den samme serverkontrollerte dokumentflyten. Kamera skal ikke opprette en separat eller svakere sikkerhetsvei.

## Felles sikkerhetsflyt

`lokalt dokument -> klient-forhåndskontroll -> registrer metadata -> privat signert upload -> serververifisering -> dokument godkjent -> analyse`

Analyse skal fortsatt være blokkert til alle reserverte dokumenter er serverbekreftet som opplastet.

Backend er autoritativ for:

- magic-byte/filsignatur,
- faktisk MIME-type,
- filstørrelse,
- malware-/sikkerhetskontroll,
- sakseierskap,
- privat storage,
- opplastingsfrist,
- retention/sletting.

Klientens MIME-type eller kamerakilde er aldri tilstrekkelig dokumentverifikasjon.

## Kamera og personvern

Rå kamerafiler kan inneholde EXIF-metadata, inkludert tidspunkt, kameramodell og i enkelte tilfeller posisjonsdata. Fakturasjekk trenger ikke slike data for fakturakontroll.

Derfor er kamera-kontrakten fail-closed:

- et kamerabilde må gjennom en eksplisitt sanitizer før det kan forberedes for upload,
- sanitizeren må bekrefte `metadata_stripped=true`,
- rå kamerafil sendes ikke dersom sanitizer mangler eller feiler,
- sanitizert output må være en MIME-type som allerede er godkjent av upload-policyen,
- lokal informasjon om at filen kom fra kamera sendes ikke som nytt backend-felt.

Dette gjør det mulig å ta imot for eksempel HEIC fra en iPhone lokalt, konvertere/re-encode bildet og laste opp en metadata-strippet JPEG dersom den lokale sanitizer-implementasjonen støtter det.

## Støttede upload-formater etter klargjøring

- PDF
- JPEG
- PNG
- WebP

HEIC/HEIF er ikke et servergodkjent sluttformat i V1. En slik kamerafil må konverteres lokalt til et tillatt format før registrering/opplasting.

## Flere sider

En papirfaktura med flere sider kan fotograferes som flere bildefiler. Hver fil registreres som eget dokument, men kan ha samme dokumentrolle, for eksempel `invoice`.

Gjeldende grense er maksimalt 8 filer per sak. Backend-policyen er fortsatt autoritativ for antall filer og samlet størrelse.

## Opplastingsrekkefølge

Browser-koordinatoren følger:

1. `registerUploads`
2. signert `PUT` direkte til privat object storage
3. `confirmDocument` mot Fakturasjekk-backend
4. neste fil

Bearer-token til Fakturasjekk skal aldri sendes til den signerte storage-URL-en.

Hvis target-antall, document-id eller serverbekreftelse ikke stemmer, stopper flyten. Den skal ikke anta at upload var vellykket.

## Ikke aktivert offentlig ennå

Denne modulen forbereder mobilflyten, men offentlig beta skal fortsatt ikke motta ekte kundedokumenter mens `FAKTURASJEKK_COST_MODE=zero` og launch-gatene er åpne.

Neste steg før offentlig kameraopptak:

- implementere/teste selve browser-sanitizeren på iOS Safari og Android Chrome,
- visuell kameraflyt med «Ta bilde» / «Velg fil»,
- bilde-preview og mulighet til å ta bildet på nytt,
- kvalitetssignal for uskarpt/lavoppløselig bilde uten å late som OCR-resultatet er kjent,
- live syntetisk Storage-E2E,
- Auth-E2E,
- sluttført DPIA/provider-gjennomgang før ekte kundedata.
