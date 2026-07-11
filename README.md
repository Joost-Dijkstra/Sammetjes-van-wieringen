# Sammeltjes van Wieringen

Mobiele locatiegame met Leaflet, OpenStreetMap, radar, Sammeltjesboek, PWA-ondersteuning en een lokale adminpagina.

## Snel Starten Op Windows

Dubbelklik op `start-sammeltjes.cmd`. De lokale server en de game openen dan automatisch.

Handmatig starten kan ook:

```powershell
cd "E:\eigen apps\sammeltjes app\sammeltjes-wieringen"
python dev-server.py
```

- Game: `http://127.0.0.1:4173/index.html`
- Admin: `http://127.0.0.1:4173/admin.html`
- Lokaal adminwachtwoord: `sammeltjesdev`

De adminpagina is bewust uitgeschakeld op de openbare GitHub Pages-site. Het wachtwoord staat immers in browsercode en is daarom alleen een lokaal toegangsscherm, geen internetbeveiliging. Opslaan via de lokale dev-server schrijft direct naar `data/sammeltjes.json`.

## Installatie En Build

Eenmalig:

```powershell
npm install
npx playwright install chromium
```

Na het toevoegen of vervangen van bronafbeeldingen:

```powershell
npm run build
```

Dit maakt snelle WebP-afbeeldingen, kopieert Leaflet lokaal en bouwt de Tailwind CSS. Bewerk de gegenereerde bestanden in `assets/sammeltjes-webp`, `vendor` en `tailwind.generated.css` niet handmatig.

## Testen

```powershell
npm run validate
npm run test:e2e
```

Of voer build, datacontrole en alle browsertests samen uit:

```powershell
npm run check
```

Playwright gebruikt poort 4174 en schrijft alleen naar `test-results/sammeltjes.test.json`. De echte speldata wordt tijdens tests nooit aangepast.

## Telefoon / PWA

Via HTTPS kan de game als app worden geinstalleerd:

- iPhone/iPad: Deel > Zet op beginscherm
- Android Chrome: menu > App installeren

Na het eerste online bezoek zijn de app, Sammeltjesdata en afbeeldingen offline beschikbaar. Eerder bezochte OpenStreetMap-kaarttegels worden ook tijdelijk bewaard.
