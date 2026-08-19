# Fakturasjekk – dokumentsikkerhet før OCR

Dato: 19.08.2026

## Sikkerhetsrekkefølge

Et objekt i privat Storage er ikke et godkjent dokument. Før OCR eller annen dokumenttolking kan starte skal følgende kjede være bestått:

`privat objekt → størrelsesgrense → byte-signatur → faktisk MIME → SHA-256 → malware-verdict → tillatt dokumenttype → OCR`

## Byte-signatur

Fakturasjekk gjenkjenner kun de fire V1-formatene fra selve filinnholdet:

- PDF (`%PDF-`)
- JPEG
- PNG
- WebP (`RIFF` + `WEBP`)

Filnavn, filendelse og browser-deklarert MIME er ikke nok til å godkjenne filtypen.

Dersom deklarert MIME og detektert MIME er forskjellige, beholdes dette som et sporbarhetsfunn. Den detekterte typen brukes videre dersom den er i allowlisten. Ukjent eller ikke tillatt signatur stoppes.

## Malware

Den lokale scannergrensen er ikke en antivirusmotor. Den krever en separat `malwareScanner` som eksplisitt returnerer et sikkert resultat.

Følgende er fail-closed:

- malware-motor mangler,
- providerfeil,
- timeout,
- uklart/ikke-clean verdict,
- `safe=true` uten identifisert scanner-engine.

Scannerintegrasjon med en faktisk leverandør velges først etter leverandør-/personvernvurdering. Ingen ekstern dokumentdeling aktiveres bare fordi denne kontrakten finnes.

## Dataminimering

Malware-integrasjonen får kun dokumentbytes og tekniske sikkerhetsdata som SHA-256 og detektert/deklarert MIME. Saks-ID, eier-ID, leverandørnavn, juridisk analyse og øvrig saksinnhold skal ikke sendes med i scannerkontrakten.

## Resultat

Et godkjent scannerresultat kan inneholde:

- `malware_safe=true`
- `magic_bytes_verified=true`
- detektert MIME
- SHA-256
- scanner-engine/-versjon

Rå dokumentbytes returneres aldri i scannerresultatet.

## Launch-status

Dette lukker ikke `TECH_PRIVATE_OBJECT_STORAGE`. Før launch kreves fortsatt syntetisk live E2E med faktisk malware-motor, private Storage, finalize, purge og restore-sikker sletting.
