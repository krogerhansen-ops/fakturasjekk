# Fakturasjekk – Vipps ePayment

Dato: 19.08.2026
Status: Providerkode og sikker betalingsflyt er bygget. Ikke live før Fakturasjekk har eget Vipps-salgssted/API-nøkler, webhook-registrering, testbetaling og juridisk selgeridentitet.

## Produktbeslutning

V1 bruker Vipps ePayment som foretrukket betalingsprovider for 29 kr-produktet.

Fakturasjekk skal aldri åpne full analyse eller innsigelsesutkast fordi kunden bare har autorisert/reservert beløpet. Tilgang gis først når en serververifisert Vipps-hendelse viser at hele 29 kr er **CAPTURED**.

Flyt:

1. Fakturasjekk oppretter betaling på nøyaktig 2900 øre/NOK med `WEB_REDIRECT` + `WALLET`.
2. Vipps returnerer `redirectUrl` som åpnes uendret av klienten.
3. `AUTHORIZED` webhook autentiseres med rå-body HMAC.
4. Fakturasjekk ber server-side om full capture på 2900 øre med deterministisk idempotency key.
5. Capture-respons må vise `aggregate.capturedAmount = 2900 NOK`.
6. `CAPTURED` webhook autentiseres.
7. Først da mappes hendelsen til intern status `paid` og fullresultatet kan låses opp.

## Webhook-sikkerhet

`server/vipps-epayment-provider.mjs` verifiserer:

- eksakt rå request-body med SHA-256 mot `x-ms-content-sha256`
- `Host`
- `x-ms-date`
- `Authorization`-signatur med HMAC-SHA256 og webhook-secret
- eksakt callback path/query som er konfigurert for produksjon
- forventet Merchant Serial Number (MSN)
- Fakturasjekk-reference med `fsk-`-prefix
- kjent eventnavn
- nødvendig `pspReference`

Uverifisert webhook avvises før case/data endres.

Gyldige, men ikke-betalbare hendelser (`CREATED`, `CANCELLED`, `REFUNDED`, `ABORTED`, `EXPIRED`, `TERMINATED`) kvitteres som mottatt og gir aldri tilgang. Dette forhindrer unødvendige provider-retries på permanente, korrekt behandlede hendelser.

## Retry og idempotens

Vipps kan sende samme webhook på nytt. Fakturasjekk har atomisk event-claim for konfliktkontroll, men en autentisk duplikat for samme sak kan kjøre den idempotente sideeffekten på nytt. Dette er bevisst:

- create payment bruker deterministisk `Idempotency-Key`
- capture bruker deterministisk `Idempotency-Key`
- intern `confirmPayment` er idempotent på provider-reference

Dermed kan en retry fullføre etter en midlertidig feil som skjedde etter at eventet først ble registrert.

Et autentisk event som kolliderer med samme provider-reference på en annen sak får ingen sideeffekt og kvitteres for å unngå retry-storm; konflikten skal logges som sikkerhetshendelse.

## Access token

Merchant keys brukes kun server-side. Token-klienten:

- kaller `/accesstoken/get`
- sender `client_id`, `client_secret`, subscription key og MSN til token-endepunktet
- cacher access token og gjenbruker det frem til kort før utløp
- sender bare Bearer-token + subscription key + MSN til ePayment-endepunktene
- eksponerer aldri client secret, subscription key eller webhook secret i browseren

## Polling fallback

Vipps anbefaler at webhooks ikke er eneste sannhetskilde. Før live skal Fakturasjekk også ha kontrollert polling mot `GET /epayment/v1/payments/{reference}` for å kunne avklare status dersom webhook er forsinket eller mangler.

Providerkoden har `getPayment`/gateway `pollPayment` klar, men live polling-reconciliation er egen launch-gate og skal testes med Vipps testmiljø før betaling aktiveres.

## Personvern

Fakturasjekk sender minst mulig til betaling:

- betalingsbeløp
- valuta
- teknisk Fakturasjekk-betalingsreferanse
- kort betalingsbeskrivelse
- return URL

V1 ber ikke om Vipps-profilfelter, adresse, fødselsdato eller andre ekstra kundedata gjennom ePayment.

Før live skal Vipps sin rolle, avtalevilkår, personvern, eventuelle underleverandører og dataflyt dokumenteres i Fakturasjekks provider-/DPIA-register.

## Live-gater

Følgende gjenstår før ekte betaling:

- juridisk selger/behandlingsansvarlig fastsatt
- eget Vipps-salgssted for Fakturasjekk
- ePayment aktivert
- test/prod MSN
- `client_id`
- `client_secret`
- subscription key
- webhook registrert for minst AUTHORIZED og CAPTURED, samt relevante terminalevents
- webhook-secret lagret server-side
- endelig callback host/path fastsatt og HMAC-testet
- faktisk 29 kr testflyt: create → authorize → capture → CAPTURED → unlock
- polling fallback/reconciliation testet
- checkout/angrerett/kvitteringsflyt ferdigstilt
- personvern-/providerreview godkjent

## Offisielle kilder

- Standard authentication: https://developer.vippsmobilepay.com/docs/APIs/access-token-api/standard-authentication/
- Create payment: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/
- Capture: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/capture/
- Get payment: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/get_info/
- Webhooks: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/webhooks/
- Webhook events: https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/events/
- Webhook authentication: https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/request-authentication/
