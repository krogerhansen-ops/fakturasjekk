# Fakturasjekk – fagregisterkontroller

Dato: 19.08.2026

## Mål

Fagregistre skal kunne gi kunden ekstra trygghet uten å kreve mer arbeid. Eksempler er Elvirksomhetsregisteret for elektrikerarbeid og Verkstedregisteret for bilverksted.

Fagregisterkontroll skal aldri bli en skjult scraping-/gjettemotor.

## Aktiveringskrav

Et fagregister kan først gi et sikkert ja/nei-resultat når alle disse kravene er oppfylt:

1. registereieren er en verifisert offentlig myndighet
2. en stabil, offisiell maskinlesbar kilde er verifisert
3. oppslaget kan knyttes entydig til virksomheten
4. kilden har kontrolltidspunkt
5. dataene er innenfor fastsatt maksimal alder
6. resultatstrukturen er allowlistet og testet
7. utilgjengelig, tvetydig eller gammel kilde blir «ikke kontrollert» – ikke et negativt funn

## DSB – Elvirksomhetsregisteret

Autoritativ kilde: Direktoratet for samfunnssikkerhet og beredskap.

DSBs publiserte register opplyser at virksomheter som tilbyr og utfører elektrisk arbeid uten å være registrert i registeret, driver ulovlig. Registeret tilbyr også full Excel-eksport.

Status i Fakturasjekk: `prepared_not_live`.

Begrunnelse: den offentlige tjenesten er verifisert, men Fakturasjekk har ikke verifisert en stabil og dokumentert maskinkilde/API eller eksport-URL som er egnet til produksjonsautomatisering. Vi bygger derfor ikke skjult webskraping.

## Statens vegvesen – Verkstedregisteret

Autoritativ kilde: Statens vegvesen.

Den offentlige tjenesten opplyser at reparasjoner på kjøretøy og EU-kontroll som hovedregel bare kan utføres av godkjente verksteder/kontrollorgan, og at registeroversikten oppdateres én gang i døgnet. Statens vegvesens dataportal beskriver også et åpent NLOD-datasett/CSV.

Status i Fakturasjekk: `prepared_not_live`.

Begrunnelse: en eldre direkte CSV-URL som fortsatt finnes i offentlige metadata returnerer ikke lenger gyldig fil. Den nåværende tjenesten tilbyr CSV, men produksjonsendepunktet må verifiseres før automatisk oppslag åpnes. Fakturasjekk skal ikke gjette et nytt endepunkt eller bygge på et uoffisielt mellomledd.

## Kundeatferd

Før aktivering:

> Fagregisteret er ikke kontrollert automatisk i denne analysen.

Etter fremtidig verifisert aktivering:

> Virksomheten er funnet i DSBs Elvirksomhetsregister.

eller:

> Virksomheten er funnet i Statens vegvesens Verkstedregister.

Et manglende treff skal ikke alene presenteres som «ikke godkjent» før kildens kompletthet, ferskhet og matchlogikk er dokumentert for den aktuelle kontrollen.

## Arkitektur

`engine/specialist-registry.mjs` håndhever:

- aktiv kilde før bruk
- forventet registereier
- HTTPS-kilde
- kontrolltidspunkt
- maksimal alder
- entydig struktur
- fail-closed ved `not_found`, `ambiguous`, `unavailable`, `stale` og kildeavvik

`config/specialist-registers.json` holder DSB og Vegvesen eksplisitt stengt til maskinkilden er verifisert.
