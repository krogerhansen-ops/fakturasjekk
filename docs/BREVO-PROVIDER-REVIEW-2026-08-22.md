# Fakturasjekk – Brevo provider review

Dato: 22.08.2026
Status: **IN PROGRESS / IKKE GODKJENT FOR EKTE KUNDEDATA**
Formål: transactional e-post for ordrebekreftelse og betalingskvittering etter verifisert 29 kr-betaling.

Dette dokumentet er en teknisk/personvernmessig leverandørgjennomgang, ikke juridisk godkjenning av Brevo og ikke dokumentasjon på at en databehandleravtale er inngått. Offentlige leverandøropplysninger kan endres. Den avtalen og underleverandørlisten som faktisk gjelder for Fakturasjekk-kontoen skal kontrolleres på nytt før live.

## 1. Fakturasjekk sin avgrensede bruk

Brevo skal bare brukes til transactional levering av ordrebekreftelse/betalingskvittering.

Brevo skal **ikke** motta:

- opplastet faktura, tilbud, avtale eller inkassodokument
- OCR-tekst
- regel-/paragrafanalyse
- funn eller bevisvurdering
- innsigelsesutkast
- leverandørens svar / Svarrunde 2
- storage keys eller signed URLs

Planlagt datamengde til Brevo:

- serververifisert mottaker-e-post fra kundens bekreftede Supabase Auth-konto
- selger- og produktinformasjon som skal stå i ordrebekreftelsen
- fast totalpris 29 kr
- betalingsstatus/tidspunkt og nødvendig betalingsreferanse
- versjoner/tidspunkt for vilkår, personvern- og angrerettinformasjon og registrerte checkout-bekreftelser
- intern korrelasjonsmetadata for case/owner/confirmation og provider message-id

Browseren kan ikke velge eller overstyre kvitteringsadressen.

## 2. Offentlig dokumentert leverandørrolle og DPA

Brevo beskriver seg som databehandler for kundene i sin GDPR-veiledning. Brevos hjelpeside opplyser at deres Data Processing Agreement finnes i Terms of Service under egen DPA-seksjon.

**Verifisert fra nåværende offentlige kilder:**

- Brevo publiserer en DPA som del av Terms of Service.
- Brevo beskriver egne processor-/GDPR-prosedyrer og at de bruker DPAs med egne databehandlere.

**Ikke verifisert/godkjent for Fakturasjekk ennå:**

- den fullstendige, kontoaktuelle DPA-teksten er ikke kontraktsmessig gjennomgått/akseptert på vegne av Fakturasjekks juridiske selger
- juridisk selskap/kontraktsmotpart for den konkrete Fakturasjekk-kontoen må bekreftes ved opprettelse
- artikkel 28-punktene må avkrysses mot den faktisk gjeldende DPA-en
- endringsvarsel for underleverandører må bekreftes
- rett til innsigelse / prosess ved ny underleverandør må bekreftes

Kilder:
- https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA
- https://www.brevo.com/legal/termsofuse/
- https://help.brevo.com/hc/en-us/articles/360001258744-How-does-Brevo-comply-with-the-GDPR

## 3. Behandlings-/lagringssteder

Brevo opplyser at databaseserverne som behandler og lagrer databaser ligger i EU:

- OVH som primær hosting i Frankrike og Tyskland
- Google Cloud i Belgia
- data kopieres minst tre ganger over minst to geografiske lokasjoner
- backup gjøres minst ukentlig i de beskrevne tilfellene og krypteres før skylagring

Dette er positivt for en EØS-first arkitektur, men **EU databasehosting er ikke alene en ferdig overføringsvurdering**. Support, konserntilgang, underleverandører og eventuell fjernaksess må vurderes separat.

Kilde:
- https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location

## 4. Tilgangskontroll og sikkerhet

Brevo opplyser blant annet:

- sentral rolle-/tilgangsstyring for produksjonsmiljø
- produksjonsingeniørers tilgang kontrolleres
- kortlivede individuelle public-key certificates for ingeniørtilgang
- utstedelse av slike sertifikater er beskyttet med tofaktorautentisering
- datasentre bruker fysiske adgangsbarrierer, overvåking og hendelseslogger
- Brevo tilbyr 2FA for kontoer

Fakturasjekk-krav før live:

- 2FA **skal** aktiveres på Brevo-kontoen
- færrest mulig konto-brukere
- API-nøkkel skal bare finnes i server secret store
- API-/SMTP-tilgang bør IP-begrenses der Fakturasjekks produksjonsarkitektur gir stabil og korrekt egress-IP
- webhook skal fortsatt bruke Fakturasjekks egen hemmelige header; Brevos publiserte webhook-IP-ranges kan vurderes som defense in depth dersom faktisk hosting kan validere original klient-IP pålitelig
- API-nøkkel/webhook-secret skal kunne roteres uten kodeendring

Kilder:
- https://help.brevo.com/hc/en-us/articles/360001005830-Access-to-data
- https://help.brevo.com/hc/en-us/articles/360001005630-Data-center-security
- https://help.brevo.com/hc/en-us/articles/360021203440-Secure-your-account-with-two-factor-authentication-2FA
- https://help.brevo.com/hc/en-us/articles/15127404548498-Brevo-IP-ranges-List-of-publicly-exposed-services

## 5. E-posttransport – viktig residual risiko

Brevo opplyser at de for utgående e-post forsøker å bruke TLS når mottakerens e-postserver tilbyr TLS. Hvis TLS ikke er tilgjengelig, opplyser Brevo at de bruker standard SMTP uten tilsvarende transportkryptering.

Dette betyr at Fakturasjekk **ikke kan hevde ende-til-ende- eller garantert transportkryptering for kvitterings-e-post**.

Risikoreduserende produktbeslutning:

- kvitteringsmailen skal ikke inneholde opplastet faktura eller annet kildedokument
- ingen OCR-tekst, funn, tvistedetaljer eller innsigelsesutkast i mailen
- kvitteringen skal begrenses til nødvendig kjøps-/avtale-/betalingsdokumentasjon
- betalingsreferanse og øvrige felter skal holdes på minimumsnivå som trengs for dokumentasjonen
- vurderingen skal inngå i endelig DPIA/residual-risikoaksept

Kilde:
- https://help.brevo.com/hc/en-us/articles/115000202824-Email-encryption

## 6. Tracking og leveringslogger

Fakturasjekk-adapteren setter `contactPixelTrackingConsent:false`. Dette reduserer ikke behovet for tekniske transactional delivery-logger: provider må fortsatt kunne gi status som delivered/bounce/deferred for å dokumentere om kvitteringen ble levert.

Fakturasjekk bruker ingen markedsføringsformål i denne flyten.

Før live skal følgende provider-retention avklares:

- hvor lenge transactional message/log metadata lagres
- hvor lenge recipient/e-post og eventhistorikk er tilgjengelig
- retention for bounce/blocklist
- om message preview/content beholdes, hvor lenge og for hvilke supportformål
- hvordan data slettes når en registrert ber om sletting og ingen separat rettslig plikt gjelder

Brevo dokumenterer at permanent kontolukking sletter kontodata irreversibelt, samtidig som aggregert data kan beholdes i tre måneder for statistikk og rettskrav. Dette er kontoavslutning og **må ikke forveksles med retention for den enkelte transactional e-post**.

Kilder:
- https://help.brevo.com/hc/en-us/articles/208677629-Permanently-close-your-Brevo-account
- https://help.brevo.com/hc/en-us/articles/5313915904914-Delete-contacts

## 7. Underleverandører og tredjeland – fortsatt åpent

Fakturasjekk har ikke funnet en tilstrekkelig, klart datert og kontoaktuell offentlig underleverandørliste som kan brukes til å lukke denne vurderingen uten å gjette.

En eldre Sendinblue/Brevo-DPA finnes offentlig og omtaler blant annet support-/konsernaktører utenfor EØS, men den behandles **ikke** som bevis for dagens underleverandørkjede. Den er historisk bakgrunn, ikke grunnlag for produksjonsgodkjenning.

Før live kreves derfor:

1. hent gjeldende underleverandørliste fra den faktiske Brevo-avtalen/kontoen
2. registrer navn, land, tjeneste og tilgangstype
3. identifiser all støtte-/fjernaksess fra land utenfor EØS
4. dokumenter overføringsgrunnlag der dette er relevant
5. vurder tilleggstiltak/TIA der nødvendig
6. dokumenter endringsvarsel og prosess ved ny underleverandør

**Konklusjon nå:** transfer/subprocessor review = `in_progress`, ikke `complete`.

## 8. Sletting og exit

Brevo opplyser at konto kan lukkes permanent og at data da ikke kan gjenopprettes. Brevo opplyser samtidig om tre måneders retention av aggregert data etter kontolukking for statistikk og rettskrav.

Før live skal Fakturasjekk teste/dokumentere:

- hvordan transactional logs fjernes eller anonymiseres
- hvordan recipient slettes uten at nødvendig bokførings-/kjøpsdokumentasjon i Fakturasjekks eget system slettes ulovlig
- hvordan blocklist håndteres ved sletting
- eksport av nødvendig konfig/evidence før leverandørbytte
- rotasjon/tilbakekalling av API-key og webhook-secret ved exit

Kilde:
- https://help.brevo.com/hc/en-us/articles/208677629-Permanently-close-your-Brevo-account

## 9. Før Brevo kan settes live

Alle punktene under må ha eksplisitt evidens:

- [ ] juridisk Fakturasjekk-selger/controller er fastsatt
- [ ] faktisk Brevo-kontraktsmotpart er registrert
- [ ] gjeldende DPA er gjennomgått punkt-for-punkt og akseptert/signert på korrekt juridisk enhet
- [ ] gjeldende underleverandørliste er arkivert/referert
- [ ] tredjeland/support/fjernaksess er vurdert
- [ ] eventuell TIA/overføringsgrunnlag er dokumentert
- [ ] transactional retention/logging/blocklist er dokumentert
- [ ] 2FA er aktivert på konto
- [ ] minst-privilegium for konto/API er konfigurert
- [ ] senderdomene er autentisert (DKIM/DMARC etter aktuell Brevo-prosess)
- [ ] webhook er konfigurert non-batched med Fakturasjekks custom auth-header
- [ ] fail-closed `config-only` live-verifikasjon er kjørt grønn
- [ ] syntetisk send er eksplisitt finansiert/godkjent
- [ ] syntetisk send → matching autentisert `delivered` er observert E2E
- [ ] bounce/deferred test viser at disse aldri blir `durable_medium_delivered=true`
- [ ] DPIA og personvernerklæring er oppdatert med endelig leverandørinformasjon

## 10. Provider-review konklusjon 22.08.2026

**Positivt dokumentert:**

- Brevo beskriver seg som processor for denne typen kundebruk
- DPA er tilgjengelig via Terms of Service
- oppgitt databasehosting er i EU
- dokumenterte tilgangskontroller finnes
- konto-2FA støttes
- Fakturasjekks kode begrenser data og skiller provider-aksept fra faktisk delivery

**Åpent / blocker:**

- faktisk gjeldende DPA er ikke godkjent for Fakturasjekks juridiske enhet
- gjeldende subprocessor/support-country chain er ikke bekreftet
- transfer assessment/TIA er ikke ferdig
- providerens konkrete transactional retention er ikke ferdig vurdert
- opportunistisk TLS på siste e-posthopp gir en residual konfidensialitetsrisiko
- live konto/sender/webhook/send→delivered er ikke verifisert

**Beslutning:** Brevo kan fortsatt være valgt teknisk kandidat, men ekte kundedata og kundebetaling skal forbli blokkert.
