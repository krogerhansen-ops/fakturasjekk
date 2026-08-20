# Fakturasjekk – juridisk due diligence 20.08.2026

## Formål
Denne gjennomgangen er en launch-kritisk krysskontroll av rettskilder, offentlige fagkilder, satser og maskinlesbare registre som Fakturasjekk bruker eller forbereder. Produktet skal ikke velge en regel bare fordi den er relevant i teorien. En kunderegel krever både korrekt og gjeldende kilde, riktig virkeområde og en deterministisk aktiveringssti fra dokumenterte fakta.

Målet er høyest mulig juridisk robusthet, ikke flest mulig paragrafer. Null juridiske feil kan aldri garanteres av et automatisert system, men arkitekturen skal gjøre feil vanskelig å introdusere, lett å oppdage og fail-closed før kunden får en sikker konklusjon.

## Kildehierarki
1. **Gjeldende konsolidert lov/forskrift og ikrafttredelsesvedtak** hos Lovdata/Norsk Lovtidend er normerende juridisk fasit.
2. **Lovdatas åpne API/NLOD** skal være ønsket primær maskinell synk for gjeldende lover og sentrale forskrifter. HTML-kontrollfrase/hash beholdes som ekstra vakt, ikke som eneste langsiktige synkmetode.
3. **Offentlig fagmyndighet** brukes til satser, registerstatus, ikrafttredelse og praktisk anvendelse: Skatteetaten, Finanstilsynet, DSB, Statens vegvesen, Arbeidstilsynet, DiBK, Miljødirektoratet, NVE/RME, Nkom og relevante departementer.
4. **Offentlige registerdata** fra Brønnøysundregistrene, Arbeidstilsynet, Statens vegvesen, Finanstilsynet m.fl. behandles som egne registerfakta og aldri som dokumentfakta.
5. **Altinn/Digdir** brukes til offentlig tverretatlig veiledning/API- og dokumentkrav, men kan ikke overstyre lov/forskrift.
6. **Forbrukertilsynet/Forbrukerrådet og offentlig klagepraksis** brukes til praktisk krysskontroll og testscenarier, ikke som erstatning for primærrettskilden.

Ved konflikt mellom veiledning og gjeldende lov/forskrift vinner primærkilden. Konflikten skal utløse manuell juridisk kontroll, ikke automatisk KI-tolkning.

## Aktive hovedspor – status
### Håndverkertjenester
Aktive §§ 7, 9, 32, 33, 34 og 36 er fortsatt relevante for triggerne motoren bruker. § 8 beholdes som kandidat fordi konsekvensvurderingen er konkret og delvis kontrafaktisk. § 37 er lagt som preaktiveringskandidat for tilfeller der forbrukeren har krevd spesifisert regning før forfall. Aktivering krever dokumentert tidslinje; Fakturasjekk skal ikke oppfinne en fast daggrense for «tilstrekkelig tid».

### Varekjøp
Forbrukerkjøpsloven § 37 er riktig for pris og fakturagebyr som må følge klart av avtalen. Den er ikke alene tilstrekkelig for fakturagebyr: finansavtaleloven § 2-4 setter også et tak mot betalingsmottakerens faktiske kostnad ved utstedelse/sending av regning til forbruker. FIN § 2-4 er derfor preaktivert, men ikke automatisk aktiv fordi Fakturasjekk ikke skal gjette bedriftens faktiske kostnad.

Forbrukerkjøpsloven §§ 38 og 41 og angrerettloven §§ 23–24 er lagt som egne preaktiveringsspor for betaling før levering, avbestilling før levering og gyldig bruk av angrerett. De krever dokumentert leverings-/avbestillings-/angretidslinje og kan ikke aktiveres bare på bakgrunn av en løs brukerkommentar.

### Uavtalte tillegg
Markedsføringsloven § 11 beholdes. Manglende dokumentasjon er ikke automatisk bevis for at avtale aldri fantes. Dokumentert motstrid mellom avtale og faktura gir sterkere grunnlag enn «ikke funnet».

### Prisopplysningsforskriften
§ 10 forblir runtime-kandidat fordi fravær av opplastet prisdokument ikke beviser at prisopplysning manglet før avtale. §§ 12 og 13 kan brukes når dokumentfakta gir deterministisk grunnlag. Særkapitler for blant annet gravferd, tannhelse, elektrisk kraft og drosje behandles som egne sektorankre, ikke som generisk tjenesteregel.

### Fakturaformalia
Bokføringsforskriften §§ 5-1-1 og 5-1-2 er riktige. Altinn/Skatteetaten bekrefter krav til blant annet selger, organisasjonsnummer, MVA-markør når registrert, ytelsens art/omfang, leveringsopplysninger, vederlag, avgiftsopplysninger og betalingsopplysninger. Formfeil skal aldri automatisk tolkes som at hovedkravet bortfaller.

Endringer i e-fakturering/bokføring fra 2026/2027 er i hovedsak næringsliv/B2B og åpner ikke et nytt generelt forbrukerkrav i V1. Kildene skal likevel overvåkes for fremtidige dokumentkrav.

## Bransje-/sakstypekonklusjoner
- **Bilverksted – ordinær bestilt reparasjon/service:** håndverkertjenesteloven + verkstedforskriften + relevante pris/fakturaregler.
- **Bil – reklamasjon/garanti etter kjøp:** forbrukerkjøpssporet må avklares før vanlig HTJL-ruting.
- **PKK/EU-kontroll:** eget kontrollorgan-/PKK-spor. Vanlig verkstedgodkjenning er ikke nok.
- **Omfattende skadereparasjon:** HTJL + verkstedforskriften § 14a når skadeklassifiseringen faktisk passer.
- **Elektriker:** HTJL + relevante FEK/FEL-spor + DSB-register. Registertreff må senere matche arbeidsoppgave/anleggstype, ikke bare foretak.
- **Rørlegger/VVS:** HTJL + bare relevante tekniske TEK17-regler. Sentral godkjenning er frivillig og skal aldri presenteres som et generelt lovkrav.
- **Varmepumpe:** HTJL + betinget el/f-gass + relevant TEK17. F-gassovergangen overvåkes særskilt.
- **Renhold:** avtale/pris/faktura + offentlig godkjenningsregister.
- **Flytting/flyttebyrå:** avtale/pris/markedsføring/faktura; håndverkertjenesteloven gjelder ikke. «Transport» er for bredt som generell støttekategori og skal ikke brukes som løfte om person-/godstransportanalyse.
- **Montering/installasjon:** klassifiser kjøpsdominant vs selvstendig tjeneste før lovvalg, jf. HTJL § 2-grensen.
- **Nybygg/full ombygging:** stopp ordinær HTJL-V1 og rut mot bustadoppføringslova.
- **Kreditt/finansiering:** separat finansavtalerute; ikke press kostnader gjennom vanlig vare-/tjenestemotor.

## Særregulerte sektorer – fail-closed
«Andre forbrukerfakturaer» betyr at dokumentet kan lastes opp og grunnleggende dokument-/regnekontroll kan gjøres. Det betyr ikke at alle norske fakturatyper har en ferdig juridisk motor.

Følgende sektorer stoppes før generisk juridisk analyse til egne pakker er bygget:
- strøm/nettleie/energi – eget kraft-/faktureringsregelverk,
- mobil/bredbånd/ekom – ekomloven/ekomforskriften,
- forsikring – forsikringsavtaleloven,
- drosje – særregler om pristilbud/kvittering,
- annen persontransport – særregler/MVA,
- helse-/pasient-/offentlige betalingskrav – særskilt hjemmelsgrunnlag,
- digitale ytelser – digitalytelsesloven,
- parkering/kontrollsanksjon – parkeringsforskriften og parkeringsregisteret,
- pakkereiser – pakkereiseloven/reisegaranti,
- boligleie – husleieloven,
- tannhelse – særregler i prisopplysningsforskriften,
- gravferd – særregler i prisopplysningsforskriften.

Hver sperret sektor har minst ett overvåket preaktiveringsanker i `rules/*-candidates.json`, slik at selve årsaken til sperren også kildeovervåkes.

## MVA og dynamiske satser
2026-satser som Fakturasjekk må kunne velge etter kategori og dato:
- generell sats: 25 %,
- næringsmidler: 15 %,
- vann fra vannverk og avløpstjenester: 15 %,
- spesifiserte lavsatsytelser: 12 %.

Vanlig VVS-/rørleggerarbeid får ikke 15 % bare fordi arbeidet gjelder vann. Flytting av gods er ikke persontransport og får ikke 12 % automatisk. Ukjent kategori = ingen sikker MVA-satskonklusjon.

`rules/dynamic-rates.json` krever dato-intervaller og forbyr bruk av «nyeste sats» retroaktivt.

## Inkasso, renter og kostnader
- Ny inkassolov LOV-2026-05-22-19 er vedtatt, men ikke i kraft per 20.08.2026. Gammel lov brukes til faktisk ikrafttredelse er verifisert. Delvis ikraftsetting må håndteres uttrykkelig.
- Inkassosats 2026: 750 kr.
- Purring/inkassovarsel 2026: 38 kr når forskriftens vilkår er oppfylt.
- Betalingsoppfordring ved egeninkasso: 113 kr når vilkårene er oppfylt.
- Forsinkelsesrente 01.01–30.06.2026: 12,00 % p.a.
- Forsinkelsesrente 01.07–31.12.2026: 12,25 % p.a.
- Standardkompensasjon overvåkes, men skal ikke legges på en forbruker som et generelt forbrukergebyr.

Brudd på inkassoreglene betyr ikke automatisk at hovedkravet bortfaller; hovedkrav og inndrivingskostnader holdes separat.

## Offentlige register-/dataspor
### Brønnøysundregistrene
Enhetsregister API v2/NLOD er aktiv produksjonskilde for org.nr., navn og relevante register-/statusopplysninger. Registeropplysning er faktum, ikke «seriøsitetsscore». Dagens MVA-status kan ikke alene bevise historisk status på en eldre faktura; fakturadato og eventuell registreringshistorikk må tas med.

### Arbeidstilsynet – Renholdsregisteret
Data.norge dokumenterer et daglig offisielt XML-datasett med XSD. Maskinkilden er verifisert, men runtime forblir stengt til parser, XSD-validering, org.nr.-match og korrekt statuslogikk er testet.

### Finanstilsynet – Virksomhetsregisteret
API v2 er offisielt dokumentert og oppdatert i 2026. Kilden er egnet for fremtidig tillatelses-/virksomhetskontroll, men runtime krever pinnet mapping av konkrete `LicenceTypes` til den aktiviteten Fakturasjekk undersøker.

### Statens vegvesen – verksted/kontrollorgan
Data.norge bekrefter åpent CSV-datasett og godkjenningskategorier. Metadata har sprik mellom eldre direkte-CSV og nyere ressursopplysninger. Runtime forblir stengt til stabil ressurskontrakt er pinnet. Verkstedkategori og kontrollorgankategori må skilles.

### Statens vegvesen – Parkeringsregisteret
Åpent offisielt JSON-endepunkt er verifisert. Alle tilbydere av vilkårsparkering skal registreres. Runtime venter på parser, virksomhets-/område-match og historisk relevans.

### DSB – Elvirksomhetsregisteret
Autoritativ kilde med offentlig søk og eksport. Fremtidig kontroll må matche relevante arbeidsoppgaver/anleggstyper; et hvilket som helst foretakstreff er utilstrekkelig. Ingen skjult scraping skal brukes.

### Reisegarantifondet
Offentlig medlemsliste finnes og kan søkes på foretaksnavn/org.nr. Stabil maskin-API er ikke verifisert. Ikke automatiser via scraping.

### F-gass
Gjeldende norsk regime bygger fortsatt på det gjennomførte tidligere EU-regelverket. Forordning (EU) 2024/573 er per 20.08.2026 ikke innlemmet i EØS-avtalen. Egen overgangsvakt skal stanse f-gass-konklusjoner når statusen endres til norsk ikraftsetting er manuelt kontrollert.

## Automatisk juridisk vedlikehold
`legal-source-check.mjs` skal:
- kontrollere aktive runtime-regler og runtime-kandidater,
- automatisk oppdage alle `rules/*-candidates.json`,
- kreve `runtime:false`, `purpose:preactivation_only`, unike ID-er og dokumenterte aktiveringsvilkår,
- overvåke hver kandidat mot kilden,
- overvåke dato-versjonerte satser,
- overvåke lovoverganger/ikrafttredelser,
- feile hele kontrollen dersom en nødvendig kilde, frase eller overgang ikke lenger kan verifiseres.

Dette hindrer at et nytt juridisk kandidatregister legges til uten å bli overvåket.

## Aktiveringsstandard
En regel kan bare flyttes til `active` når:
1. gjeldende primærkilde og ikrafttredelse er verifisert,
2. virkeområde/sakstype er eksplisitt,
3. nødvendige faktiske vilkår kan hentes fra dokument, register eller eksplisitt brukeravklaring uten gjetting,
4. fravær av bevis ikke behandles som negativt bevis,
5. positiv og relevante negative kjent-fasit-tester finnes,
6. grenseflater mot andre lover er testet,
7. kundeformuleringen skiller dokumentfunn fra rettslig betydning,
8. dato-/overgangsregler er modellert der relevant,
9. eventuell registerkilde er offisiell, fersk og entydig matchet.

## Unikhetsprinsipp
Fakturasjekks konkurransefortrinn skal ikke være «AI som kan juss». Det skal være en etterprøvbar norsk kontrollkjede:

`dokument → kilde/proveniens → sakstype → regelvilkår → primærkilde → datert regel-/satsversjon → registerfakta → kontrollert funn → dekningsforklaring → kundesikkert svarutkast`

Resultatet skal kunne vise hva som faktisk ble kontrollert, hvilken kilde/versjon som gjaldt, og hva systemet ikke kunne avgjøre.

## Åpne juridiske/tekniske porter før bred live-bruk
1. Flytt maskinell rettskildesynk mot Lovdatas gratis API/NLOD som primær synk, med phrase/hash-fallback.
2. Integrer `legal-rates.mjs` i MVA-/rente-/inkassoberegninger når nødvendige dokumentdatoer og kategorier foreligger.
3. Implementer renholdsregister XML/XSD-adapter.
4. Verifiser stabil direkte maskinkilde/kontrakt for DSB og Vegvesen verksted før negativ registerkonklusjon.
5. Implementer Finanstilsynet- og parkeringsregisteradaptere bare med eksplisitt aktivitet/type-mapping.
6. Aktiver FIN § 2-4, HTJL § 37, FKJL §§ 38/41 og angrerettspor først når faktagrunnlaget kan dokumenteres sikkert.
7. Fortsett automatisk overvåking av ny inkassolov og f-gass EØS-overgang.
8. Gjennomfør uavhengig norsk jurist/advokat-review av aktive kundetekster før bred markedsføring. Dette er defense-in-depth, ikke en erstatning for automatisert kildevakt.
