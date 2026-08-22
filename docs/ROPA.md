# Fakturasjekk – protokoll over behandlingsaktiviteter (ROPA)

Dato: 22.08.2026
Status: Produktprotokoll. Juridisk behandlingsansvarlig og endelig leverandør-/overføringsgodkjenning fylles inn før live.

## Behandlingsansvarlig

- Navn: [MÅ FYLLES INN FØR LIVE]
- Organisasjonsnummer: [MÅ FYLLES INN FØR LIVE]
- Kontakt: [MÅ FYLLES INN FØR LIVE]
- Personvernkontakt: [MÅ FYLLES INN FØR LIVE]

## Aktiviteter

| Aktivitet | Formål | Registrerte | Datakategorier | Grunnlag | Mottakere/databehandlere | Tredjeland | Retention |
|---|---|---|---|---|---|---|---|
| Konto og saksopprettelse | Levere bestilt tjeneste og sikre eierskap | Kunde | konto-ID, e-post/identifikator, saks-ID | art. 6(1)(b) | Supabase Auth/database valgt teknisk; juridisk providerreview gjenstår | må vurderes mot support-/underleverandørkjede | konto etter gjeldende policy; sak etter valgt modus |
| Dokumentopplasting | Motta faktura/avtale for kontroll | Kunde + eventuelle tredjepersoner | dokumentfil, metadata | kunde: 6(1)(b); tredjeperson: 6(1)(f) etter LIA | privat Supabase Storage valgt teknisk | må vurderes mot provider-/supportkjede | kildedokument normalt 24 t etter fullført analyse |
| Dokumentuttrekk | Strukturere nødvendige faktiske felt | Kunde + eventuelle tredjepersoner | allowlistede felt, confidence, kilde/sidenummer | som over | Google Vision/Vertex AI valgt som kodeklar kandidat | support/underleverandørtilgang må vurderes selv ved EU-endepunkt | sammen med saksinnhold; purge etter policy |
| Analyse | Sammenligne dokumenter og beregne avvik | Kunde | beløp, linjer, avtale-/fakturafakta, beregninger | 6(1)(b) | applikasjon/database | normalt ingen ny mottaker | midlertidig 7 d / lagret sak 90 d |
| Regelkontroll og utkast | Levere juridisk relevant produktfunksjon | Kunde | funn, regelreferanser, utkast | 6(1)(b) | applikasjon/database | normalt ingen ny mottaker | som sak |
| Svarrunde 2 | Tolke leverandørsvar i lagret sak | Kunde + leverandørkontakt | svartekst, status per funn | 6(1)(b); tredjeperson 6(1)(f) ved behov | Google Vertex AI valgt som kodeklar kandidat | provider-/supporttilgang må vurderes | lagret sak 90 d etter siste aktivitet |
| Betaling | Kreve og dokumentere 29 kr betaling | Kunde | beløp, betalingsreferanse, status, kvitteringsdata | 6(1)(b) + separate bokføringsplikter der de gjelder | Vipps MobilePay valgt betalingskandidat; regnskapsmottaker avklares | kartlegges | etter separat regnskapsplikt; holdes adskilt fra kundedokumenter |
| Ordrebekreftelse og betalingskvittering | Dokumentere kjøpet og gi kunden avtale-/betalingsbekreftelse på varig medium | Kunde | verifisert e-postadresse, 29 kr kjøpsdata, betalingsreferanse, avtale-/samtykkeversjoner, tidspunkt, provider message-id og leveringsstatus | 6(1)(b); eventuell separat dokumentasjons-/regnskapsplikt vurderes per datatype | Brevo transactional email er valgt kodeklar kandidat; DPA/providerreview gjenstår | Brevo oppgir EU databasehosting, men support-/underleverandørtilgang og eventuell videreoverføring må vurderes | Fakturasjekk-sak etter policy; provider-logg-/blocklist-retention skal godkjennes før live |
| Sikkerhets- og auditlogg | Misbruksvern, feilsøking, hendelseshåndtering | Kunde/bruker | pseudonyme IDs, action/outcome, minimal metadata | 6(1)(f), dokumentert interesseavveiing | drift/loggsystem | avhenger av provider | produktmål maks 90 d med mindre hendelse krever dokumentert avvikshåndtering |
| Brukerstyrt sletting/retention | Oppfylle lagringsbegrensning og rettigheter | Kunde + eventuelle tredjepersoner | saks-/objekt-ID og slettestatus | 6(1)(c)/(f) og GDPR-rettighetsoppfyllelse etter kontekst | database/storage | avhenger av provider | sletteloggen dataminimeres |
| Kundesupport/personvernforespørsel | Besvare feil, innsyn, sletting mv. | Kunde | kontaktdata, saks-ID, forespørsel | 6(1)(b)/(c)/(f) etter type | supportsystem | avhenger av provider | egen support-retention fastsettes før live |

## Kvitteringslevering – dataminimering

Brevo-grensen er smalere enn den ordinære saken. E-postleverandøren skal ikke få faktura, tilbud, OCR-tekst, regelanalyse, funn eller innsigelsesutkast. Leveransen består bare av det som må stå i ordrebekreftelsen/betalingskvitteringen og den serververifiserte mottakeradressen.

Tekniske grenser:

- mottakeradresse hentes fra bekreftet Supabase Auth-konto; den tas ikke fra et browserfelt
- ordinær autorisasjon mottar fortsatt bare brukerens UUID
- provider-aksept og faktisk `delivered` lagres som separate tilstander
- bare autentisert provider-webhook kan markere varig medium som levert
- message-id brukes til idempotens/korrelasjon og skal ikke eksponeres i offentlig API
- `contactPixelTrackingConsent:false` brukes. Brevo oppgir at dette anonymiserer open-pixel-hendelser; nødvendig teknisk leveringslogging hos provider består fortsatt og må inngå i retention/providerreview

## Særlige kategorier

Normal V1 skal ikke innhente særlige kategorier. Hvis slikt innhold oppdages, stopper automatisert analyse og egen Artikkel 9-policy gjelder. Ingen generell Artikkel 9-hjemmel antas. Slike opplysninger skal heller ikke inkluderes i ordrebekreftelsen til e-postprovider.

## Sikkerhetstiltak – oversikt

- TLS/HSTS i produksjon
- JWT med issuer/audience/expiry-validering
- server-side eierskap/IDOR-kontroll
- privat object storage + signert upload
- filtype/MIME/magic-byte/malware-kontroll
- felt-allowlist og source/confidence på extraction
- fail-closed rettskilder
- rate limiting og idempotens
- audit allowlist uten dokumentinnhold/secrets
- retention/purge og brukerstyrt sletting
- ingen ikke-nødvendig personalisert tracking i V1
- verifisert kvitteringsmottaker og autentisert leveringswebhook
- provider-aksept kan aldri alene markeres som varig-medium-levering

## Revisjon

ROPA oppdateres ved ny datakategori, ny provider, ny region/tredjeland, endret retention, ny målgruppe eller vesentlig endring i produktfunksjon.

Kilder:
- Datatilsynet – protokoll over behandlingsaktiviteter: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/protokoll-over-behandlingsaktiviteter/
- Brevo – data storage location: https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location
- Brevo – DPA: https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA
