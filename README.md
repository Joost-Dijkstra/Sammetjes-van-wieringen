# Sammeltjes van Wieringen

Mobiele locatiegame met Leaflet, OpenStreetMap, radar, Sammeltjesboek en een verborgen adminpagina.

## Lokaal draaien

```powershell
cd "E:\eigen apps\sammeltjes app\sammeltjes-wieringen"
python dev-server.py
```

Daarna:

- app: `http://127.0.0.1:4173/index.html`
- admin: `http://127.0.0.1:4173/admin.html`

## Telefoon / PWA

Als deze site via HTTPS wordt gehost, kun je hem op je telefoon installeren via:

- iPhone/iPad: Deel > Zet op beginscherm
- Android Chrome: menu > App installeren / Toevoegen aan startscherm

## Admin

De adminpagina gebruikt lokaal het wachtwoord:

`sammeltjesdev`

Op statische hosting werkt de admin als viewer/editor in de browser, maar direct opslaan naar `data/sammeltjes.json` werkt alleen lokaal via `dev-server.py`.
