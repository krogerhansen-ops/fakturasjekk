# Fakturasjekk – no-tracking policy og hendelseshåndtering

Dato: 18.08.2026
Status: V1-policy og beredskapsprosedyre.

## Del A – no-tracking default

V1 skal lanseres uten ikke-nødvendig tracking.

### Forbudt uten ny personvern-/cookie-beslutning

- Google Analytics / Google Tag Manager
- Meta/Facebook Pixel
- Hotjar
- Mixpanel
- Segment
- andre adtech-, heatmap-, session-replay- eller markedsføringssporere

Ingen dokument-, analyse- eller tvistedata skal brukes til annonsering eller adferdsprofilering.

Hvis ikke-nødvendige cookies eller tilsvarende sporing senere innføres, skal de ikke lastes før gyldig forhåndssamtykke er innhentet der loven krever det. Avvisning skal være reelt tilgjengelig og samtykke skal kunne trekkes tilbake.

Strengt nødvendige autentiserings-/sikkerhetsmekanismer skal dokumenteres separat og ikke gjenbrukes til markedsføring.

### CI-regel

Offentlig frontend skal scannes for kjente tracking-domener/-biblioteker. Ny tracker skal stoppe CI inntil produktet eksplisitt har oppdatert personvern-/cookie-løsning.

## Del B – sikkerhets- og personvernhendelser

### Roller

Før live må følgende fylles inn:

- Hendelsesansvarlig: [MÅ FYLLES INN]
- Stedfortreder: [MÅ FYLLES INN]
- Personvernkontakt: [MÅ FYLLES INN]
- Teknisk kontakt/provider escalation: [MÅ FYLLES INN]
- Kundekommunikasjon: [MÅ FYLLES INN]

### Første 60 minutter

1. Stans eller isoler berørt behandling uten å ødelegge nødvendig bevis.
2. Tilbakekall/roter kompromitterte tokens/nøkler når relevant.
3. Sperr berørte kontoer/endepunkter ved behov.
4. Opprett hendelses-ID og start dataminimert tidslinje.
5. Kontakt relevante databehandlere straks hvis hendelsen kan ligge hos dem.
6. Ikke kopier fakturadokumenter inn i Slack/e-post/tickets unødvendig.

### Kartlegging

Dokumenter:

- tidspunkt kjent/oppdaget
- hvilke systemer og providere som er berørt
- konfidensialitet/integritet/tilgjengelighet
- hvilke kategorier personopplysninger som kan være berørt
- antall/typer registrerte
- varighet og om data kan være eksfiltrert
- eksisterende kryptering/tilgangskontroll
- sannsynlige konsekvenser for registrerte

### GDPR-vurdering

Ved brudd på personopplysningssikkerheten skal risiko for registrertes rettigheter og friheter vurderes straks.

- Meld til Datatilsynet innen 72 timer når meldeplikt gjelder.
- Hvis full informasjon ikke er tilgjengelig innen fristen, kan første melding følges opp trinnvis.
- Ved høy risiko vurderes/utføres varsling til berørte uten ugrunnet opphold etter gjeldende regler.
- Hvis hendelsen ikke meldes, skal begrunnelsen dokumenteres internt.

### Etter hendelsen

- rotårsaksanalyse
- kontroll av logging, auth, storage, provider og dataflyt
- oppdater DPIA/ROPA hvis risiko/behandling er endret
- skriv regresjonstest for teknisk årsak der mulig
- ikke gjenåpne berørt funksjon før tiltak er verifisert
- vurder om rettskilder/resultater må re-kjøres hvis integriteten kan være påvirket

## Del C – logging-policy

Sikkerhetslogger skal kunne oppdage misbruk uten å bli en kopi av kundedata.

Tillatt som hovedregel:

- hendelses-/request-ID
- pseudonym/teknisk actor-ID
- saks-ID når nødvendig
- action/outcome/statuskode
- motor-/regelversjon
- antall dokumenter/funn
- varighet
- retention-/slettestatus

Ikke tillatt:

- dokumenttekst/OCR-råtekst
- brukerens fritekst
- leverandørsvar
- generert innsigelsesbrev
- access-/refresh token eller cookie
- passord/secrets/database-URL
- private storage keys
- helse-/andre særlige kategorier
- full betalingskort-/bankinformasjon

## Kilder

- Datatilsynet – cookies/sporing: https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/bruk-av-informasjonskapsler-og-andre-sporingsteknologier/
- Datatilsynet – brudd på personopplysningssikkerheten: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/avvik/hva-er-et-brudd-pa-personopplysningssikkerheten/
- Datatilsynet – digitale angrep / 72 timer: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/avvik/digitale-angrep/hva-gjor-dere/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
