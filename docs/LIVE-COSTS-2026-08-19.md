# Fakturasjekk – kostnader for å gå live

Dato: 19.08.2026

Dette er arbeidsbudsjettet for V1. Prisene må kontrolleres igjen rett før bestilling fordi leverandørpriser og valutakurs kan endres.

Valutareferanse brukt i estimatene: 1 USD ≈ 9,3968 NOK den 19.08.2026.

## 1. Virksomhet og Vipps-forutsetning

Det er foreløpig ikke dokumentert i prosjektet at Fakturasjekk har eget egnet organisasjonsnummer og norsk bedriftskonto.

Vipps krever:

- registrert virksomhet med organisasjonsnummer
- norsk bankkonto knyttet til organisasjonsnummeret
- signering av bedriftsavtale/eID

2026-gebyr hos Brønnøysundregistrene ved digital registrering:

- enkeltpersonforetak kun i Enhetsregisteret: 2 181 NOK
- aksjeselskap: 6 825 NOK
- AS krever i tillegg minimum 30 000 NOK aksjekapital. Aksjekapital er selskapets egenkapital og ikke et gebyr.

Kilder:
- https://www.brreg.no/hvordan-kan-vi-hjelpe-deg/gebyr-for-registrering-og-tinglysing/
- https://www.brreg.no/aksjeselskap/slik-starter-du-aksjeselskap/slik-starter-du-aksjeselskap-betal-inn-aksjekapital/
- https://help.vippsmobilepay.com/nb-NO/articles/what-do-i-need-before-applying

Bankens eventuelle etablerings-/månedspris kommer i tillegg og avhenger av valgt bank.

## 2. Domene

Produksjonsfrontenden bør bruke eget .no-domene. Domeneshops publiserte pris per 19.08.2026:

- registrering/første år: 99 NOK
- senere fornyelse: 199 NOK/år

Dette dokumentet bekrefter ikke at `fakturasjekk.no` er ledig eller allerede eid; det må sjekkes før bestilling.

Kilde:
- https://help.domeneshop.no/nb/articles/588672-hvor-mye-koster-et-domenenavn

## 3. Frontend-hosting

Cloudflare Pages Free er valgt som produksjonsmål for statisk frontend:

- fast kostnad: 0 NOK/mnd innenfor Free-planens grenser
- statiske asset-requests er gratis og ubegrenset
- custom domain støttes
- Pages Functions er ikke nødvendig i V1 fordi backend ligger i Supabase

GitHub Pages beholdes kun som syntetisk demo. GitHub Pages skal ikke brukes som hosting for den betalende SaaS-tjenesten.

Kilder:
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features

## 4. Supabase

Teknisk kan prosjektet fortsette på Free-plan, men betalt produksjon bør kjøre på Pro for å unngå automatisk pause ved lav aktivitet og for å få automatiske daglige backups.

Supabase Pro:

- 25 USD/mnd
- ≈ 235 NOK/mnd med valutareferansen over
- én Micro-instans dekkes av inkludert compute credit på standardoppsettet
- 100 GB file storage og 250 GB egress inkludert før overforbruk
- daglige backups med 7 dagers retention

PITR til ca. 100 USD/mnd er ikke planlagt for V1. Fakturasjekk har allerede egen kryptert backup-/restore-safety-kontrakt; faktisk restore-test gjenstår.

Kilder:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing

## 5. Google Cloud OCR

Google Cloud Vision Document Text Detection:

- første 1 000 units/sider per måned: 0 USD
- deretter: 1,50 USD per 1 000 sider opp til 5 millioner
- én PDF-side teller som én image/unit

Ved dagens valutareferanse er dette ca. 0,014 NOK per side etter gratisnivået.

Kilde:
- https://cloud.google.com/vision/pricing

Google Cloud må ha en aktiv Cloud Billing-konto for stabil produksjon. Det er ingen fast plattformavgift; Google bruker pay-as-you-go. Nye kvalifiserte kunder kan ha 300 USD i prøvecredit, men produksjonsplanen skal ikke være avhengig av en tidsbegrenset prøveperiode.

Kilder:
- https://cloud.google.com/pricing
- https://docs.cloud.google.com/billing/docs/how-to/manage-billing-account

## 6. Google Vertex AI – strukturert dokumenttolking

Fakturasjekk-koden bruker `gemini-3.1-flash-lite` på EU/non-global endpoint.

Publisert non-global standardpris:

- input: 0,275 USD per 1 million tokens
- text output: 1,65 USD per 1 million tokens

Koden begrenser input til 120 000 tegn og output til maks 4 096 tokens. Et konservativt eksempel med ca. 30 000 input-tokens + full 4 096-token output tilsvarer omtrent 0,14 NOK per KI-kall ved valutareferansen over. Normalbruk vil typisk være lavere, men faktisk kostnad skal måles fra provider usage-metadata før lansering.

Kilde:
- https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing

## 7. Vipps MobilePay

Standardpris for API-basert Payment integration i Norge:

- 2,99 % + 1 NOK per transaksjon

Ved Fakturasjekk-pris 29 NOK:

- Vipps-gebyr: ca. 1,87 NOK per salg
- igjen etter betalingsgebyret: ca. 27,13 NOK før øvrige kostnader, skatt og eventuell MVA

Den offentlige standardprissiden viser transaksjonspris, ikke en separat månedlig abonnementskostnad for Payment integration. Endelig merchant-avtale må kontrolleres før produksjon.

Kilder:
- https://vippsmobilepay.com/en-NO/pricing
- https://help.vippsmobilepay.com/nb-NO/articles/what-do-i-need-before-applying

## 8. Auth-epost / SMTP

Supabase sin innebygde SMTP er ikke egnet for produksjon: den sender bare til forhåndsgodkjente teamadresser og har svært lav rate limit. Produksjon med email signup/reset krever custom SMTP.

Dette trenger ikke gi en ny fast kostnad i V1. Eksempel: Resend Free tilbyr per 19.08.2026 3 000 transaksjonseposter per måned / 100 per dag og SMTP relay på 0 USD/mnd. Leverandøren må likevel gjennom personvern-/databehandlervurderingen før den velges endelig.

Kilder:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://resend.com/pricing
- https://resend.com/docs/send-with-smtp

## 9. MVA

For mva-pliktig omsetning er registreringsgrensen 50 000 NOK over en rullerende periode på 12 måneder. Virksomheten skal ikke fakturere med MVA før den er registrert.

Ved kun 29-NOK-salg tilsvarer 50 000 NOK omtrent 1 725 salg. Dette er kun en volumillustrasjon; faktisk MVA-behandling skal følge virksomhetens samlede avgiftspliktige omsetning og korrekt klassifisering av tjenesten.

Kilder:
- https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/registrere-endre-slette/
- https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/slik-fungerer-mva/forskjellen-pa-fritak-og-unntak-fra-merverdiavgift/

## 10. Praktisk minimumsbudsjett

Hvis Fakturasjekk ikke allerede har organisasjonsnummer/domain/bankkonto:

### ENK-spor

Engangs-/første betalinger før produksjon:

- Brønnøysund: 2 181 NOK
- .no-domene: ca. 99 NOK første år dersom ønsket domene kan registreres
- Supabase Pro første måned: ca. 235 NOK

Sum kjente kostnader: ca. 2 515 NOK + eventuell bankkostnad.

### AS-spor

Engangs-/første betalinger før produksjon:

- Brønnøysund: 6 825 NOK
- .no-domene: ca. 99 NOK første år
- Supabase Pro første måned: ca. 235 NOK

Sum kjente gebyr/driftsbetalinger: ca. 7 159 NOK + eventuell bankkostnad.
I tillegg må minst 30 000 NOK skytes inn som aksjekapital. Dette er kapital i selskapet, ikke en leverandørkostnad.

## 11. Det som kan være 0 NOK ved oppstart

- Cloudflare Pages statisk frontend: 0 NOK
- GitHub repo/CI innenfor Free/public-oppsettet: 0 NOK
- Resend SMTP innenfor Free-grensen: 0 NOK
- Google Vision OCR innen første 1 000 sider/mnd: 0 NOK
- Google Cloud opprettelse: 0 NOK fast; betaling etter faktisk bruk
- Vertex AI: ingen fast abonnementspris i denne modellen; betaling etter tokens

## 12. Kostnader som ikke bør kjøpes nå

Ikke kjøp før behovet er dokumentert:

- Supabase PITR (~100 USD/mnd)
- Cloudflare Workers Paid
- Resend Pro
- dyrt separat webhotell
- enterprise-planer hos Supabase/Google/Vipps

V1-arkitekturen er laget for å holde faste kostnader nede og la variable kostnader følge faktiske salg.
