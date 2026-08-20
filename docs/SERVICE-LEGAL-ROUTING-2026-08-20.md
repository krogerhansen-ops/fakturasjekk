# Fakturasjekk – juridisk sakstype- og bransjerevisjon

Dato: 20.08.2026
Status: styrende revisjonsgrunnlag for V1-ruting. Særregler aktiveres ikke automatisk bare fordi de er relevante; de må også ha verifisert kilde og deterministisk aktiveringssti.

## Hovedprinsipp

Fakturasjekk skal ikke velge lov etter firmanavn eller bransje alene. Samme virksomhet kan utstede fakturaer som gjelder forskjellige juridiske forhold.

Korrekt kjede:

`dokumenter → kjøper/partstype → hva ble kjøpt/bestilt → hvorfor tjenesten ble utført → juridisk hovedspor → eventuelle særregler/register → dokumenterte vilkår → kontrollert resultat`

Ved uklar grense mellom to regelsett skal systemet be om én enkel avklaring eller stoppe den juridiske delen. Det skal aldri velge lov ved gjetting.

## Revisjonsmatrise

| Sakstype | Juridisk hovedspor | Viktige tillegg | V1-ruting | Skal ikke antas |
|---|---|---|---|---|
| Vanlig varekjøp / elektronikk | Forbrukerkjøpsloven | Markedsføringsloven, prisopplysningsforskriften, bokføringsforskriften | `goods` | Montering betyr ikke automatisk håndverkertjeneste. Kredittkostnader betyr ikke vanlig varefaktura. |
| Vare med montering | Avhenger av avtalen samlet | HTJL § 2-grensen mot kjøp | Avklar kjøpsdominert vs selvstendig tjeneste ved tvil | Ikke splitt kunstig i vare + håndverk hvis avtalen samlet er et kjøp. |
| Vanlig betalt bilservice/reparasjon | Håndverkertjenesteloven | Verkstedforskriften, prisopplysningsforskriften, bokføringsforskriften | `vehicle_repair` | Verkstedgodkjenning og rett til fakturert tillegg er to forskjellige kontrollspørsmål. |
| Bil – reklamasjon/garanti etter kjøp | Kan være forbrukerkjøpsloven som selgers avhjelp | Garanti, verkstedforskriften | Stopp vanlig HTJL-analyse og avklar | Ikke bruk vanlig verkstedpakke bare fordi bilen fysisk står på verksted. |
| EU-kontroll / PKK | Forskrift om periodisk kontroll av kjøretøy | Prisopplysning, formalia, kontrollorgan-register | `vehicle_inspection` | Vanlig verkstedgodkjenning er ikke bevis for godkjent PKK-kontrollorgan. |
| Omfattende skadereparasjon | Håndverkertjenesteloven | Verkstedforskriften, særlig § 14a når vilkårene er oppfylt | `vehicle_repair` + skadespor | § 14a skal ikke brukes på vanlig service/reparasjon. |
| Elektriker | Håndverkertjenesteloven | FEK, FEL, DSB Elvirksomhetsregister | `electrical_work` | Prisavvik og manglende el-godkjenning/samsvar er forskjellige funn. |
| Rørlegger/VVS | Håndverkertjenesteloven | TEK17 ved relevante vann-/avløpsarbeider | `plumbing_vvs` | Manglende sentral godkjenning er ikke i seg selv lovbrudd; ordningen er frivillig. |
| Tømrer/maler/murer/oppussing | Håndverkertjenesteloven | Relevante byggeregler ved konkret teknisk spørsmål | `home_handcraft` | Nybygg/full ombygging skal ikke presses inn i HTJL. |
| Ny bolig/full ombygging | Bustadoppføringslova | Byggeregler | Ikke støttet V1 – stopp før analyse | Ikke bruk ordinær håndverkertjenestelov på nyoppføring/full ombygging. |
| Flytting | Avtalen mellom partene | Prisopplysningsforskriften, markedsføringsloven, bokføringsforskriften | `moving_service` | Håndverkertjenesteloven gjelder ikke; vegfraktloven gjelder uttrykkelig ikke flyttegods. |
| Renhold/flyttevask | Avtalen mellom partene | Prisopplysning, markedsføringsloven, offentlig godkjenning av renholdsvirksomheter | `cleaning_service` | Ingen generell håndverkertjenestelov skal antas. Registerstatus er separat fra om fakturabeløpet er riktig. |
| Selvstendig montering/installasjon | Håndverkertjenesteloven når tjenesten er det dominerende | Prisopplysning/formalia + eventuelle fagregler | `installation_service` | Hvis avtalen samlet er varekjøp, må den rutes til varekjøp. |
| Varmepumpe | Håndverkertjenesteloven for installasjonstjenesten | F-gasskrav når relevant, elregelverk når relevant | `heat_pump_installation` | Ikke alle varmepumpeoppdrag utløser samme fagkrav; sertifikatstatus må bevises separat. |
| Annen forbrukertjeneste | Avtalen mellom partene | Prisopplysningsforskriften, markedsføringsloven, bokføringsforskriften | `other_service` | Norge har ikke én generell håndverkertjenestelov for alle tjenester. |
| Kjøp med kreditt/finansiering | Finansavtaleloven for kredittdelen | Forbrukerkjøpsloven for selve varen | Stopp/avklar før ordinær pakke | Renter/gebyrer i kredittavtalen skal ikke vurderes kun med varekjøpsregler. |
| Purring/inkasso | Gjeldende inkassolov + relevante kostnads-/renteregler | Underliggende hovedkrav holdes separat | Inkasso-overlay | Feil ved inkasso betyr ikke automatisk at hovedkravet faller bort. |

## Verifiserte grenseflater

### Håndverkertjenesteloven

Lovdata: https://lovdata.no/lov/1989-06-16-63

§§ 1–2 viser hvorfor ordinær reparasjon, vedlikehold og arbeid på ting/fast eiendom omfattes, men også hvorfor arbeid som inngår i en avtale som samlet må regnes som kjøp faller utenfor. Dette er avgjørende for bilverksted, oppussing og varer med montering.

### Bilverksted og PKK

Verkstedforskriften: https://lovdata.no/forskrift/2020-10-28-2170
Statens vegvesen: https://www.vegvesen.no/kjoretoy/eie-og-vedlikeholde/finn-godkjent-verksted/
PKK-forskriften: https://lovdata.no/forskrift/2009-05-13-591

Vanlig betalt reparasjon kan bruke HTJL som kontrakts-/prisgrunnlag. Verkstedforskriften regulerer godkjenning/arbeid på kjøretøy. PKK har egen godkjenningsordning for kontrollorgan og får egen pakke. Reparasjon som er selgers avhjelp etter et bilkjøp skal ikke automatisk behandles som en ny ordinær verkstedtjeneste.

### Elektriker

FEK § 3: https://lovdata.no/forskrift/2013-06-19-739/%C2%A73
FEL § 12: https://lovdata.no/forskrift/1998-11-06-1060/%C2%A712
DSB-register: https://elvirksomhetsregisteret.dsb.no/

Registrering, arbeidsområde og samsvarsdokumentasjon er egne kontrollspor. Fakturasjekk skal ikke bruke manglende registertreff som negativt bevis før maskinkilden og virksomhetsmatchen er verifisert.

### Rørlegger/VVS

TEK17 § 15-5: https://lovdata.no/forskrift/2017-06-19-840/%C2%A715-5
TEK17 § 15-6: https://lovdata.no/forskrift/2017-06-19-840/%C2%A715-6
DIBK om sentral godkjenning: https://www.dibk.no/sentral-godkjenning/hva-er-sentral-godkjenning

TEK17 kan være relevant ved konkrete spørsmål om utførelse av vann-/avløpsinstallasjoner. Sentral godkjenning er frivillig og skal ikke bygges som obligatorisk rørleggerregister.

### Flytting

Forbrukerrådet: https://www.forbrukerradet.no/forside/bolig/flyttebyra/
Vegfraktloven § 2: https://lovdata.no/lov/1974-12-20-68/%C2%A72

Forbrukerrådet opplyser uttrykkelig at håndverkertjenesteloven ikke gjelder flytting. Vegfraktloven unntar flyttegods. Derfor blir avtalen, pristilbudet og generelle pris-/markedsføringsregler særlig viktige.

### Renhold

Gjeldende forskrift § 17: https://lovdata.no/forskrift/2012-05-08-408/%C2%A717
Arbeidstilsynets register: https://www.arbeidstilsynet.no/godkjenninger/renholdsregisteret/

Gjeldende konsoliderte § 17 krever at kjøpet skjer fra virksomhet med en tillatt registerstatus. Eldre tekster som inneholdt et privatforbruker-unntak skal ikke brukes. Automatisk registerkontroll holdes stengt til offisiell maskinkilde er verifisert.

### Varmepumpe / f-gass

Miljødirektoratet: https://www.miljodirektoratet.no/ansvarsomrader/klima/for-naringsliv/f-gasser/sertifisering/

Fastmonterte kulde-/klimaanlegg og varmepumper kan kreve sertifisert personell og bedrift. Operativ sertifikatkontroll skjer gjennom utpekte sertifiseringsorgan; Fakturasjekk skal ikke gi negativt registerfunn før en autoritativ og stabil oppslagsvei er godkjent.

### Nybygg/full ombygging

Bustadoppføringslova § 1: https://lovdata.no/lov/1997-06-13-43/%C2%A71

Ny eigarbustad og full ombygging hører til eget regelspor og er fortsatt stoppet i V1.

## Aktivering av særregler

Denne revisjonen skiller tre nivåer:

1. **Aktiv kontrakts-/fakturaregel** – kontrollert rettskilde + deterministisk positiv testcase.
2. **Kandidat/særregel** – rettskilden er relevant, men Fakturasjekk mangler ennå en trygg dokument-/registerbetingelse for automatisk kundebruk.
3. **Registerspor forberedt, ikke live** – offisiell kilde er kjent, men maskinkilde/matching/ferskhet er ikke produksjonsverifisert.

Ingen kandidat eller ikke-live registerkontroll skal presenteres som et sikkert kundefunn.

## Neste juridiske kandidatspor

Følgende bør kildeverifiseres og registreres som kandidater før eventuell senere aktivering:

- FEK § 3 – registreringsplikt for elvirksomheter.
- FEL § 12 – kontroll, samsvarserklæring og dokumentasjon.
- Verkstedforskriften § 3 – arbeid som krever godkjent verksted.
- PKK-forskriften § 2 – godkjent kontrollorgan.
- Forbrukerkjøpsloven § 30 – kostnad ved undersøkelse/reparasjon når reklamasjon ikke viser mangel.
- Renholdsforskriften § 17 – lovlig kjøpsstatus i renholdsregisteret.
- TEK17 §§ 15-5 og 15-6 – kun ved konkrete tekniske VVS-fakta.
- Relevant f-gassbestemmelse – først etter kontroll av norsk gjennomføring, virkeområde og sertifikatoppslag.
- Angrerettregler – som eget kontraktsinngåelses-overlay når Fakturasjekk kan dokumentere at avtalen ble inngått ved fjernsalg/utenom faste lokaler.
- Finansavtaleloven – eget fremtidig kreditt-/finansieringsspor.

Dette dokumentet gir ikke i seg selv kandidatene kundestatus. `rules/rules.json` er fortsatt runtime-fasiten.
