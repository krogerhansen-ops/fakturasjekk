# Fakturasjekk – virksomhetskontroll

Dato: 19.08.2026

## Formål

Virksomhetskontrollen skal gi kunden enkel, faktabasert kontroll av fakturautsteder uten å lage en «seriøsitetsscore» eller trekke slutninger som offentlige registre ikke støtter.

Felles grunnkilde i V1 er Enhetsregisterets åpne API hos Brønnøysundregistrene.

## Oppslagsrekkefølge

1. Hvis fakturaen inneholder et gyldig norsk organisasjonsnummer, gjøres eksakt oppslag på organisasjonsnummer.
2. Hvis organisasjonsnummer mangler, men firmanavn finnes, kan navnesøk brukes.
3. Navnesøk godtas bare dersom nøyaktig normalisert navn gir ett entydig treff.
4. Flere eller uklare treff blir «kan ikke bekreftes sikkert». Fakturasjekk velger aldri virksomhet ved fuzzy matching/gjetting.

## Registeropplysninger som kan brukes

Den normaliserte responsen er allowlistet til blant annet:

- juridisk navn
- organisasjonsnummer
- organisasjonsform
- registrert i Merverdiavgiftsregisteret
- registrert i Foretaksregisteret
- konkursstatus
- avvikling/tvangsavvikling eller tvangsoppløsning
- slettedato når oppgitt
- registreringsdato
- primær næringskode
- forretningsadresse

Rå respons fra Enhetsregisteret skal ikke sendes direkte til kunde-API eller lagres som en ukontrollert payload.

## Kildeklassifisering

Registeropplysninger er en egen bevisklasse: `registry`.

De er ikke det samme som dokumenterte opplysninger fra fakturaen. En sammenligning mellom faktura og register, for eksempel navn eller MVA-status, er `calculated`/deterministisk sammenligning.

Dette følger produktmodellen:

- dokumentert faktum
- offentlig registerfaktum
- brukeropplysning
- beregnet resultat

## MVA

En eksplisitt MVA-markør på fakturaen kan sammenlignes med registerstatusen. Dersom fakturaen sier/markerer MVA og enheten ikke er registrert i Merverdiavgiftsregisteret, kan dette flagges som et dokument-/registeravvik.

Fravær av MVA-markør skal ikke automatisk konverteres til en juridisk konklusjon av språkmodellen. En eventuell kontroll av at markør mangler må baseres på en deterministisk, komplett dokumentkontroll.

## Navn

Navnesammenligning bruker kun normalisering av store/små bokstaver, tegnsetting, bindestrek og mellomrom. Vi fjerner ikke selskapsform og bruker ikke semantisk/fuzzy matching for å erklære navn som like.

Et navn som avviker fra registrert juridisk navn presenteres som et kontrollpunkt. Det kan for eksempel skyldes merkenavn/avdelingsnavn og er ikke i seg selv bevis på feil eller uredelighet.

## HTTP-status og sikkerhet

- `200`: normaliser kontrollert respons.
- `404`: virksomheten ble ikke funnet på det entydige oppslaget.
- `410`: enheten er fjernet fra offentlig avgivelse av juridiske årsaker. Resultatet skal ikke brukes i analysen, og eventuell cache/kopi skal slettes.
- andre 4xx/5xx, timeout eller nettverksfeil: registeret er utilgjengelig/ukjent. Dette skal ikke presenteres som at virksomheten ikke finnes.

Klienten bruker:

- eksplisitt v2 Accept-header
- `cache: no-store`
- `redirect: error`
- kort timeout
- ingen autentiseringshemmeligheter

## Kundespråk

Bra:

> Organisasjonsnummeret er funnet i Enhetsregisteret og samsvarer med fakturaen.

> Firmanavnet på fakturaen avviker fra det juridiske navnet i registeret. Dette kan blant annet skyldes merkenavn eller avdelingsnavn, og bør kontrolleres.

Ikke bra:

> Firmaet virker useriøst.

> Firmaet er svindel.

> Firmaet er trygt.

Registerkontrollen skal aldri presenteres som mer omfattende enn den faktisk er.

## Videre fagregistre

Brønnøysund er grunnkontrollen. Bransjespesifikke, autoritative registre kan legges oppå senere, for eksempel:

- DSBs register for elektriske virksomheter
- Statens vegvesens register over godkjente kjøretøyverksteder

Disse skal være separate kontroller og skal ikke blandes inn før teknisk tilgang, datagrunnlag og tolkningsgrenser er verifisert.
