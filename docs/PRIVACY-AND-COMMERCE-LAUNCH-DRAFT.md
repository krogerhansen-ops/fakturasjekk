# Fakturasjekk – personvern- og kjøpsbeslutninger før produksjonslaunch

Dato: 22.08.2026

Dette dokumentet er en launch-beslutning og arbeidsmal. Punkter som avhenger av valgt leverandør eller juridisk virksomhetsidentitet må ferdigstilles før ekte persondata og betaling åpnes.

## 1. DPIA-beslutning

**Produktbeslutning: Fakturasjekk skal gjennomføre og godkjenne en DPIA før produksjonsopplasting med ekte kundedokumenter åpnes.**

Begrunnelse:

- tjenesten bruker ny teknologi til å strukturere og vurdere faktura-/avtaledata
- dokumentene kan beskrive økonomisk situasjon, tvist, kjøpshistorikk, adresse, kontaktdata og andre svært personlige forhold
- systemet evaluerer dokumentert grunnlag og gir en juridisk relevant anbefaling, selv om det ikke skal fatte en bindende automatisert avgjørelse
- flere av Datatilsynets høy-risiko-kriterier kan derfor være relevante

DPIA skal minst dokumentere:

1. planlagte behandlingsaktiviteter og formål
2. nødvendighet og proporsjonalitet
3. risiko for registrertes rettigheter og friheter
4. tekniske og organisatoriske tiltak som reduserer risiko
5. valgte databehandlere, lagringssteder og overføringer
6. residual risiko og launch-beslutning

DPIA kan startes før alle leverandørdetaljer er kjent, men må oppdateres og godkjennes med faktisk produksjonsstack før live behandling.

Kildegrunnlag: Datatilsynets veiledning om DPIA og artikkel 35.

## 2. Behandlingsgrunnlag – arbeidskart

Endelig kart må valideres mot faktisk virksomhet og dataflyt.

| Behandling | Formål | Foreløpig grunnlag | Merknad |
|---|---|---|---|
| Konto/saksopprettelse | Levere bestilt Fakturasjekk | Nødvendig for avtale | Minimer kontoopplysninger |
| Faktura, tilbud, avtale | Utføre analysen kunden bestiller | Nødvendig for avtale | Ikke samle mer enn nødvendig |
| Analyse/resultat/utkast | Levere tjenesten | Nødvendig for avtale | Internkoder holdes server-side |
| Betalingsmetadata | Betaling, avstemming, dokumentasjon | Avtale + eventuell rettslig plikt | Holdes separat fra dokumentinnhold |
| Ordrebekreftelse/betalingskvittering | Bekrefte kjøpet og gi nødvendig avtale-/betalingsinformasjon på varig medium | Nødvendig for avtale + eventuell separat rettslig dokumentasjonsplikt | Verifisert konto-e-post og kvitteringsdata; ikke faktura/OCR/funn/utkast |
| Sikkerhets-/auditdata | Misbruk, sikkerhet, feilsporing | Berettiget interesse må interesseavveies | Ingen dokumenttekst i audit |
| Lagret sak / Svarrunde 2 | Oppfølging brukeren uttrykkelig velger | Avtale/brukerens uttrykkelige valg | 90-dagers automatisk utløp i produktpolicy |
| Markedsføring | Eventuell fremtidig markedsføring | Samtykke der påkrevd | Ikke del av V1-kjøpet og ikke koblet til kvitteringslevering |

Fakturasjekk skal ikke kreve samtykke som vilkår for behandling som egentlig er nødvendig for å levere den kjøpte tjenesten. E-postadressen som brukes til ordrebekreftelsen er et leveringskontaktpunkt for den kjøpte tjenesten, ikke markedsføringssamtykke.

## 3. Dataminimering og lagring

Gjeldende produktpolicy:

- standardmodus: kildefiler slettes 24 timer etter fullført analyse
- midlertidig saksinnhold: 7 dager etter siste aktivitet
- lagret sak: eksplisitt valg, 90 dager etter siste aktivitet, fornyelse krever ny brukerhandling
- kildefiler, uttrukket personinnhold, utkast og leverandørsvar inngår i purge
- betalings-/regnskapsopplysninger som må beholdes etter separat plikt holdes adskilt fra saken
- e-postleverandøren skal bare motta verifisert mottakeradresse og ordrebekreftelses-/kvitteringsinnhold; opplastede dokumenter og analyseresultat sendes ikke dit
- providerens logg-, bounce-/blocklist- og leveringsretention må kartlegges og godkjennes før live

Retention må valideres i DPIA og mot faktisk produksjonsarkitektur før launch.

## 4. Særlige kategorier og utilsiktet sensitivt innhold

Fakturasjekk skal ikke be om helseopplysninger, fagforeningsopplysninger, biometriske data eller andre særlige kategorier som en del av normal fakturakontroll.

Fordi brukere kan laste opp dokumenter med utilsiktet sensitiv informasjon, skal produksjonen:

- advare brukeren mot å laste opp irrelevante sensitive opplysninger
- ikke trekke ut felt som ikke finnes i allowlisten
- minimere lagringstid
- ha prosedyre for sletting og håndtering dersom særlig sensitivt materiale likevel mottas
- aldri sende opplastet dokumentinnhold eller analyserte særkategoridata til kvitteringsleverandøren

## 5. Personvernerklæring – må inneholde før live

Den offentlige personvernerklæringen må fylles med:

- juridisk behandlingsansvarlig, organisasjonsnummer og kontaktinformasjon
- personvernkontakt
- hvilke opplysninger som behandles
- formål og behandlingsgrunnlag
- mottakere/databehandlere, inkludert Brevo dersom denne leverandøren godkjennes for kvittering
- eventuelle overføringer utenfor EØS og overføringsgrunnlag
- konkrete lagringstider, inkludert relevante providerlogger
- rettigheter og hvordan de utøves
- klagerett til Datatilsynet
- sikkerhets-/automatiseringsinformasjon som er nødvendig for reell åpenhet
- at kvitteringsadresse brukes til kjøps-/avtalekommunikasjon og ikke automatisk til markedsføring

Brevo er valgt som kodeklar kandidat for transaksjons-e-post. Brevo oppgir EU-basert databasehosting og tilgjengelig DPA, men Fakturasjekks vurdering av DPA, underleverandører, support-/fjernaksess og eventuell tredjelandstilgang er ikke ferdig. Brevo er derfor blokkert for ekte kundedata til denne vurderingen er godkjent.

## 6. Registrertes rettigheter – operativ flyt

Minimum produksjonsprosess:

1. Kunde sender forespørsel via oppgitt personvernkontakt.
2. Identitet/verifisering vurderes forholdsmessig; ikke be om mer ID enn nødvendig.
3. Forespørselen registreres uten å kopiere unødvendig dokumentinnhold inn i supportverktøy.
4. Sak identifiseres via brukerens konto/saks-ID.
5. Relevant innsyn, retting, sletting eller eksport utføres der regelverket gir rett til det.
6. Dersom data må beholdes etter separat rettslig plikt, forklares dette konkret.
7. Utførelse logges dataminimert.
8. Dersom forespørselen omfatter leveringsdata hos e-postprovider, håndteres dette etter godkjent provider-/retentionprosedyre uten å gjeninnføre slettet saksinnhold.

Produktet har allerede `delete_case` og deterministisk purge; produksjonstesten må kontrollere både database og object storage. Providerretention og eventuell blocklist er en separat leverandøravhengig kontroll som skal dokumenteres før live.

## 7. Sikkerhetshendelser – minimumsprosedyre

- stans eller isoler berørt behandling
- sikre tekniske logger uten å spre dokumentinnhold
- identifiser berørte datatyper, brukere, systemer og databehandlere
- vurder konsekvens/sannsynlighet for registrerte
- dokumenter hendelsen og tiltakene
- følg gjeldende varslings-/meldingsplikter til Datatilsynet og registrerte når tersklene er oppfylt
- roter kompromitterte nøkler/tokens og tilbakekall tilganger
- ved e-posthendelse: verifiser om feil mottaker, falsk webhook, provider-konto eller senderdomene er berørt, og stans videre kvitteringsutsending ved behov
- gjennomfør årsaksanalyse og regresjonstest før normal drift gjenopptas

Endelig plan må ha navngitt ansvarlig og kontaktkanal.

## 8. Checkout, angrerett og umiddelbar levering

Fakturasjekk er en nettbasert betalt tjeneste som normalt skal starte analysen umiddelbart etter betaling.

Kjøpsflyten skal derfor før betaling:

- vise totalpris **29 kr** tydelig
- vise hva som leveres: full fakturasjekk + innsigelsesutkast
- identifisere den næringsdrivende
- lenke til vilkår og personvern
- ha en betalingsknapp som klart uttrykker betalingsforpliktelsen
- innhente kundens uttrykkelige anmodning dersom tjenesten skal starte før utløpet av angrefristen
- la kunden erkjenne at angreretten går tapt når tjenesten er fullt levert, der lovens vilkår er oppfylt
- opplyse at ordrebekreftelse/betalingskvittering sendes til e-postadressen som er verifisert på den innloggede kontoen
- ikke ha et browserfelt som lar kunden eller en angriper overstyre kvitteringsadressen ved betaling
- gi skriftlig avtalebekreftelse på varig medium med nødvendige opplysninger og registrert samtykke/anmodning

Teknisk leveringsbeslutning:

- serveren henter bare en bekreftet e-postadresse fra brukerens egen gyldige Auth-session
- ordinær autorisasjon mottar fortsatt bare brukerens UUID; e-post er avgrenset til checkout-/leveringsbehovet
- ordrebekreftelsen inneholder kjøps-/betalings-/avtaleinformasjon, ikke kundens faktura, OCR-tekst, regelanalyse, funn eller innsigelsesutkast
- Brevo API-aksept betyr bare at leverandøren har akseptert meldingen; det er **ikke** dokumentasjon på at varig medium er levert
- bare en autentisert, matching `delivered`-webhook kan markere `durable_medium_delivered=true`
- stabil idempotens og lagret providerreferanse hindrer dobbeltsending etter provider-aksept
- kvitteringsleveringen brukes ikke til markedsføring i V1

Koden for denne grensen er implementert og regresjonstestet. Før launch gjenstår faktisk Vipps-E2E, Brevo sender-/domene-/webhook-oppsett, syntetisk send→`delivered`-E2E og juridisk provider-/DPA-/transfer-godkjenning.

## 9. Vilkår – innhold som må ferdigstilles

- selgeridentitet og kontakt
- tjenestebeskrivelse og støttet/ikke-støttet omfang
- 29 kr totalpris og betalingsmåte
- når tjenesten anses levert
- regler om umiddelbar oppstart og angrerett
- hvordan ordrebekreftelse/betalingskvittering leveres på varig medium
- feil/mangel ved Fakturasjekk-tjenesten og kundesupport
- tilgjengelighet og tekniske forutsetninger
- brukers ansvar for lovlig opplasting av dokumenter
- personvern og sletting
- tydelig avgrensning: kontrollverktøy, ikke advokatoppdrag eller garanti for tvisteresultat
- gjeldende lov/verneting formulert i samsvar med ufravikelige forbrukerregler

## Offisielle referanser

- Datatilsynet – DPIA: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/vurdering-av-personvernkonsekvenser/
- Datatilsynet – innebygd personvern: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/programvareutvikling-med-innebygd-personvern/
- Angrerettloven: https://lovdata.no/lov/2014-06-20-27
- Brevo – data storage location: https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location
- Brevo – DPA: https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA

Dokumentet må gjennomgås på nytt når faktisk behandlingsansvarlig, auth, database, storage, KI-leverandør, betalingsleverandør, kvitteringsleverandør og hosting er endelig godkjent.
