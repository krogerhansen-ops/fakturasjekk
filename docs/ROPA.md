# Fakturasjekk – protokoll over behandlingsaktiviteter (ROPA)

Dato: 18.08.2026
Status: Produktprotokoll. Juridisk behandlingsansvarlig og faktiske leverandører fylles inn før live.

## Behandlingsansvarlig

- Navn: [MÅ FYLLES INN FØR LIVE]
- Organisasjonsnummer: [MÅ FYLLES INN FØR LIVE]
- Kontakt: [MÅ FYLLES INN FØR LIVE]
- Personvernkontakt: [MÅ FYLLES INN FØR LIVE]

## Aktiviteter

| Aktivitet | Formål | Registrerte | Datakategorier | Grunnlag | Mottakere/databehandlere | Tredjeland | Retention |
|---|---|---|---|---|---|---|---|
| Konto og saksopprettelse | Levere bestilt tjeneste og sikre eierskap | Kunde | konto-ID, e-post/identifikator, saks-ID | art. 6(1)(b) | auth/database | avhenger av provider | konto etter gjeldende policy; sak etter valgt modus |
| Dokumentopplasting | Motta faktura/avtale for kontroll | Kunde + eventuelle tredjepersoner | dokumentfil, metadata | kunde: 6(1)(b); tredjeperson: 6(1)(f) etter LIA | private storage | avhenger av provider | kildedokument normalt 24 t etter fullført analyse |
| Dokumentuttrekk | Strukturere nødvendige faktiske felt | Kunde + eventuelle tredjepersoner | allowlistede felt, confidence, kilde/sidenummer | som over | OCR/KI-provider | avhenger av provider | sammen med saksinnhold; purge etter policy |
| Analyse | Sammenligne dokumenter og beregne avvik | Kunde | beløp, linjer, avtale-/fakturafakta, beregninger | 6(1)(b) | applikasjon/database | normalt ingen ny mottaker | midlertidig 7 d / lagret sak 90 d |
| Regelkontroll og utkast | Levere juridisk relevant produktfunksjon | Kunde | funn, regelreferanser, utkast | 6(1)(b) | applikasjon/database | normalt ingen ny mottaker | som sak |
| Svarrunde 2 | Tolke leverandørsvar i lagret sak | Kunde + leverandørkontakt | svartekst, status per funn | 6(1)(b); tredjeperson 6(1)(f) ved behov | response-interpreter/provider | avhenger av provider | lagret sak 90 d etter siste aktivitet |
| Betaling | Kreve og dokumentere 29 kr betaling | Kunde | beløp, betalingsreferanse, status, kvitteringsdata | 6(1)(b) + separate bokføringsplikter der de gjelder | betalingsprovider/regnskap | avhenger av provider | etter separat regnskapsplikt; holdes adskilt fra kundedokumenter |
| Sikkerhets- og auditlogg | Misbruksvern, feilsøking, hendelseshåndtering | Kunde/bruker | pseudonyme IDs, action/outcome, minimal metadata | 6(1)(f), dokumentert interesseavveiing | drift/loggsystem | avhenger av provider | produktmål maks 90 d med mindre hendelse krever dokumentert avvikshåndtering |
| Brukerstyrt sletting/retention | Oppfylle lagringsbegrensning og rettigheter | Kunde + eventuelle tredjepersoner | saks-/objekt-ID og slettestatus | 6(1)(c)/(f) og GDPR-rettighetsoppfyllelse etter kontekst | database/storage | avhenger av provider | sletteloggen dataminimeres |
| Kundesupport/personvernforespørsel | Besvare feil, innsyn, sletting mv. | Kunde | kontaktdata, saks-ID, forespørsel | 6(1)(b)/(c)/(f) etter type | supportsystem | avhenger av provider | egen support-retention fastsettes før live |

## Særlige kategorier

Normal V1 skal ikke innhente særlige kategorier. Hvis slikt innhold oppdages, stopper automatisert analyse og egen Artikkel 9-policy gjelder. Ingen generell Artikkel 9-hjemmel antas.

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
- ingen ikke-nødvendig tracking i V1

## Revisjon

ROPA oppdateres ved ny datakategori, ny provider, ny region/tredjeland, endret retention, ny målgruppe eller vesentlig endring i produktfunksjon.

Kilde: Datatilsynet – protokoll over behandlingsaktiviteter: https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/protokoll-over-behandlingsaktiviteter/
