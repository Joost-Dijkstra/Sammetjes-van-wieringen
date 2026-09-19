# Sammeltjes van Wieringen

Een rustige locatiegame op Wieringen: ontdek Sammeltjes en ontmoet ze later opnieuw als bekende vriendjes.

## Starten

- Dubbelklik op `start-sammeltjes.cmd` voor de lokale game.
- Dubbelklik op `start-admin.bat` voor de werkplaats.
- De server start op de achtergrond. Een bestaande server wordt hergebruikt.
- Lokaal wachtwoord: `sammeltjesdev`.
- Game: http://127.0.0.1:4173/index.html
- Werkplaats: http://127.0.0.1:4173/admin.html
- Website: https://joost-dijkstra.github.io/Sammetjes-van-wieringen/

De werkplaats werkt alleen op je computer. Het wachtwoord is een lokaal toegangsscherm, geen beveiliging voor een openbare website. Er staan geen GitHub-sleutels in de browsercode.

Voor starten zijn Node.js en Python 3 nodig. Het startscript zoekt automatisch naar Python via `py`, `python` en, indien aanwezig, de lokale Codex-runtime. Een afwijkende Python-installatie kan via de omgevingsvariabele `SAMMELTJES_PYTHON` worden ingesteld.

Bij startproblemen staat de melding in `output/server.log`. Als een oude server nog op poort 4173 draait, sluit die eerst af. Handmatig starten met zichtbare meldingen kan via `npm start`.

## Spelen

Je kaart verschuift niet automatisch. **Mijn locatie** brengt je terug naar je positie.

Een signaal verschijnt binnen 300 meter. Binnen 60 meter zie je het Sammeltje en zijn reactie. Binnen 20 meter kies je zelf **Kennismaken**. Het vriendje krijgt een plek in je boek. Bij een volgende ontmoeting kun je het **Begroeten**; de verzameling telt het maar eenmaal.

De echte spelmodus wacht op een recente GPS-positie met een gemelde nauwkeurigheid van maximaal 50 meter. De kaart is noordgericht. Bij wisselende GPS kan de gemeten afstand afwijken van de werkelijke afstand.

Thuis testen kan op de lokale game: open het bovenste paneel, kies **Thuis uitproberen** en zet **Demo besturen** aan. Gebruik de pijltjestoetsen of klik op de kaart. **Toon alles** is eveneens een lokale testoptie.

De verzameling blijft op dit toestel in de browser bewaard, zonder account. Oude vondsten behouden hun plek; alleen nieuwe vondsten krijgen een vinddatum. Het wissen van browsergegevens wist ook deze lokale voortgang.

Het Sammeltjesboek toont je gevonden vriendjes eerst. Met **Gevonden** bekijk je alleen je eigen verzameling; **Alle vriendjes** toont ook de nog onbekende bewoners. Tik op een gevonden kaartje voor de volledige afbeelding en het verhaal. De kleuren en kleine tekeningen op de kaartjes verwijzen naar hun leefomgeving.

## Bekende Gezichtjes

Bekende Sammeltjes begroeten je persoonlijk wanneer je ze van dichtbij opent. Hun reactie past bij nieuwsgierig, bang of verlegen gedrag. De gewone beschrijving blijft in het Sammeltjesboek staan. De herkenning gebruikt je bestaande verzameling, zonder nieuwe accounts, bezoektellers of opgeslagen wandelroutes.

Een afgerond verzoekje wordt door zowel de gever als de ontvanger onthouden. Op de bezorgdag bedanken ze je voor het voorwerp; vanaf een volgende Nederlandse kalenderdag kan er een klein vervolgverhaaltje verschijnen. De meest recente eigen bezorging krijgt voorrang. Oude groeten blijven gewone groeten en onafgemaakte verzoekjes leveren geen verzonnen herinnering op. Dit geeft geen extra stempels en verplicht je niet om terug te komen.

Op de kaart kan binnen 60 meter een kort ballonnetje verschijnen met een zwaai, knikje of voorzichtige blik. Eerst moet het vriendje 1,5 seconde in beeld blijven. Er is hooguit een ballonnetje tegelijk, 5,5 seconden lang, daarna minstens 25 seconden rust; hetzelfde vriendje reageert hooguit eens per twee minuten in een sessie. Bedieningselementen worden vermeden. Bij geen bruikbare GPS, buiten beeld/bereik, slapen, een ontmoeting of een ander scherm verdwijnen reacties. De kaart verplaatst hiervoor niet. De systeemvoorkeur voor minder beweging schakelt de animaties uit.

Begroetingen, vijftien vervolgverhalen en reactietiming staan in `companion-personality.js`. Ze werken lokaal en offline en veranderen geen locaties, gedragssnelheden of voortgang.

## Kleine Verzoekjes

Het aparte radarscherm en de afstandscirkels op de speelkaart zijn vervangen door **Verzoekjes**. De bestaande ontmoetingsafstanden en gedragsregels blijven hetzelfde. De technische proefwandeling in de admin houdt zijn bereikcirkel.

Begroet een bekend vriendje van dichtbij. Vijftien bewoners hebben een persoonlijk verzoekje: bijvoorbeeld geleende breinaalden terugbrengen naar Oma, of een armbandje bezorgen namens Havenpluimpje. De andere bewoners houden hun vertrouwde groeten. Zowel gever als ontvanger moeten bekend, actief en wakker zijn bij het aanbieden. Kies **Ik help je** om het aan te nemen. Er is maximaal een actief verzoekje, zonder tijdslimiet. Alles is denkbeeldig: neem niets mee uit de natuur.

Geleende spullen en vaste cadeaus hebben een vaste ontvanger. Wisselcadeautjes kiezen de dichtstbijzijnde geschikte ontvanger uit een kleine lijst, normaal binnen 1,5 km. Akkervonk heeft 2 km en de afgelegen Opa 3 km bereik. Vaste verhalen kunnen verder weg gaan: Molenmaatjes windboek gaat bijvoorbeeld circa 9 km hemelsbreed naar Opa. De afstand staat vooraf bij het verzoekje; wandelen kan langer zijn. **Bekijk de woonplek** verplaatst alleen de kaart, nooit je speler. Dit is geen routeplanner; blijf op openbare paden.

Ga naar het andere vriendje, kies **Begroeten** en bevestig de ontmoeting. Alleen binnen 20 meter en met bruikbare GPS (of lokale demo) telt de bezorging. Je krijgt meteen een persoonlijk bedankje, een verhaaltje en een vriendschapsstempel bij Verzoekjes. Het bedankje blijft bij die stempel leesbaar. Per vragend Sammeltje kun je eenmaal een stempel verdienen, ook als je eerder al een gewone groet hebt bezorgd: geen dagelijkse druk of eindeloos dezelfde opdracht.

Slapende vriendjes wachten tot een later bezoek. Verwijderde of uitgeschakelde vriendjes worden duidelijk gemeld. Je kunt een verzoekje altijd zonder straf teruggeven. Verzoekjes en stempels blijven lokaal op dit toestel bewaard, apart van je bestaande verzameling. Oude actieve groeten blijven groeten; oude stempels worden niet omgeschreven of gewist.

De persoonlijke teksten, vaste ontvangers en ontvangerlijsten staan in `request-stories.js`; de selectieregels, migratie en oude leefgebiedverhalen in `friend-requests.js`. De getekende voorwerpen staan in `assets/request-items.svg`. Deze bestanden werken ook offline na een eerste online bezoek. Er zijn geen nieuwe afhankelijkheden toegevoegd. De videoproef blijft geparkeerd.

## Gedrag Aanpassen

1. Kies bovenaan de werkplaats een Sammeltje. Standaard zie je alleen dat vriendje; **Toon alle Sammeltjes** geeft het overzicht.
2. Open **Karakter**, **Woonplek**, **Dagritme** of **Afbeelding en verhaal**.
3. Gebruik **Gedrag uitproberen** om een proefwandeling te starten. Klik op de kaart om de testspeler te verplaatsen en stel de Nederlandse tijd in. Pauzeer, begin opnieuw of stop het voorbeeld.
4. Klik op **Opslaan op computer** wanneer je tevreden bent.
5. Klik op **Publiceren naar telefoonapp**, controleer het wijzigingsoverzicht en publiceer.

**Nieuwsgierig** komt naar je toe en wacht op circa 12 meter. **Bang** wijkt 3 seconden uit en rust 6 seconden. **Verlegen** stopt zodra je binnen 60 meter komt. Een vriendje op een vaste plek beweegt niet; de bijbehorende instellingen zijn daarom uitgeschakeld.

De woonradius is 50-500 meter. Gewoon klikken voegt niets toe: gebruik daarvoor **Nieuw Sammeltje**. Verplaatsen kan door slepen of met **Verplaats naar**. **Ongedaan maken** herstelt eerdere bewerkingen in deze sessie.

Bestaande tijdschema's blijven behouden. Nieuwe dagbewoners krijgen 09.00-23.00 uur. Eigen tijden kunnen over middernacht lopen; gelijke begin- en eindtijd betekent 24 uur. Willekeurige uren passen volledig in het gekozen venster en liggen voor die Nederlandse kalenderdag vast.

Beweging en dagritme komen uit `game-rules.js`; zowel de game als de proefwandeling gebruiken deze regels. `terrain.js` gebruikt dezelfde terreindetectie in beide schermen. Bij ontbrekende terreingegevens wordt alleen de eilandgrens gecontroleerd. De status **basis** in de voorvertoning maakt deze beperking zichtbaar. Er is geen volledige routeplanner.

## Opslag En Publicatie

**Opslaan op computer** schrijft naar `data/sammeltjes.json`. Voor iedere opslag komt een herstelkopie in `.backups`. Een ongeldige invoer of gelijktijdige wijziging uit een andere werkplaats wordt geweigerd. Bij een conflict kun je eerst je eigen bewerkingen exporteren.

**Exporteer JSON** is een aparte download. **Import JSON** controleert het bestand voordat de huidige lijst wordt vervangen. Een herstelkopie uit `.backups` kun je ook via Import JSON terughalen, controleren en opnieuw opslaan.

**Publiceren naar telefoonapp** gebruikt je bestaande GitHub-aanmelding via Git en publiceert uitsluitend de opgeslagen Sammeltjesgegevens naar de `main`-branch. Dat gebeurt in een tijdelijke werkkopie. Andere lokale bestanden en je Git-index worden niet meegenomen of gewijzigd. De lokale branch wordt hierbij niet automatisch verplaatst naar de publicatiecommit; haal voor latere codepublicaties eerst de nieuwste GitHub-versie op.

Nieuwe spelcode en nieuwe afbeeldingen worden met een volledige appupdate gepubliceerd. De gegevensknop controleert of de benodigde spelregels en afbeeldingen al online staan.

De melding **Online beschikbaar** verschijnt pas nadat de openbare website dezelfde gegevens teruggeeft. Bij een onderbroken verbinding wordt geen succes gemeld. Als GitHub langer nodig heeft, kun je later via dezelfde knop opnieuw controleren; ongewijzigde gegevens maken geen extra commit.

## Bouwen En Testen

Eenmalig:

```powershell
npm install
npx playwright install chromium
```

Alles controleren:

```powershell
npm run check
```

Afzonderlijke controles:

```powershell
npm run validate
npm run test:rules
npm run test:server
npm run test:e2e
```

Op een computer met Chrome kun je ook testen zonder een aparte Chromium-installatie:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
npm run test:e2e
```

Playwright gebruikt poort 4174 en een aparte gegevenskopie onder `test-results`. De tests gebruiken vaste tijdstippen en lokaal nagebootste kaart- en terreinantwoorden. Publicatietests werken uitsluitend met een tijdelijke lokale Git-repository. Tests veranderen nooit de echte Sammeltjesdata of de openbare website.

Bij fouten zijn screenshots en traces beschikbaar. Video is optioneel via `PLAYWRIGHT_VIDEO=1` en vereist de bijbehorende Playwright-videoondersteuning.

`npm run build` maakt WebP-afbeeldingen, kopieert Leaflet en bouwt Tailwind CSS. Het verandert geen gekozen afbeeldingspaden in de Sammeltjesdata. Gegenereerde afbeeldingen staan onder `assets/sammeltjes-webp`; bronafbeeldingen onder `assets/sammeltjes`.

## Telefoon En Offline

Het app-icoon toont Kwelder Sprietje, met dezelfde prentenboekuitstraling als de game. De bron staat in `assets/icons/sprietje-source.png`. `npm run prepare:icons` maakt de vier kleine PNG-formaten; dit draait ook tijdens de gewone build. Manifest, browsericoon, Apple-touch-icoon en offlinecache gebruiken dezelfde illustratie. De oude iconen blijven als herstelmogelijkheid bewaard. Bestaande beginschermiconen worden door het besturingssysteem beheerd en hoeven niet direct mee te verversen; wis hiervoor geen browsergegevens, want daar staat je verzameling.

Installeer de HTTPS-website via **Zet op beginscherm** (iPhone) of **App installeren** (Android). Na een eerste volledig geladen online bezoek zijn de app en verzameling offline te openen. Alleen eerder bekeken kaarttegels zijn beschikbaar; dit is geen volledige offline eilandkaart.

Test een nieuwe versie ook tijdens een echte wandeling. GPS-gedrag, leesbaarheid in zonlicht en batterijgebruik zijn niet volledig door browsertests te controleren.
