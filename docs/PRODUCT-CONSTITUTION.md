# Fakturasjekk – produktkonstitusjon

Status: styrende produktretning
Dato: 19.08.2026

Dette dokumentet fastsetter hva Fakturasjekk skal være, hvilke produktregler som ikke skal brytes, og hvilke ideer som skal styre videre utvikling. Det erstatter ikke den operative lanseringsrekkefølgen i `docs/NEXT-TO-LIVE.md`.

Ved konflikt gjelder følgende rekkefølge:

1. verifisert lov-/regelgrunnlag og sikkerhetskrav
2. kanonisk prosjektstatus
3. operativ launch-gate og `NEXT-TO-LIVE.md` for hva som bygges først
4. denne produktkonstitusjonen for langsiktig produktretning

## 1. Produktets kjerne

Fakturasjekk er en norsk forbrukertjeneste for privatpersoner som vil kontrollere en faktura fra en bedrift.

Kjeden er:

`Hva ble avtalt → hva ble fakturert → hva kan dokumenteres → hvilke norske regler gjelder → hva bør kunden gjøre videre`

Hovedbudskap:

**Sjekk fakturaen før du betaler.**

Støttebudskap:

**Last opp fakturaen. Har du også tilbud, avtale, SMS, e-post eller annen dokumentasjon? Legg det ved – da kan vi gjøre en grundigere kontroll.**

Faktura alene skal være nok til å starte. Det betyr ikke at alle spørsmål kan avgjøres uten avtalegrunnlag.

## 2. Hva Fakturasjekk ikke skal være

- ikke en generell AI-chatbot
- ikke markedsført som «AI-advokat»
- ikke en motor som finner på hva en vare eller tjeneste «burde koste»
- ikke en tjeneste som skaper et avvik bare for å gi kunden opplevd verdi
- ikke et system som bruker en paragraf bare fordi den virker plausibel

AI er motor under panseret. Produktet markedsføres på kontrollen og resultatet.

## 3. Bevismodell

Alle vesentlige opplysninger skal klassifiseres etter kilde.

### Dokumentert opplysning
Finnes i faktura, tilbud, kontrakt, ordrebekreftelse, SMS/skjermbilde, e-post, endringsordre eller annet lastet opp materiale.

### Registeropplysning
Kommer fra en kontrollert offentlig kilde.

### Brukeropplysning
Kunden opplyser noe som ikke kan dokumenteres i materialet, for eksempel hva som ble sagt muntlig.

### Beregnet opplysning
Fakturasjekk har beregnet differanse, linjesum, totalsum eller annen matematisk følge av kontrollerte inputverdier.

Brukeropplysninger skal aldri automatisk oppgraderes til dokumentert bevis.

Hvis kunden korrigerer et kritisk felt som ble lest usikkert, skal opprinnelig maskinavlesning og brukerbekreftet verdi kunne skilles i revisjonssporet.

## 4. Dokumenter og avtalehistorikk

Faktura er hoveddokumentet.

Systemet skal kunne bruke støttegrunnlag som:

- tilbud
- prisoverslag
- kontrakt
- ordrebekreftelse
- arbeidsbeskrivelse
- SMS/skjermbilder
- e-post/skjermbilder
- endringsordre
- dokumentasjon på tilleggsarbeid
- bilder av skriftlige avtaler
- annen relevant dokumentasjon innen støttet filpolicy

En avtale kan være fordelt over flere kilder og tidspunkter. Systemet må derfor kunne representere en dokumentkjede, ikke anta at én PDF inneholder hele avtalen.

Native støtte for flere komplekse filformater som e-postarkiver og kontordokumenter skal ikke prioriteres foran sikker produksjonsflyt. PDF/JPEG/PNG/WebP dekker V1 gjennom dokumenter og skjermbilder.

## 5. Kontrollområder

Kontrollmotoren skal innen dokumentert grunnlag kunne vurdere:

### Avtale og pris
- fastpris
- prisoverslag
- prisantydning
- timepris
- løpende regning
- ukjent/ikke dokumentert prisgrunnlag
- avtalt pris mot fakturert pris

### Regnestykke
- delsummer
- totalsum
- summeringsfeil
- dobbeltføringer
- krediteringer
- relevante avrundingsavvik

### Arbeid
- timer
- timepris
- datoer
- arbeidsbeskrivelse
- samsvar med dokumentgrunnlaget

### Materialer og varer
- vare-/materialposter
- antall
- pris
- påslag når dette faktisk fremkommer
- mangelfull spesifikasjon
- avvik mot dokumentert avtalegrunnlag

### Tillegg og endringer
- ekstraarbeid/endringsarbeid
- transport/kjøring
- administrasjon
- oppmøte
- miljøgebyr
- fakturagebyr
- andre tillegg

### MVA og formalia
- beregning
- sats og grunnlag når dokumentert
- regnefeil
- relevante formelle krav når kontrollert regelgrunnlag støtter dette

## 6. Tilleggsarbeid er et eget hovedområde

For tilleggs-/endringsarbeid skal analysen forsøke å skille mellom:

1. opprinnelig avtalt omfang
2. senere endring eller tillegg
3. hvor endringen fremkommer
4. dokumentasjon på pris/prisgrunnlag
5. dokumentasjon på kundens informasjon/aksept der relevant
6. hvordan fakturaen skiller originalt arbeid og tillegg
7. om arbeidet fremstår dokumentert som bestilt eller nødvendig
8. hvilke kontrollerte regler som eventuelt er relevante

Manglende dokumentasjon skal beskrives som manglende dokumentasjon, ikke automatisk som lovbrudd.

Foretrukket språk:

> Vi finner ikke dokumentasjon i materialet du har lastet opp som viser at dette tilleggsarbeidet ble avtalt.

## 7. Fakturautsteder og offentlige virksomhetsopplysninger

Når firmanavn eller organisasjonsnummer kan leses sikkert, skal Fakturasjekk kunne kontrollere tilgjengelige offisielle virksomhetsopplysninger.

Aktuelle fakta kan omfatte:

- firmanavn
- organisasjonsnummer
- om virksomheten finnes i offentlig register
- om navn og organisasjonsnummer samsvarer
- MVA-status når tilgjengelig og relevant
- åpenbare faktiske avvik mellom faktura og registeropplysning

Registerkontrollen er faktakontroll, ikke en omdømme- eller «trygghetsscore» for virksomheten.

MVA-registrering av virksomheten er heller ikke i seg selv bevis for at en konkret MVA-post på fakturaen er korrekt.

## 8. Lov- og regelmotor

Ingen lov, paragraf eller regel skal genereres fritt av språkmodellen.

Korrekt arbeidskjede er:

`Dokument → faktum → beviskilde → partstype → avtaletype → avvik → mulig regel → vilkår → kontrollert primærkilde → kundesikkert resultat`

Hver kontrollert regel bør minst inneholde:

- lov/forskrift
- paragraf
- intern regel-ID
- partstype/sakstype
- vilkår
- kilde
- kildeversjon/hash der mulig
- ikrafttredelsesdato der relevant
- opphørsdato der relevant
- versjon
- sist kontrollert
- aktiv/inaktiv
- samspill med andre regler der relevant

Interne regel-ID-er vises ikke til kunden.

Er systemet usikkert på om regelen gjelder, skal regelen ikke brukes som en sikker konklusjon.

Kundespråk:

**Er vi ikke sikre på at regelen gjelder i saken din, sier vi fra i stedet for å gjette.**

Lovdata og andre relevante offentlige kilder kan brukes som kontrollkilder. Fakturasjekk skal aldri skape inntrykk av partnerskap, godkjenning eller kvalitetssikring fra en ekstern kilde dersom dette ikke faktisk finnes.

## 9. Regelversjon per analyse

En ferdig analyse skal kunne knyttes til regelsettet og kildeversjonene som faktisk ble brukt på analysetidspunktet.

En senere lovendring skal ikke stille omskrive en gammel sak. Nytt regelgrunnlag krever eksplisitt ny analyse eller migreringslogikk med revisjonsspor.

## 10. Usikker dokumentlesing

Dårlig dokumentkvalitet skal aldri presenteres som sikker informasjon.

Kundespråk:

> Dette beløpet er vanskelig å lese. Kontroller at vi har lest det riktig.

Bare kritiske usikre felt skal kreve kundebekreftelse. Fakturasjekk skal ikke gjøre korrektur av hele OCR-resultatet til kundens jobb.

Kritiske felt kan blant annet være:

- beløp
- totalsum
- dato
- timer
- organisasjonsnummer

## 11. Bevisbarhet for hvert vesentlig funn

Et vesentlig funn skal så langt som mulig ha:

1. **Hva vi fant**
2. **Hvor vi fant det** – dokument og side/kilde
3. **Hva vi sammenligner med**
4. **Beregningen** når relevant
5. **Regel** bare når kontrollert og relevant
6. **Betydning** forklart på vanlig norsk

Målet er etterprøvbarhet, ikke svart-boks-svar.

## 12. Kontroll-dekning i resultatet

Resultatsiden skal vise både hva som ble kontrollert og hva som ikke kunne kontrolleres sikkert.

Eksempel:

**Kontrollert**
- regnestykke
- timer
- prisgrunnlag

**Ikke mulig å kontrollere sikkert**
- avtalt pris – avtalegrunnlag mangler
- MVA-grunnlag – ikke tilstrekkelig dokumentert

Dette skillet er nødvendig for å unngå at «ingen avvik funnet» misforstås som «alt er bevist korrekt».

## 13. Resultatstatus og vesentlighet

Tillatte kundestatuser kan blant annet være:

- Ser riktig ut
- Verdt å kontrollere
- Dokumentert avvik
- Mangler dokumentasjon
- Kan ikke vurderes sikkert

«Dokumentert avvik» betyr et dokumentert faktisk avvik mellom relevante opplysninger. Det betyr ikke automatisk lovbrudd.

Funn skal prioriteres etter vesentlighet. Et mindre avrundingsavvik skal ikke visuelt sidestilles med et stort udokumentert tillegg.

## 14. Resultatside

Foretrukket hovedstruktur:

1. kort sammendrag
2. kontroll-dekning
3. Avtale og pris
4. Timer og arbeid
5. Materialer og tillegg
6. Regnestykke og MVA
7. Regel- og paragrafkontroll
8. Fakturautsteder
9. Hva du kan gjøre nå

Gyldig toppresultat:

**Vi fant ingen dokumenterte avvik basert på materialet du har lastet opp.**

## 15. Regel- og paragrafkontroll – design

V0.16 er fast designreferanse.

Videre design skal beholde:

- tydelig regel/paragraf
- tydelig status
- kort forklaring
- kilde
- hvorfor regelen er relevant
- ingen overlesset juridisk tekst
- ingen interne ID-er, utviklerkoder eller tekniske plassholdere

## 16. Svar til fakturautsteder

Når analysen støtter det, kan kunden få et profesjonelt svarutkast.

Utkastet skal:

- være saklig og rolig
- beskrive konkrete poster
- vise relevante beregninger
- be om dokumentasjon der dette mangler
- vise lov/paragraf bare når kontrollert og relevant
- aldri hevde mer enn dokumentasjonen støtter

Foretrekk formuleringer som:

> Jeg ber om en nærmere redegjørelse for denne posten og hvordan den er beregnet.

og:

> Slik jeg forstår dokumentasjonen, avviker dette fra prisgrunnlaget jeg mottok.

## 17. Ny vurdering når firmaet svarer

Kundekommunikasjon:

**Fikk du svar fra firmaet? Last opp svaret, så vurderer Fakturasjekk saken på nytt uten at du trenger å starte forfra.**

Ny analyse skal kunne bruke tidligere dokumentgrunnlag, analyse, svarutkast, firmaets svar og ny dokumentasjon.

Den skal vise:

- hva som er avklart
- hva som fortsatt er uavklart
- hva firmaet har dokumentert
- eventuelle nye forhold

Kjernefunksjonen finnes allerede. Videre prioritet er sikker provider-/E2E-verifisering, ikke å bygge konseptet på nytt.

## 18. Pris og kommersiell test

Første kommersielle pris beholdes:

**29 kr per sak**

Primær KPI:

**Første helt fremmede betalende kunde.**

Deretter måles blant annet:

- start/opplasting → betaling
- betaling → fullført analyse
- bruk av svarutkast
- bruk av ny vurdering etter firmasvar
- hvilke kontrollområder som oftest gir funn
- andel saker der bare faktura lastes opp
- andel saker med utilstrekkelig dokumentgrunnlag

Prisen skal ikke økes før reell betalingsvilje og produktverdi er testet.

## 19. Personvern

Personvern er en produktfunksjon fra start.

Prinsipper:

- dataminimering
- kun samle inn det som er nødvendig
- minst mulig varig lagring
- kryptert overføring
- tydelig informasjon om lagring
- kort standardretention
- brukerstyrt sletting
- lengre lagring bare når nødvendig og tydelig valgt/avtalt

Produktmål for V1:

**Kundedokumenter skal ikke brukes til trening av Fakturasjekks eller leverandørenes modeller.**

Dette skal bare kommuniseres offentlig når faktiske leverandørvilkår, innstillinger og databehandleravtaler gjør utsagnet sant.

## 20. Språk og markedsføring

Fakturasjekk skal oppleves enkelt, trygt, troverdig, norsk, forbrukervennlig, ryddig og profesjonelt.

Unngå kundespråk som:

- deterministisk analysemotor
- fail-closed
- OCR-felt stoppes
- regel-ID

Skriv heller:

**Vi bruker faste kontrollregler og kontrollerte rettskilder. Er vi usikre, sier vi fra.**

og:

**Er noe vanskelig å lese, ber vi deg kontrollere det før analysen fortsetter.**

Foretrukket posisjonering:

**Fakturasjekk.no – Sjekk fakturaen før du betaler.**

Sekundær markedsføring kan bruke:

**Stemmer fakturaen med det du avtalte?**

og ved passende kampanjer:

**Ikke betal mer enn du skal.**

## 21. Testprinsipp

Alle viktige analysekategorier skal ha realistiske syntetiske testcases med kjent fasit.

Testbiblioteket skal blant annet dekke:

- korrekt faktura
- prisoverslag overskredet
- ukjent prisgrunnlag
- fastpris + uventede tillegg
- timepris + feil timer
- dobbeltført vare
- MVA-feil
- tillegg avtalt via SMS
- tillegg uten dokumentasjon
- manglende tilbud
- dårlig skann
- motstridende dokumentasjon
- flere fakturaer på samme jobb
- kreditnota
- delbetaling
- korrekt «ingen avvik»-sak
- to dokumenter med motstridende kritisk faktum
- feil OCR på kritisk beløp
- relevant regel finnes, men nødvendig vilkår mangler

Systemet skal stoppe eller uttrykke usikkerhet – ikke velge den forklaringen som gir mest dramatisk resultat.

## 22. Produktprioritering

### Produktretning P1

- faktura alene skal gi nyttig startkontroll
- støtte dokumentkjeder innen sikker filpolicy
- tilleggsarbeid/endringer som eget hovedområde
- firmasjekk mot sikre offentlige data
- regelmotor/kildesikkerhet
- bedre kundespråk
- kontroll-dekning i resultatet
- bedre resultatvisning og vesentlighet

### Produktretning P2

- full live-verifisering av ny vurdering etter firmasvar
- bedre dokumentkobling og tidslinje
- forbedret saksopplevelse/lagrede saker
- flere verifiserte bransje-/saksspor

### Produktretning P3

- partner-/sponsorfunksjoner
- flere markeder først etter tydelig ny produktbeslutning
- prisbenchmarking bare hvis pålitelige, dokumenterbare datakilder finnes
- B2B-variant som separat senere beslutning

P-listen er produktretning, ikke launch-rekkefølge.

## 23. Operativ prioritet frem til første kunde

`docs/NEXT-TO-LIVE.md` styrer hva som gjøres først.

Ingen produktutvidelse skal omgå krav til sikker Auth, privat opplasting, produksjons-OCR/tolk, verifisert betaling, personvern/juridikk og full syntetisk E2E før første ekte kundedokument.

## 24. Absolutte produktregler

- aldri finn på en paragraf
- aldri gjett et kritisk beløp
- aldri presenter antakelser som dokumenterte fakta
- aldri konkluder juridisk sterkere enn kildene gir grunnlag for
- aldri skap et avvik bare for å gi kunden «verdi»
- «ingen dokumenterte avvik» er et godt og gyldig resultat
- vis usikkerhet når dokumentasjonen er utilstrekkelig
- vesentlige funn skal så langt som mulig spores til dokument og kilde
- AI kan forklare og strukturere; kontrollert regelverk avgjør hvilke juridiske regler som kan brukes
- produktet skal redusere kundens arbeid, ikke skape nye oppgaver
- når valget står mellom fancy funksjon og høyere tillit: velg tillit
- når valget står mellom AI-svar og dokumenterbart svar: velg det dokumenterbare
- når valget står mellom flere funksjoner og enklere brukeropplevelse: velg enklere brukeropplevelse

## Mål

Fakturasjekk skal bli den enkleste og mest troverdige norske tjenesten for å kontrollere en faktura før kunden betaler.
