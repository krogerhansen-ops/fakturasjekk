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

`site/app/camera-sanitizer.mjs` implementerer den lokale standardveien uten tredjepartsbibliotek: bildet dekodes til piksler, eventuelt skaleres ned og re-encodes som JPEG. Re-encodingen kopierer ikke original EXIF/GPS-metadata. Hvis nettleseren mangler nødvendige sikre bildeprimitiver, feiler funksjonen lukket i stedet for å sende originalfilen.

Dette gjør det mulig å ta imot for eksempel HEIC fra en iPhone lokalt og laste opp en metadata-strippet JPEG dersom nettleseren kan dekode HEIC-bildet.

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

## Kvalitet uten gjetting

`site/app/camera-quality.mjs` analyserer en liten lokal pikselprøve før upload. Den kan varsle om:

- mulig for mørkt bilde,
- mulig overeksponering/gjenskinn,
- lav kontrast,
- mulig uskarphet,
- behov for å vurdere å ta bildet på nytt.

Kontrollen gjøres lokalt i nettleseren og sender ikke bildeprøven til en ekstern tjeneste. Den bruker enkle lys-, kontrast- og kantdetaljsignaler. Resultatet er bevisst formulert som en indikator, ikke en fasit.

Den skal aldri hevde at OCR vil lykkes eller feile, og den avgjør ikke om dokumentet er juridisk tilstrekkelig. Selve dokumentlesingen må fortsatt skje i den kontrollerte extractor-flyten. Kvalitetssignalet er derfor en UX-advarsel, ikke en ny regelmotor eller en erstatning for serververifisering.

## Ikke aktivert offentlig ennå

Modulene forbereder mobilflyten, men offentlig beta skal fortsatt ikke motta ekte kundedokumenter mens `FAKTURASJEKK_COST_MODE=zero` og launch-gatene er åpne.

Neste steg før offentlig kameraopptak:

- enhetstester for browser-sanitizer og lokal bildekvalitetskontroll er bygget; praktisk kompatibilitet må fortsatt verifiseres på iOS Safari og Android Chrome,
- visuell kameraflyt med «Ta bilde» / «Velg fil»,
- bilde-preview og mulighet til å ta bildet på nytt,
- live syntetisk Storage-E2E,
- Auth-E2E,
- sluttført DPIA/provider-gjennomgang før ekte kundedata.
