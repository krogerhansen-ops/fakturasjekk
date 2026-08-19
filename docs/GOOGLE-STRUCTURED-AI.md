# Fakturasjekk – strukturert faktatolk og Svarrunde 2

Dato: 19.08.2026
Status: Kodeklar kandidat. Ikke live-godkjent for kundedata.

## Formål

Fakturasjekk bruker en strukturert språkmodell bare der deterministisk kode ikke kan lese mening direkte fra fri tekst:

1. gjøre OCR-tekst om til tillatte dokumentfakta
2. kartlegge om leverandørens svar dekker allerede identifiserte funn

Modellen gjør **ikke** juridisk vurdering. Lovvalg, paragrafbruk, beregninger, avviksregler og innsigelseslogikk ligger fortsatt i Fakturasjekks kontrollerte motor.

## V1-kandidat

- Google Vertex AI
- modell: `gemini-3.1-flash-lite`
- location: `eu`
- host: `https://aiplatform.eu.rep.googleapis.com`
- metode: `generateContent`
- strukturert JSON-output med både `responseMimeType=application/json` og `responseSchema`

Modellen er allowlistet i kode. Et senere modellbytte skal være en eksplisitt kode-/test-/providerreview, ikke en miljøvariabel som kan peke vilkårlig.

## Hvorfor denne kandidaten

V1 prioriterer lav kostnad og færrest mulig leverandører. Google er allerede valgt OCR-kandidat gjennom Cloud Vision, og Gemini 3.1 Flash-Lite støtter EU-multiregion, strukturert output og er en GA-modell med publisert livssyklus. Dette reduserer antall leverandørrelasjoner sammenlignet med å legge inn en separat språkmodellprovider bare for faktatolk/Svarrunde 2.

Dette er et teknisk valg, ikke en ferdig GDPR-godkjenning.

## Sikkerhetsgrense

`server/google-structured-ai-client.mjs` krever at hver request eksplisitt markerer:

- input er ubetrodd
- instruksjoner i kundedata skal ikke følges
- tools er av
- ekstern nettverkstilgang/grounding er av
- juridisk resonnering er ikke tillatt

Ingen `tools` sendes i Vertex-requesten.

Input pakkes som ubetrodd JSON under serverstyrte systeminstruksjoner. Prompt-injection i faktura, tilbud eller leverandørsvar behandles derfor som dokumenttekst, ikke som en instruksjon.

## Dataminimering

Faktatolken mottar bare:

- teknisk case-ID
- dokument-ID
- dokumentrolle
- MIME-type
- side
- OCR-tekst
- den eksplisitte feltkatalogen

Den mottar ikke:

- `owner_id`
- Supabase storage key
- signed URL
- auth-token
- betalingsnøkler
- juridisk regelregister

Svarrunde 2 mottar eksisterende finding code/tittel/forklaring og leverandørens svartekst. Den får ikke myndighet til å legge til nye finding codes.

## Strukturert output

Google-klienten konverterer Fakturasjekks interne JSON-schema til det støttede Vertex response-schema-subsettet og fjerner felt som `additionalProperties` som ikke brukes som provider-sikkerhetsgaranti.

Output må:

1. være en normal ferdig kandidat
2. inneholde tekst
3. parse som JSON
4. følge providerens response schema
5. deretter bestå Fakturasjekks egne kontraktvalidatorer

Providerens schema erstatter dermed ikke vår egen validering.

## Faktatolk etter OCR

`server/ocr-fact-interpreter.mjs` bygger schema direkte fra `config/extraction-fields.json`.

Hvert returnert felt må inneholde:

- `value`
- `confidence`
- `source_document_id`
- `source_page`

Ukjente/tvetydige felt skal utelates. Boolean skal bare brukes der teksten eksplisitt støtter true/false. Rollebegrensningen fra feltkatalogen sendes som serverkontrollert metadata.

`owner_id` blir bevisst ikke sendt videre selv om backend kjenner den.

## Kostnadsgrenser

V1:

- maks 100 000 OCR-tegn inn til faktatolken
- maks 120 000 JSON-tegn på én strukturert provider-request
- maks 4 096 output-tokens
- én kandidat
- temperatur 0
- ingen automatisk trunkering

Hvis grensen overskrides stoppes saken for avklaring/annen behandlingsstrategi. Systemet skal ikke kutte bort slutten av en faktura og late som hele dokumentet ble vurdert.

## Logging

Providerklienten har ingen request-/response-content logging. Valgfri usage-hook kan bare få numerisk bruksmetadata som tokenantall, sammen med task og modell-ID.

Produksjonsoppsettet skal også kontrollere Google Cloud sin request-response logging/caching før live.

## Svarrunde 2

Eksisterende kontrakt gjelder fortsatt:

- bare eksisterende `finding_code`
- `coverage`: answered / partial / unanswered / unknown
- dokumentasjon krevd/levert
- ingen nye juridiske funn
- ingen avgjørelse av hvem som har rett

Klienten kan bare sende `response_text`; interne strukturfelt avvises på API-grensen.

## Live-gater

Før kundedata:

- eget Google Cloud-prosjekt for Fakturasjekk
- Vertex AI/Agent Platform API aktivert
- least-privilege IAM/OAuth
- EU-multiregion-request verifisert med syntetiske data
- modell-ID/livssyklus kontrollert igjen
- DPA, underleverandører, supporttilgang og overføring vurdert
- request-response logging/caching kontrollert/deaktivert der nødvendig
- kostnadsbudsjett/varsling
- syntetisk benchmark av faktatolk og Svarrunde 2
- komplett Fakturasjekk E2E-test

## Offisielle referanser

- Gemini 3.1 Flash-Lite: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite
- Deployments/endpoints: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations
- Structured output: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output
- Inference configuration: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference
- Pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
