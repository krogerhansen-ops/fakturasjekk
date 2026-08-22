# Fakturasjekk – provider privacy review 22.08.2026

Status: **provider-review utført, men ikke juridisk launch-godkjenning**.

Formålet er å skille det som kan dokumenteres fra leverandørenes egne publiserte vilkår fra det som fortsatt krever kontooppsett, faktisk avtaleaksept, Fakturasjekks juridiske selger/behandlingsansvarlige og eventuelt egen transfer-/risikovurdering.

## Beslutningsregel

Ingen av funnene nedenfor åpner kundedokumentbehandling alene. `customer_data_live_enabled` skal forbli `false` inntil den relevante launch-gaten faktisk er fullført.

## Supabase

### Dokumentert

- Fakturasjekk-produksjonsprosjektet ligger i `eu-north-1` / Stockholm. Supabase beskriver valgt prosjektregion som kontrollen for hvor primære prosjektdata lagres.
- Supabase tilbyr en DPA. Den publiserte DPA-en beskriver Supabase som databehandler for covered data, skriftlige databehandlerforpliktelser overfor underleverandører og fortsatt ansvar for disse.
- DPA-en gir generell autorisasjon til underleverandører og beskriver minst 30 dagers varsel ved foreslåtte endringer, med en innsigelsesmekanisme.
- Supabase publiserer en TIA som uttrykkelig beskriver mulige overføringer/videreoverføringer til blant annet USA og Singapore. EØS-region for primære data er derfor **ikke** i seg selv dokumentasjon på at all tilgang/behandling er EØS-only.

### Fakturasjekk-konsekvens

- Stockholm-regionen beholdes som teknisk data-residency-kontroll.
- Supabase kan foreløpig ikke klassifiseres som «ingen tredjelandsoverføring».
- Før live må den DPA-en som faktisk gjelder Fakturasjekk-kontoen aksepteres/arkiveres, aktuell subprocessor-liste og TIA gjennomgås, og relevante support-/fjernaksessbaner føres i transfer-vurderingen.

Status: **SELECTED / DPA AVAILABLE / TRANSFER REVIEW STILL OPEN**.

## Google Cloud – Vision OCR og Vertex AI

### Dokumentert

- Google Cloud CDPA beskriver Google som databehandler for Customer Personal Data og inneholder mekanismer for underleverandører, varsel og SCC-er for relevante restricted transfers.
- Googles gjeldende data-residency-materiale inkluderer Cloud Vision OCR-endepunkt og relevante AI/ML-/generative tjenester blant tjenester som kan konfigureres for datalokasjon, med produkt-/modellspesifikke begrensninger.
- Google publiserer subprocessorliste og SCC-materiale.
- Googles tjenestevilkår inneholder en training restriction: Customer Data brukes ikke til å trene eller finjustere generative AI/ML-modeller uten kundens forutgående tillatelse/instruks.

### Viktig særskilt AI-risiko

Google har også en egen Advanced AI Safety Addendum. Dersom et produkt/prosjekt omfattes av den, kan særvilkår om lagring og safety review av prompts/generated output gjelde. Fakturasjekk skal derfor ikke anta at «EU endpoint + training restriction» alene beviser hele behandlingsflyten for valgt modell.

### Fakturasjekk-konsekvens

- Eksisterende hardlås til `eu`-endepunkter beholdes.
- Grounding, tools og ekstern nettverkstilgang forblir deaktivert.
- Før live skal den **konkrete** modellen `gemini-3.1-flash-lite` bekreftes som produksjonsmessig tillatt og innenfor valgt EU data-location/ML-processing-kontrakt på testdatoen.
- Det skal også bekreftes hvilke abuse/safety-retention-vilkår som faktisk gjelder prosjektet/modellen og om Advanced AI Safety Addendum er relevant.
- Faktisk Google Cloud CDPA, subprocessor-listen og transfergrunnlaget skal arkiveres for den juridiske Fakturasjekk-enheten.

Status: **SELECTED / CONTRACT FRAMEWORK AVAILABLE / MODEL-SPECIFIC LIVE REVIEW OPEN**.

## Vipps MobilePay ePayment

### Dokumentert

Vipps MobilePay sine Merchant Terms sier at Vipps MobilePay og Merchant er **independent controllers** for personopplysninger i forbindelse med sine respektive tjenester, inkludert betalingsbehandling. De samme vilkårene sier at Vipps opptrer som databehandler bare i spesifikke brukstilfeller som er regulert av DPA og appendikser. Den publiserte DPA-en lister per reviewdato Loyalty og Login/Delegated Consents som slike processor-brukstilfeller.

Vipps Developer Docs beskriver betaling som anonym som standard overfor merchant; ekstra brukerdata krever eksplisitt samtykke.

### Fakturasjekk-konsekvens

- Ordinær Fakturasjekk ePayment skal **ikke** feilaktig registreres som en generell processor-relasjon.
- For 29-kronersbetalingen registreres foreløpig rolle som controller-to-controller / independent controllers, med forbehold om den endelige Merchant Agreement og valgte tilleggstjenester.
- Fakturasjekk skal ikke be Vipps om navn, telefon, adresse eller annen profilinformasjon som ikke er nødvendig for den valgte betalingsflyten.
- Dersom Loyalty, Login/Delegated Consents eller annen funksjon med processor-rolle senere tas i bruk, må den relevante DPA-appendiksen vurderes separat.

Status: **SELECTED / ePAYMENT ROLE CLARIFIED / MERCHANT AGREEMENT + LIVE PRIVACY REVIEW OPEN**.

## Brevo transactional email

### Dokumentert

- Brevo oppgir at databasehosting skjer i EU, med OVH i Frankrike/Tyskland og Google Cloud i Belgia.
- Brevo oppgir at DPA finnes som del av Terms of Service.
- Brevo beskriver kontrollert produksjonstilgang for ingeniører med sentralisert rolleadgang, kortlivede individuelle sertifikater og tofaktorbeskyttelse.
- Transactional email logs lagres uten tidsgrense som standard.
- Brevo tillater egendefinert transactional log-retention på 1–24 måneder; minimum er 1 måned.
- Lagring av full e-post-preview kan slås helt av, og «Never store previews» er oppgitt som standard for nye previews i retention-innstillingen.
- Brevo gjør oppmerksom på at sletting av enkelte transactional logs kan bruke tid før den er fullført.

### Fakturasjekk-konsekvens – obligatorisk konto-oppsett

Før **noe** Brevo live-verifikasjonskall får kjøre skal følgende være kontrollert i den faktiske Fakturasjekk-kontoen og registrert i `config/brevo-delivery-target.json`:

1. `transactional_log_retention_months = 1`
2. `email_previews_enabled = false`
3. `privacy_settings_verified_at` satt til tidspunktet innstillingene faktisk ble kontrollert

`scripts/verify-brevo-live.mjs` skal fail-closed før provider credentials/nettverk dersom disse kravene ikke er oppfylt.

Brevo skal fortsatt bare få verifisert mottakeradresse + ordrebekreftelse/kvittering. Faktura, OCR, analyse, funn og innsigelsesutkast skal aldri sendes til Brevo.

### Fortsatt åpent

- aktuell DPA må gjennomgås/aksepteres av korrekt Fakturasjekk juridisk enhet
- aktuell subprocessor-annex/endringsvarsel må arkiveres og vurderes
- mulig tredjelandstilgang via support/subprocessor-kjede må vurderes
- senderdomene, webhook og syntetisk send→`delivered` E2E må verifiseres

Status: **SELECTED / PRIVACY SETTINGS NOW FAIL-CLOSED IN CODE / CONTRACT + LIVE E2E OPEN**.

## Hva denne reviewen endrer i launch-gatene

Denne reviewen er nok til å forbedre evidens og korrigere leverandørroller, men **ikke** til å sette `LEGAL_PROCESSOR_AGREEMENTS`, `LEGAL_TRANSFER_ASSESSMENT`, `LEGAL_DPIA_COMPLETE` eller de aktuelle live-provider-gatene til `complete`.

Følgende må fortsatt komme fra den faktiske kontoen/avtalen:

- korrekt Fakturasjekk selger/behandlingsansvarlig
- avtaleaksept/DPA under riktig juridisk enhet
- aktuelle underleverandørlister på godkjenningsdato
- nødvendige SCC-/transfer-/TIA-beslutninger
- konto-/retention-innstillinger
- syntetiske live E2E-bevis

## Primærkilder kontrollert 22.08.2026

Supabase:
- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/docs/guides/security
- https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf
- https://supabase.com/downloads/docs/Supabase%2BTIA%2B250314.pdf

Google Cloud:
- https://cloud.google.com/privacy/gdpr
- https://cloud.google.com/terms/data-residency
- https://cloud.google.com/terms/subprocessors
- https://cloud.google.com/terms/advanced-ai-safety-addendum
- https://cloud.google.com/legal-change-log

Vipps MobilePay:
- https://www.vippsmobilepay.com/en-NO/terms-and-conditions
- https://www.vippsmobilepay.com/en-NO/data-processing-agreement
- https://developer.vippsmobilepay.com/docs/knowledge-base/user-data-privacy/

Brevo:
- https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location
- https://help.brevo.com/hc/en-us/articles/360001005830-Access-to-data
- https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA
- https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews
- https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews
