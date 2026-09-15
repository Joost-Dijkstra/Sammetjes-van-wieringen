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

De echte spelmodus wacht op een recente GPS-positie met een gemelde nauwkeurigheid van maximaal 50 meter. Kaart en radar zijn noordgericht. Bij wisselende GPS kan de gemeten afstand afwijken van de werkelijke afstand.

Thuis testen kan op de lokale game: open het bovenste paneel, kies **Thuis uitproberen** en zet **Demo besturen** aan. Gebruik de pijltjestoetsen of klik op de kaart. **Toon alles** is eveneens een lokale testoptie.

De verzameling blijft op dit toestel in de browser bewaard, zonder account. Oude vondsten behouden hun plek; alleen nieuwe vondsten krijgen een vinddatum. Het wissen van browsergegevens wist ook deze lokale voortgang.

Het Sammeltjesboek toont je gevonden vriendjes eerst. Met **Gevonden** bekijk je alleen je eigen verzameling; **Alle vriendjes** toont ook de nog onbekende bewoners. Tik op een gevonden kaartje voor de volledige afbeelding en het verhaal. De kleuren en kleine tekeningen op de kaartjes verwijzen naar hun leefomgeving.

## Gedrag Aanpassen

1. Kies bovenaan de werkplaats een Sammeltje. Standaard zie je alleen dat vriendje; **Toon alle Sammeltjes** geeft het overzicht.
2. Open **Karakter**, **Woonplek**, **Dagritme** of **Afbeelding en verhaal**.
3. Gebruik **Gedrag uitproberen** om een proefwandeling te starten. Klik op de kaart om de testspeler te verplaatsen en stel de Nederlandse tijd in. Pauzeer, begin opnieuw of stop het voorbeeld.
4. Klik op **Opslaan op computer** wanneer je tevreden bent.
5. Klik op **Publiceren naar telefoonapp**, controleer het wijzigingsoverzicht en publiceer.

**Nieuwsgierig** komt naar je toe en wacht op circa 12 meter. **Bang** wijkt 3 seconden uit en rust 6 seconden. **Verlegen** stopt zodra je binnen de radar komt. Een vriendje op een vaste plek beweegt niet; de bijbehorende instellingen zijn daarom uitgeschakeld.

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

Installeer de HTTPS-website via **Zet op beginscherm** (iPhone) of **App installeren** (Android). Na een eerste volledig geladen online bezoek zijn de app en verzameling offline te openen. Alleen eerder bekeken kaarttegels zijn beschikbaar; dit is geen volledige offline eilandkaart.

Test een nieuwe versie ook tijdens een echte wandeling. GPS-gedrag, leesbaarheid in zonlicht en batterijgebruik zijn niet volledig door browsertests te controleren.
