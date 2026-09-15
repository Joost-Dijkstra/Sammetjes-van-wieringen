const { test, expect } = require("@playwright/test");
const home = { lat: 52.934371, lng: 5.026314 };
const transparent = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCq0AAAAASUVORK5CYII=", "base64");
test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post("/api/reset-sammeltjes")).ok()).toBeTruthy();
  await context.route(/https:\/\/.*tile\.openstreetmap\.org\//, (route) => route.fulfill({ contentType: "image/png", body: transparent }));
  await context.route(/https:\/\/overpass[^/]*\//, (route) => route.fulfill({ json: { elements: [
    { tags: { landuse: "grass" }, geometry: [{lat:52.88,lon:4.90},{lat:52.95,lon:4.90},{lat:52.95,lon:5.06},{lat:52.88,lon:5.06},{lat:52.88,lon:4.90}] }
  ] } }));
  await page.clock.setFixedTime(new Date("2026-09-15T17:00:00Z"));
});
function errorsFor(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\.(js|css|webp|png)(\?|$)/.test(response.url()) && new URL(response.url()).hostname === "127.0.0.1") errors.push(`Asset ontbreekt: ${response.url()} (${response.status()})`);
  });
  return errors;
}
async function game(page, near = false) {
  await page.goto("/index.html?e2e=1");
  await page.waitForFunction(() => Boolean(window.__SAMMELTJES_TEST_API__));
  if (near) await page.evaluate((point) => {
    const api = window.__SAMMELTJES_TEST_API__;
    api.setDemoMode(true); api.setPlayerPosition(point.lat, point.lng); api.setMapCenter(point.lat, point.lng, 17);
  }, home);
}
async function admin(page) {
  await page.goto("/admin.html?e2e=1");
  await page.getByTestId("admin-password-input").fill("sammeltjesdev");
  await page.getByRole("button", {name:"Open admin",exact:true}).click();
  await page.waitForFunction(() => Boolean(window.__SAMMELTJES_ADMIN_TEST_API__));
}
async function openDetails(page, title) {
  const summary = page.locator("summary").filter({hasText: new RegExp("^" + title + "$")});
  if (!(await summary.locator("..").getAttribute("open"))) {
    const isOpen = await summary.evaluate((node) => node.parentElement.open);
    if (!isOpen) await summary.click();
  }
}
test("Rustig kennismaken, verzamelen en hetzelfde vriendje weer begroeten", async ({page}) => {
  const errors = errorsFor(page);
  await game(page, true);
  await expect(page.getByTestId("game-map")).toBeVisible();
  await expect(page.getByTestId("discovery-modal")).toBeHidden();
  await page.getByTestId("encounter-btn").click();
  await expect(page.locator("#discovery-name")).toHaveText("Molenmaatje");
  await page.getByRole("button", {name:"Toevoegen aan Sammeltjesboek",exact:true}).click();
  await expect(page.getByTestId("entity-marker-molenmaatje")).toBeVisible();
  await expect(page.getByTestId("encounter-btn")).toHaveText("Begroeten");
  await page.getByTestId("encounter-btn").click();
  await page.getByRole("button", {name:"Fijn je weer te zien",exact:true}).click();
  await page.locator('[data-view="book"]').click();
  await page.locator('[data-book-open="molenmaatje"]').click();
  await expect(page.getByTestId("book-detail-modal")).toBeVisible();
  await expect(page.locator("#book-detail-date")).toContainText("Vriendjes sinds");
  expect(await page.locator("#book-detail-image").evaluate((img) => img.complete && img.naturalWidth > 0)).toBeTruthy();
  await page.reload();
  await page.locator('[data-view="book"]').click();
  await expect(page.locator('[data-book-open="molenmaatje"]')).toBeVisible();
  expect(errors).toEqual([]);
});
test("Zonder bruikbare GPS begint geen ontmoeting", async ({page}) => {
  await game(page);
  await expect(page.getByTestId("encounter-btn")).toBeHidden();
  await expect(page.getByTestId("discovery-modal")).toBeHidden();
  await expect(page.locator("#nearby-message")).toContainText("locatie");
});
test("Werkplaats toont een geselecteerd vriendje en kan alle vriendjes tonen", async ({page}) => {
  const errors = errorsFor(page);
  await admin(page);
  await expect(page.getByTestId("admin-item-selector").locator("option")).toHaveCount(20);
  await expect(page.locator(".admin-companion")).toHaveCount(1);
  await page.locator("#show-all").check();
  await expect(page.locator(".admin-companion")).toHaveCount(20);
  await page.locator("#show-all").uncheck();
  await expect(page.locator(".admin-companion")).toHaveCount(1);
  await expect(page.locator("#field-behavior")).toBeDisabled();
  expect(errors).toEqual([]);
});
test("Instellingen opslaan heeft effect in de game", async ({page}) => {
  await admin(page);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  await page.locator("#field-behavior").selectOption("scared");
  await page.locator("#field-speed-kmh").fill("1.2");
  await openDetails(page, "Woonplek");
  await page.locator("#field-radius").fill("155");
  await page.getByTestId("admin-save-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("Opgeslagen op computer");
  await game(page);
  const entity = await page.evaluate(() => window.__SAMMELTJES_TEST_API__.getEntitySnapshot("rietritter"));
  expect(entity.radius).toBe(155); expect(entity.behavior).toBe("scared"); expect(entity.speedKmh).toBe(1.2);
});
test("Verplaatsen naar werkt herhaald en een gewone kaartklik voegt niets toe", async ({page}) => {
  await admin(page);
  await openDetails(page, "Woonplek");
  for (const target of [{lat:52.9,lng:4.997},{lat:52.916,lng:5.03},{lat:52.91,lng:4.97}]) {
    await page.locator("#field-relocate").check();
    await expect(page.getByTestId("admin-map-mode-label")).toContainText("Verplaatsmodus actief");
    const point = await page.evaluate(({lat,lng}) => window.__SAMMELTJES_ADMIN_TEST_API__.getMapContainerPoint(lat,lng), target);
    await page.getByTestId("admin-map").click({position: point});
    await expect(page.locator("#field-relocate")).not.toBeChecked();
    expect(Number(await page.locator("#field-lat").inputValue())).toBeCloseTo(target.lat, 3);
  }
  const point = await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.getMapContainerPoint(52.905,4.98));
  await page.getByTestId("admin-map").click({position: point});
  await expect(page.getByTestId("admin-item-selector").locator("option")).toHaveCount(20);
});
test("Slepen gebruikt een ononderbroken sleepbeweging", async ({page}) => {
  await admin(page);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  const marker = page.getByTestId("admin-marker-rietritter");
  const box = await marker.boundingBox();
  const before = await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.getSelectedItem());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2, {steps:15}); await page.mouse.up();
  const after = await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.getSelectedItem());
  expect(after.lng).toBeGreaterThan(before.lng + .001);
  await page.locator("#undo-btn").click();
  expect((await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.getSelectedItem())).lng).toBe(before.lng);
});
test("Proefwandeling toont gedrag zonder de woonplek te veranderen", async ({page}) => {
  const errors = errorsFor(page);
  await admin(page);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  const homeBefore = await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.getSelectedItem());
  await openDetails(page, "Gedrag uitproberen");
  await page.locator("#preview-start").click();
  const result = await page.evaluate(() => {
    const api = window.__SAMMELTJES_ADMIN_TEST_API__;
    const before = api.getPreview();
    for (let i=0;i<50;i++) api.stepPreview(.2);
    return {before, after:api.getPreview(), saved:api.getSelectedItem()};
  });
  expect(result.after.currentLng).toBeGreaterThan(result.before.currentLng);
  expect(result.saved.lat).toBe(homeBefore.lat); expect(result.saved.lng).toBe(homeBefore.lng);
  await expect(page.locator("#preview-state")).toContainText("loopt naar je toe");
  await page.locator("#preview-stop").click();
  await expect(page.locator("#preview-overlay")).toBeHidden();
  expect(errors).toEqual([]);
});
test("Dagritme aanpassen maakt het vriendje op het gekozen tijdstip slapend", async ({page}) => {
  await admin(page);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  await openDetails(page,"Dagritme");
  await page.locator("#field-availability-mode").selectOption("schedule");
  await page.locator("#field-active-from").fill("09:00"); await page.locator("#field-active-until").fill("18:00");
  await page.getByTestId("admin-save-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("Opgeslagen op computer");
  await game(page);
  const entity = await page.evaluate(() => {
    const api=window.__SAMMELTJES_TEST_API__; api.setDemoMode(true); api.setPlayerPosition(52.9204,4.9821); return api.getEntitySnapshot("rietritter");
  });
  expect(entity.availableNow).toBe(false); expect(entity.markerVisible).toBe(false);
});
test("Ongeldige import en opslaan verliezen de bestaande gegevens niet", async ({page,request}) => {
  await admin(page);
  await page.locator("#import-input").setInputFiles({name:"broken.json",mimeType:"application/json",buffer:Buffer.from("{broken")});
  await expect(page.getByTestId("admin-load-status")).toContainText("Import niet uitgevoerd");
  await expect(page.getByTestId("admin-item-selector").locator("option")).toHaveCount(20);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  await page.locator("#field-speed-kmh").fill("99");
  await page.getByTestId("admin-save-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("0-15");
  const saved = await (await request.get("/data/sammeltjes.json")).json();
  expect(saved.find((item)=>item.id==="rietritter").speedKmh).toBe(2.8);
});
test("Twee werkplaatsen overschrijven elkaar niet", async ({page,context}) => {
  await admin(page);
  const second=await context.newPage(); await admin(second);
  await page.getByTestId("admin-item-selector").selectOption("rietritter");
  await page.locator("#field-speed-kmh").fill("1.5"); await page.getByTestId("admin-save-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("Opgeslagen op computer");
  await second.getByTestId("admin-item-selector").selectOption("rietritter");
  await second.locator("#field-speed-kmh").fill("2.5"); await second.getByTestId("admin-save-btn").click();
  await expect(second.getByTestId("admin-load-status")).toContainText("andere werkplaats");
});
test("Ongewijzigde data verversen onderbreekt geen ontmoeting", async ({page}) => {
  await game(page,true); await page.getByTestId("encounter-btn").click();
  await page.evaluate(()=>window.__SAMMELTJES_TEST_API__.refreshData());
  await expect(page.getByTestId("discovery-modal")).toBeVisible();
});
test("Mobiele kaart, ontmoeting en boek zijn goed bedienbaar", async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await game(page,true);
  const [card,nav,zoom] = await Promise.all([page.locator("#nearby-panel").boundingBox(),page.locator("nav").boundingBox(),page.locator(".leaflet-control-zoom").boundingBox()]);
  expect(card.y+card.height).toBeLessThanOrEqual(nav.y);
  expect(zoom.y+zoom.height).toBeLessThan(card.y);
  await page.getByTestId("encounter-btn").click();
  await expect(page.getByRole("button",{name:"Toevoegen aan Sammeltjesboek",exact:true})).toBeInViewport();
  await page.getByRole("button",{name:"Toevoegen aan Sammeltjesboek",exact:true}).click();
  for (let i=0;i<3;i++) {
    await page.locator('[data-view="radar"]').click(); await expect(page.getByTestId("radar-panel")).toBeVisible();
    await page.locator('[data-view="radar"]').click(); await expect(page.getByTestId("radar-panel")).toBeHidden();
    await page.locator('[data-view="book"]').click(); await page.locator('[data-book-open="molenmaatje"]').click();
    await expect(page.getByTestId("book-detail-modal")).toBeVisible();
    await page.getByRole("button",{name:"Sluit Sammeltje detail",exact:true}).click(); await page.locator('[data-view="book"]').click();
  }
});
test("Kaart blijft op Wieringen en centreert uitsluitend op verzoek", async ({page}) => {
  await game(page);
  const result=await page.evaluate(()=>{
    const api=window.__SAMMELTJES_TEST_API__; const before=api.setMapCenter(52.9,4.95,14); api.setPlayerPosition(52.916,5.03);
    return {before,after:api.getMapCenter()};
  });
  expect(result.after).toEqual(result.before);
  await page.getByTestId("recenter-btn").click();
  await expect.poll(()=>page.evaluate(()=>window.__SAMMELTJES_TEST_API__.getMapCenter().zoom)).toBe(16);
  const limits=await page.evaluate(()=> {const api=window.__SAMMELTJES_TEST_API__;api.setMapCenter(0,0,1);return {limits:api.getMapLimits(),current:api.getMapCenter()};});
  expect(limits.current.zoom).toBeGreaterThanOrEqual(limits.limits.minZoom);
  expect(limits.current.lat).toBeGreaterThanOrEqual(limits.limits.south);
  expect(limits.current.lat).toBeLessThanOrEqual(limits.limits.north);
});
test("Testomgeving kan niet naar de echte website publiceren", async ({page}) => {
  await admin(page); await page.locator("#publish-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("testomgeving");
});
test("De app en verzameling openen offline", async ({browser,baseURL}) => {
  const context=await browser.newContext({baseURL,serviceWorkers:"allow"});
  const page=await context.newPage();
  await page.goto("/admin.html");
  await page.evaluate(async () => {
    await caches.open("other-app-test");
    await caches.open("sammeltjes-shell-old-test");
  });
  await game(page,true);
  await page.getByTestId("encounter-btn").click();
  await page.getByRole("button",{name:"Toevoegen aan Sammeltjesboek",exact:true}).click();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>caches.keys())).toContain("other-app-test");
  await expect.poll(()=>page.evaluate(()=>caches.keys())).not.toContain("sammeltjes-shell-old-test");
  await context.setOffline(true); await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByTestId("game-map")).toBeVisible();
  await page.locator('[data-view="book"]').click(); await expect(page.locator('[data-book-open="molenmaatje"]')).toBeVisible();
  await context.close();
});
