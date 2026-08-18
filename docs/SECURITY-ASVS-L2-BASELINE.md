# Fakturasjekk – web- og API-sikkerhetsbaseline

Dato: 18.08.2026
Mål: OWASP ASVS Level 2-inspirert baseline for produksjon med fortrolige dokumenter.
Status: Tekniske kontrollkrav. Provider-/infrastrukturavhengige punkter verifiseres før live.

## 1. Transport og browser-headere

Produksjons-API skal sende:

- HTTPS-only
- HSTS i produksjon
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` som deaktiverer unødvendige browser-API-er
- `Content-Security-Policy` passende for JSON/API-responser
- `frame-ancestors 'none'` / anti-clickjacking
- `Cache-Control: no-store` for sensitivt API-innhold
- same-origin cross-origin policy der dette ikke bryter legitim integrasjon

Produksjonsfrontend skal ha håndhevet CSP. Launch-RC på statisk GitHub Pages er ikke produksjonsapplikasjonen og er ikke bevis for produksjons-CSP.

## 2. Auth og autorisasjon

- JWT skal verifiseres kryptografisk hos auth-provider/verifier.
- `iss`, `aud`, `exp` og relevante tidskrav skal valideres.
- Ingen dev-token i production.
- Autorisasjon skjer server-side per sak.
- Bruker A skal aldri kunne lese, endre, betale for, eksportere eller slette bruker B sin sak ved å endre ID i URL/body.
- Produksjon skal ha eksplisitt IDOR/ownership-test.

## 3. Filopplasting

- allowlist: bare forretningsmessig nødvendige filtyper
- filnavn fra bruker brukes ikke som storage-key
- tilfeldig intern ID/UUID
- størrelses- og antallsgrense
- MIME fra browser er ikke tillitsgrunnlag
- magic-byte/signaturkontroll
- malware-/sandboxkontroll før extraction
- privat storage utenfor webroot og uten public-read
- signed upload skal være kortlivet og begrenset til riktig objekt
- extraction nektes før server har bekreftet opplastingen
- nedlasting av originalfil, hvis senere støttet, må være autorisert og bruke sikre download-headere

## 4. Input og KI-grense

- JSON body-size begrenses
- fritekstlengder begrenses
- dokumenttekst og leverandørsvar behandles som ubetrodd data
- KI-provider får ikke verktøy, nettlesing eller myndighet til å generere rettsregler
- extractor kan bare returnere allowlistede felt
- ukjente felt/typefeil/lav confidence skal fail-closed
- kritiske felt krever kildeplassering

## 5. Betaling

- browser kan starte checkout, men aldri attestere at betaling er godkjent
- fullresultat åpnes bare etter signaturverifisert server-webhook
- nøyaktig 29 NOK og riktig sak skal verifiseres
- replay/idempotens og cross-case binding skal håndheves

## 6. Rate limiting og misbruk

- distribuert rate-limit i production
- strengere grenser på mutasjoner, analyse, betaling og supplier-response enn lesing
- body-size- og filstørrelsesgrenser
- mistenkelig sekvens/flow-bypass bør auditeres dataminimert

## 7. Logging

Aldri logg direkte:

- dokumenttekst/OCR-råtekst
- innsigelsesbrev eller leverandørsvar
- passord
- access-/refresh tokens
- session cookies
- database-URL
- krypteringsnøkler eller secrets
- betalingskort/bankdata
- private storage keys
- særlige kategorier eller andre sensitive personopplysninger

Audit skal være allowlist-basert og inneholde bare nødvendig operasjonell metadata.

## 8. Secrets og deploy

- secrets kun i produksjonsplattformens secret store
- ingen `.env`/tokens/private keys i Git
- secret scanning/repository hygiene i CI
- minst mulige GitHub Actions permissions
- dependency-/runtime-oppdateringer overvåkes
- production og demo holdes logisk separert

## 9. Data at rest

- storage/database-kryptering fra provider
- tilgang etter least privilege
- produksjonsnøkler ikke tilgjengelig fra frontend
- backup kryptert og tidsbegrenset
- service-kontoer separert der provider støtter det

## 10. Security release gate

Før production upload åpnes:

- alle automatiske security tests grønt
- manuell IDOR-test
- test av ugyldig/utløpt JWT
- test av CORS/origin
- test av body/file limits
- test av MIME/magic bytes/malware-failure
- test av webhook replay/signatur
- test av delete + backup restore
- kontroll av offentlige Pages-artifakter: ingen server/admin/secrets
- ekstern avhengighet/headers-scan mot produksjonsdomene

## Kilder

- OWASP ASVS mapping: https://cheatsheetseries.owasp.org/IndexASVS.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP CSP Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- OWASP HSTS Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
