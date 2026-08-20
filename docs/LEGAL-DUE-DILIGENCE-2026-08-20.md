# Fakturasjekk – juridisk due diligence 20.08.2026

## Formål
Denne gjennomgangen er en launch-kritisk krysskontroll av rettskilder, offentlige fagkilder og maskinlesbare registre som Fakturasjekk bruker eller forbereder. Produktet skal ikke velge en regel bare fordi den er relevant i teorien; en kunderegel krever både korrekt, gjeldende kilde og en deterministisk aktiveringssti fra dokumenterte fakta.

## Kildehierarki
1. **Gjeldende konsolidert lov/forskrift på Lovdata** er juridisk primærfasit for automatiserte regelspor.
2. **Offentlig fagmyndighet** brukes til satser, registerstatus, ikrafttredelse og praktisk anvendelse: Skatteetaten, Brønnøysundregistrene, Finanstilsynet, DSB, Statens vegvesen, Arbeidstilsynet, Direktoratet for byggkvalitet, Miljødirektoratet, RME/NVE, Nkom og relevante departement/regjeringen.no.
3. **Altinn/Digdir** brukes som offisiell tverretatlig veiledning og til å kryssjekke dokumentkrav/API-er, men kan ikke overstyre gjeldende lov/forskrift.
4. **Forbrukertilsynet/Forbrukerrådet** kan brukes som praktisk tolknings- og forbrukerveiledning, ikke som erstatning for lovtekst.
5. Dersom kilder peker i ulik retning, skal regelen gå til manuell juridisk kontroll og være fail-closed til avviket er løst.

## Kontrollert per 20.08.2026

### Generelle forbruker-/fakturaregler
- Håndverkertjenesteloven: virkeområde/§ 2-grense, §§ 7–9, §§ 32–37.
- Forbrukerkjøpsloven: varekjøp, pris/fakturagebyr § 37, reklamasjonsundersøkelse § 30.
- Markedsføringsloven § 11: krav uten avtale/tilleggsbetaling.
- Prisopplysningsforskriften §§ 10–13 og sektorspesifikke regler der relevant.
- Bokføringsforskriften §§ 5-1-1 og 5-1-2; kryssjekket med Altinns fakturaveiledning.
- Enhetsregisterloven/Foretaksregisterloven: dokumentidentifikasjon og registeropplysninger; nye lover er i hovedsak i kraft fra 01.01.2026, enkelte bestemmelser fra 01.07.2026.
- Merverdiavgiftsloven § 15-11 + Skatteetatens registreringsveiledning.

### Bransjespor
- Bilverksted: HTJL for ordinært betalt arbeid + verkstedforskriften; PKK separat; garanti/reklamasjon kan rutes til forbrukerkjøpsloven; omfattende skadereparasjon har § 14a-spor.
- Elektriker: HTJL + FEK/FEL + DSB-registerspor.
- VVS: HTJL + relevant TEK17; sentral godkjenning er frivillig og må ikke fremstilles som generell plikt.
- Varmepumpe: HTJL + TEK17 § 15-4 + gjeldende norsk f-gassregelverk. EU 2024/573 er per 20.08.2026 ikke innlemmet i EØS-avtalen og må ikke brukes som gjeldende norsk rett.
- Renhold: egen tjenesteprofil + forskrift om offentlig godkjenning. Gjeldende konsolidert § 17 omfatter også privat kjøp; Arbeidstilsynet bekrefter dette. Daglig offisielt XML-datasett finnes.
- Flytting: ikke HTJL; vegfraktloven unntar flyttegods. Offentlig markedsføring snevres til «Flytting og flyttebyrå» for ikke å love generell transportanalyse.
- Montering: HTJL § 2-grensen mot samlet varekjøp er eksplisitt rutingskontroll.
- Nybygg/full ombygging: stoppes fra vanlig HTJL og rutes mot bustadoppføringslova.
- Kreditt/finansiering: ordinær vare-/tjenesteanalyse stoppes; finansavtaleloven eget spor.

### Regulerte sektorer som ikke skal falle gjennom generisk tjenestepakke
Før egne regelpakker finnes, skal følgende stoppe/avklares: strøm/energi, telekom/ekom, forsikring, helserelatert offentlig/pasientbetaling, drosje/passasjertransport og annen særregulert transport, samt finans/kreditt. Eksempler på særregler som begrunner sperren er kraftomsetningsforskriftens faktureringsregler, ekomloven § 4-11, forsikringsavtalelovens premiefrister og prisopplysningsforskriftens §§ 25d–25e for drosje.

## Offentlige register-/dataspor
- **Brønnøysundregistrene Enhetsregister API v2**: aktiv produksjonskilde. Org.nr., navn, registerstatus og registreringsdatoer. MVA-kontroll må være datobevisst.
- **Arbeidstilsynet Renholdsregister**: offisielt daglig XML-datasett med XSD; maskinkilde kan implementeres med eksakt org.nr.-match og ferskhetskrav.
- **Finanstilsynets virksomhetsregister API v2**: åpent, dokumentert API (oppdatert 20.03.2026). Relevant for bl.a. inkassoforetak/finansielle tillatelser. Fravær alene må vurderes mot lovens unntak før negativ konklusjon.
- **Statens vegvesen Verkstedregister**: offisielt NLOD-datasett/CSV og offentlig tjeneste; portal opplyser også at API finnes. Automatisk bruk skal ikke aktiveres før nåværende API/ressurskontrakt er teknisk pinnet og testet.
- **DSB Elvirksomhetsregisteret**: autoritativ offentlig kilde; automatisk bruk holdes stengt til stabil maskinkilde er verifisert.

## Kritiske rettelser identifisert
1. **Historisk MVA**: dagens registerstatus kan ikke alene brukes til å bedømme en eldre faktura. Fakturadato og MVA-registreringsdato må tas med. Dersom virksomheten ikke er registrert i dag, men fakturaen er historisk, er historisk status uavklart uten historikkilde.
2. **Flytting ≠ generell transport**: offentlig kategori snevres inn.
3. **Regulerte sektorer**: generisk `other_service` må ikke analysere særregulerte sektorer med feil regelpakke.
4. **HTJL § 37**: kan være relevant når spesifisert regning ble krevd i tilstrekkelig tid før forfall; preaktiveres, ikke autoaktiveres uten dokumentert tidslinje.
5. **TEK17 § 15-4**: relevant særspor for varmepumpe/kuldeinstallasjon; faktura alene er ikke bevis for teknisk forskriftsbrudd.
6. **F-gassovergang**: EU 2024/573 er ikke gjeldende norsk rett per kontrolltidspunkt; overgang må overvåkes.
7. **Inkasso/renter**: satser må være dato-versjonerte. Inkassosats 2026 = 750 kr; purring/inkassovarsel 38 kr; egen betalingsoppfordring 113 kr. Forsinkelsesrente 01.01–30.06.2026 = 12,00 %, 01.07–31.12.2026 = 12,25 %. Standardkompensasjon skal ikke legges på en forbruker som om det var et generelt forbrukergebyr.

## Launch-prinsipp
En regel kan kun bli `active` når:
1. gjeldende primærkilde er kontrollert,
2. virkeområde/vilkår er kodet eksplisitt,
3. dokument-/registerfakta har riktig provenance,
4. minst én positiv og relevante negative fasiter finnes,
5. grenseflater mot andre lover er testet,
6. kundeteksten beskriver kontrollen uten å overdrive rettsvirkningen.

Preaktivering og kildeovervåking er uttrykkelig ikke det samme som rett til å bruke regelen i kundekonklusjon.
