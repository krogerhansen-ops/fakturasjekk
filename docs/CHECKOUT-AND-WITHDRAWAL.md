# Fakturasjekk – checkout, betalingsplikt og angrerett

Dato: 19.08.2026
Status: Kodeklar samtykkegrense. Live checkout er blokkert til selgeridentitet og varig bekreftelseskanal er ferdig.

## Klassifisering i V1

Fakturasjekk behandler 29 kr-produktet som en betalt tjeneste. Dette dokumentet bygger derfor checkout-flyten etter angrerettlovens regler for tjeneste som ønskes startet før utløpet av angrefristen.

Denne implementasjonen skal ikke brukes til å påstå at angreretten faller bort ved betaling, autorisasjon eller capture. For tjenestesporet knyttes bortfall til at tjenesten er **fullt levert**, forutsatt at nødvendige vilkår er oppfylt.

## Før bestilling

Checkout skal tydelig vise minst:

- hvem kunden inngår avtale med
- tjenesten: Full Fakturasjekk + utkast til innsigelse
- total pris: 29 kr
- at bestillingen medfører betalingsplikt
- relevante begrensninger/forutsetninger
- betalingsmåte
- informasjon om angrerett
- vilkår og personvern på en tilgjengelig måte

Selgeridentitet er foreløpig ikke fastsatt i `config/checkout-policy.json`. Derfor er `live_payment_session_enabled=false`.

## Betalingsknapp

V1-policy bruker:

**Bestill med betalingsplikt – 29 kr**

Dette er valgt for å gjøre betalingsforpliktelsen uttrykkelig i selve handlingen, ikke bare i hjelpetekst ved siden av.

## Tre uttrykkelige handlinger

Før payment session kan opprettes krever serveren at kunden uttrykkelig har registrert:

1. at bestillingen medfører betalingsplikt på 29 kr
2. at kunden ber Fakturasjekk starte tjenesten før angrefristen er utløpt
3. at kunden forstår at angreretten går tapt når Fakturasjekk har levert tjenesten fullt ut

Alle tre må være `true`; de kan ikke forhåndsavkrysses eller utledes av at kunden trykker betalingsknappen.

## Versjonsbinding

Klienten må sende eksakt versjon for:

- checkout-policy
- vilkår
- personvernerklæring
- angrerettinformasjon

Serveren avviser gammel eller ukjent versjon. Dette gjør at en åpen browserfane med gamle vilkår ikke kan fullføre kjøpet etter at vilkårene er endret.

## Serverbevis

`server/checkout-consent-service.mjs` lagrer et begrenset snapshot på saken før betalingsprovider kalles:

- consent-ID
- tidspunkt
- produkt/pris/valuta
- policy-/vilkårs-/personvern-/angrerettversjon
- de tre uttrykkelige samtykkene
- betalingsknappens serverstyrte label

Vi lagrer ikke IP-adresse eller user-agent bare for å skape mer bevisdata. Dette kan revurderes dersom det dokumenteres som nødvendig og proporsjonalt.

## Varig medium – fortsatt egen gate

Serveren genererer et `agreement_confirmation_payload`, men feltet har eksplisitt:

`durable_medium_delivered: false`

Payloadet er bare innholdet som senere skal leveres på et reelt varig medium. Det er ikke i seg selv juridisk oppfyllelse av leveringskravet.

Før live skal en kanal kobles til som kan gi kunden skriftlig avtale-/kjøpsbekreftelse på varig medium **før tjenesten begynner**. Endelig løsning velges etter kostnad/personvern, for eksempel transaksjons-e-post eller annen løsning som kunden kan lagre og hente uendret.

Når leveringen er bevist, skal saken registrere tidspunkt og leveringskanal uten å lagre mer meldingsinnhold enn nødvendig.

## Angreskjema

Kunden skal få nødvendig angrerettinformasjon og standardisert angreskjema der dette kreves. Fakturasjekk skal ikke gjemme dette i lange generelle vilkår.

## Vipps-sekvens

Checkout-samtykke og varig bekreftelse er juridiske produktkontroller uavhengig av Vipps.

Planlagt sekvens:

1. gyldig checkout-policy og selgeridentitet
2. tre uttrykkelige samtykker + korrekt versjon
3. server lagrer consent-snapshot
4. avtale-/kjøpsbekreftelse leveres på godkjent varig medium
5. Vipps payment session opprettes
6. AUTHORIZED fører til capture, ikke tilgang
7. CAPTURED verifiseres server-side
8. tjenesten gjennomføres og leveres
9. bortfall av angrerett skal bare vurderes etter full levering og de øvrige lovvilkårene

Den konkrete rekkefølgen mellom punkt 4 og betaling kan finjusteres ved endelig checkout-design, men tjenesten skal ikke starte før kravet til avtale-/kjøpsbekreftelse er ivaretatt.

## Gjenværende live-gater

- juridisk selgernavn
- organisasjonsnummer der relevant
- postadresse
- support-epost
- personvern-epost
- ferdige versjoner av vilkår/personvern/angrerettinfo
- standardisert angreskjema
- faktisk varig-medium leveringskanal
- E2E-bevis på utsendt/lagret avtale-/kjøpsbekreftelse
- Vipps testmiljø-E2E
- checkout UI med de tre separate samtykkene

## Primærkilder kontrollert 19.08.2026

- Angrerettloven § 16 – elektronisk bestilling og betalingsplikt: https://lovdata.no/lov/2014-06-20-27
- Angrerettloven § 18 – bekreftelse på inngått avtale på varig medium: https://lovdata.no/lov/2014-06-20-27
- Angrerettloven § 19 – uttrykkelig anmodning om oppstart før angrefrist og erkjennelse av bortfall ved full oppfyllelse: https://lovdata.no/lov/2014-06-20-27
- Angrerettloven § 22 første ledd bokstav c – fullt levert tjeneste: https://lovdata.no/lov/2014-06-20-27
- Angrerettloven § 26 – betalingsplikt ved bruk av angrerett etter påbegynt tjeneste: https://lovdata.no/lov/2014-06-20-27
