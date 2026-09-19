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

async function requestGame(page, context) {
  const items = require('../data/sammeltjes.json').map(item => ['havenpluimpje','wieringer-wolkje'].includes(item.id)
    ? {...item,...(item.id==='havenpluimpje'?home:{}),type:'fixed',speedKmh:0,active:true,availabilityMode:'all-day'} : {...item,active:false});
  await context.route('**/data/sammeltjes.json*', route => route.fulfill({json:items}));
  await context.addInitScript(() => {
    if (!localStorage.getItem('sammeltjes-wieringen-discovered')) localStorage.setItem('sammeltjes-wieringen-discovered',JSON.stringify(['havenpluimpje','wieringer-wolkje']));
  });
  await game(page,true);
  return items;
}
async function acceptRequest(page) {
  await page.getByTestId('entity-marker-havenpluimpje').click();
  await expect(page.locator('#encounter-request-text')).toContainText('Wieringer Wolkje');
  await page.getByTestId('accept-request-btn').click();
  await expect(page.getByTestId('active-request')).toBeVisible();
}
async function visitWolkje(page) {
  await page.locator('[data-view="map"]').click();
  await page.evaluate(() => {
    const api=window.__SAMMELTJES_TEST_API__, target=api.getEntitySnapshot('wieringer-wolkje');
    api.setDemoMode(true); api.setPlayerPosition(target.currentLat,target.currentLng); api.setMapCenter(target.currentLat,target.currentLng,17);
  });
  await page.getByTestId('entity-marker-wieringer-wolkje').click();
}

test('Verzoekjes vervangen de radar, ook zonder gevonden vriendjes', async ({page}) => {
  const errors=errorsFor(page);
  await page.setViewportSize({width:320,height:568});
  await game(page);
  await expect(page.locator('[data-view="radar"], #radar-panel, #mini-radar-panel')).toHaveCount(0);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('requests-content')).toContainText('Ontdek eerst twee Sammeltjes');
  await expect(page.locator('#close-requests-btn')).toBeInViewport();
  await expect(page.locator('[data-request-map]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('requests-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Een verzoekje bewaren, overbrengen en precies een stempel verdienen', async ({page,context}) => {
  const errors=errorsFor(page);
  await page.setViewportSize({width:390,height:844});
  await requestGame(page,context);
  await acceptRequest(page);
  await expect(page.locator('#request-nav-count')).toBeVisible();
  await page.reload();
  await page.waitForFunction(()=>!!window.__SAMMELTJES_TEST_API__);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('active-request')).toContainText('Wieringer Wolkje');
  await page.locator('[data-request-locate="wieringer-wolkje"]').click();
  // Looking at a destination does not teleport the player or finish the request.
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sammeltjes-friend-requests-v1')).completed.length)).toBe(0);
  await visitWolkje(page);
  await expect(page.locator('#encounter-request-text')).toContainText('geluksarmbandje van Havenpluimpje');
  await expect(page.getByTestId('accept-request-btn')).toBeHidden();
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await expect(page.getByTestId('request-thanks')).toContainText('scheve knoopje');
  await expect(page.getByTestId('request-thanks')).toBeInViewport();
  await expect(page.locator('#request-stamp-count')).toHaveText('1 vriendschapsstempel');
  await expect(page.locator('.request-memory')).toHaveCount(1);
  await expect(page.getByTestId('active-request')).toHaveCount(0);
  await visitWolkje(page);
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await page.reload();
  await page.locator('[data-view="requests"]').click();
  await expect(page.locator('.request-memory')).toHaveCount(1);
  await expect(page.locator('#request-stamp-count')).toHaveText('1 vriendschapsstempel');
  await expect(page.locator('#found-counter')).toHaveText('2 / 20');
  expect(errors).toEqual([]);
});

test('Weglopen voor de begroeting rondt geen verzoekje af', async ({page,context}) => {
  await requestGame(page,context); await acceptRequest(page); await visitWolkje(page);
  await page.evaluate(point=>window.__SAMMELTJES_TEST_API__.setPlayerPosition(point.lat,point.lng),home);
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await expect(page.getByTestId('toast')).toContainText('Kom weer rustig dichtbij');
  const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('sammeltjes-friend-requests-v1')));
  expect(progress.active.targetId).toBe('wieringer-wolkje'); expect(progress.completed).toHaveLength(0);
});

test('Geleende breinaalden gaan terug naar Oma, ook na herladen en naast een ander vriendje', async ({page,context}) => {
  const items=require('../data/sammeltjes.json').map(item=>({...item,type:'fixed',speedKmh:0,availabilityMode:'all-day'}));
  await context.route('**/data/sammeltjes.json*',route=>route.fulfill({json:items}));
  await context.addInitScript(()=>localStorage.setItem('sammeltjes-wieringen-discovered',JSON.stringify(['schapenherdertje','oma-wierwortel','boer-bietje'])));
  await game(page);
  const visit=async(id)=>{
    await page.locator('[data-view="map"]').click();
    await page.evaluate(id=>{
      const api=window.__SAMMELTJES_TEST_API__, entity=api.getEntitySnapshot(id);
      api.setDemoMode(true); api.setPlayerPosition(entity.currentLat,entity.currentLng); api.setMapCenter(entity.currentLat,entity.currentLng,17);
    },id);
    await page.getByTestId('entity-marker-'+id).click();
  };
  await visit('schapenherdertje');
  await expect(page.locator('#encounter-request-text')).toContainText('breinaalden van Oma Wierwortel');
  await expect(page.locator('#encounter-request .request-distance')).toContainText('Een langer ommetje');
  await page.getByTestId('accept-request-btn').click();
  await page.reload(); await page.waitForFunction(()=>!!window.__SAMMELTJES_TEST_API__);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('active-request')).toContainText('Breinaalden');
  await visit('boer-bietje');
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sammeltjes-friend-requests-v1')).active.targetId)).toBe('oma-wierwortel');
  await visit('oma-wierwortel');
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await expect(page.getByTestId('request-thanks')).toContainText('sokken voor Opa');
  await expect(page.locator('#request-stamp-count')).toHaveText('1 vriendschapsstempel');
});

test('Een oude groet blijft af te maken zonder verdiende stempels kwijt te raken', async ({page,context})=>{
  await requestGame(page,context);
  await page.evaluate(()=>{
    localStorage.setItem('sammeltjes-friend-requests-v1',JSON.stringify({
      active:{giverId:'havenpluimpje',targetId:'wieringer-wolkje'},
      completed:[{giverId:'schapenherdertje',targetId:'oma-wierwortel',completedAt:'2026-09-01T12:00:00Z'}]
    }));
  });
  await page.reload(); await page.waitForFunction(()=>!!window.__SAMMELTJES_TEST_API__);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('active-request')).toContainText('Een vriendelijke groet');
  await expect(page.getByTestId('active-request')).not.toContainText('Geluksarmbandje');
  await expect(page.locator('#request-stamp-count')).toHaveText('1 vriendschapsstempel');
  await visitWolkje(page);
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await expect(page.locator('#request-stamp-count')).toHaveText('2 vriendschapsstempels');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sammeltjes-friend-requests-v1')).completed[0])).toEqual({giverId:'schapenherdertje',targetId:'oma-wierwortel',completedAt:'2026-09-01T12:00:00Z'});
});

test('Persoonlijke brieven en getekende voorwerpen passen op telefoon en desktop',async({page,context})=>{
  const errors=errorsFor(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await requestGame(page,context);
  await page.getByTestId('entity-marker-havenpluimpje').click();
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    await page.getByTestId('accept-request-btn').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('accept-request-btn')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  }
  await page.getByTestId('accept-request-btn').click();
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]) {
    await page.setViewportSize(size);
    await expect(page.locator('#close-requests-btn')).toBeInViewport();
    await expect(page.getByTestId('active-request').getByTestId('request-parcel')).toContainText('Geluksarmbandje');
    await expect.poll(()=>page.getByTestId('active-request').getByTestId('request-parcel').locator('use').evaluate(el=>el.getBBox().width)).toBeGreaterThan(0);
    await page.locator('[data-request-locate]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-request-locate]')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#requests-content').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'output/personal-request-mobile.png'});
  await visitWolkje(page);
  await page.getByRole('button',{name:'Fijn je weer te zien',exact:true}).click();
  await expect(page.getByTestId('request-thanks')).toBeInViewport();
  await page.screenshot({path:'output/personal-request-thanks.png'});
  expect(errors).toEqual([]);
});

test('Slapen, uitschakelen en teruggeven behouden bestaande voortgang', async ({page,context}) => {
  const items=await requestGame(page,context); await acceptRequest(page);
  const target=items.find(i=>i.id==='wieringer-wolkje');
  target.availabilityMode='schedule'; target.activeFrom='01:00'; target.activeUntil='02:00';
  await page.evaluate(()=>window.__SAMMELTJES_TEST_API__.refreshData());
  await expect(page.getByTestId('active-request')).toContainText('rust nu');
  target.active=false;
  await page.evaluate(()=>window.__SAMMELTJES_TEST_API__.refreshData());
  await expect(page.getByTestId('active-request')).toContainText('niet meer beschikbaar');
  await expect(page.locator('[data-request-locate="wieringer-wolkje"]')).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-request-cancel]').click();
  await expect(page.getByTestId('active-request')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sammeltjes-friend-requests-v1')))).toEqual({active:null,completed:[]});
});

test('Geweigerde opslag doet niet alsof een verzoekje is aangenomen', async ({page,context}) => {
  await requestGame(page,context);
  await page.getByTestId('entity-marker-havenpluimpje').click();
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='sammeltjes-friend-requests-v1')throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};
  });
  await page.getByTestId('accept-request-btn').click();
  await expect(page.getByTestId('toast')).toContainText('niet worden opgeslagen');
  await expect(page.getByTestId('discovery-modal')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('sammeltjes-friend-requests-v1'))).toBe(null);
});
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

test("Prentenboek filtert vriendjes en houdt de verzameling en voortgang intact", async ({page}) => {
  const errors = errorsFor(page);
  await page.setViewportSize({width:390,height:844});
  await game(page, true);
  await page.locator('[data-view="book"]').click();
  await expect(page.locator('.book-card--undiscovered')).toHaveCount(20);
  await page.locator('[data-book-filter="found"]').click();
  await expect(page.locator('.book-empty')).toBeVisible();
  await expect(page.getByTestId('book-progress')).toHaveAttribute('value','0');
  await page.locator('[data-book-walk]').click();
  await expect(page.getByTestId('book-panel')).toBeHidden();
  await page.getByTestId('encounter-btn').click();
  await page.getByRole('button',{name:'Toevoegen aan Sammeltjesboek',exact:true}).click();
  await page.locator('[data-view="book"]').click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('[data-book-filter="found"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('book-progress')).toHaveAttribute('value','1');
  await page.locator('[data-book-open="molenmaatje"]').click();
  await expect(page.locator('#book-detail-image')).toHaveCSS('object-fit','contain');
  await expect(page.locator('#book-detail-date')).toContainText('Vriendjes sinds');
  await page.getByRole('button',{name:'Sluit Sammeltje detail',exact:true}).click();
  await expect(page.locator('[data-book-open="molenmaatje"]')).toBeFocused();
  await page.locator('[data-book-filter="all"]').click();
  await expect(page.locator('.book-card')).toHaveCount(20);
  await expect(page.locator('.book-card').first()).toHaveAttribute('data-book-open','molenmaatje');
  await page.reload();
  await page.locator('[data-view="book"]').click();
  await expect(page.getByTestId('book-progress')).toHaveAttribute('value','1');
  expect(errors).toEqual([]);
});

test("Prentenboek en getekende navigatie passen op kleine en grote schermen", async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await game(page);
  await page.locator('[data-view="book"]').click();
  for (const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]) {
    await page.setViewportSize(size);
    await expect(page.locator('#close-book-btn')).toBeInViewport();
    const geometry=await page.evaluate(()=>{
      const grid=document.querySelector('#book-grid');
      const card=grid.querySelector('.book-card');
      return {overflow:document.documentElement.scrollWidth>innerWidth,cardHeight:card.getBoundingClientRect().height,cardContent:card.scrollHeight,cardClient:card.clientHeight,gridHeight:grid.clientHeight,nav:[...document.querySelectorAll('.nav-button')].map(b=>({height:b.getBoundingClientRect().height,icon:!!b.querySelector('svg use')}))};
    });
    expect(geometry.overflow).toBeFalsy();
    expect(geometry.cardHeight).toBeGreaterThan(220);
    expect(geometry.cardContent).toBeLessThanOrEqual(geometry.cardClient+1);
    expect(geometry.gridHeight).toBeGreaterThan(60);
    for (const button of geometry.nav) { expect(button.height).toBeGreaterThanOrEqual(44); expect(button.icon).toBeTruthy(); }
    await page.locator('.book-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.book-card').last()).toBeInViewport();
  }
  await page.locator('[data-view="book"]').click();
  await expect(page.getByTestId('book-panel')).toBeHidden();
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
    await page.locator('[data-view="requests"]').click(); await expect(page.getByTestId("requests-panel")).toBeVisible();
    await page.locator('[data-view="requests"]').click(); await expect(page.getByTestId("requests-panel")).toBeHidden();
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

test('Een aangenomen verzoekje blijft ook offline beschikbaar', async ({browser,baseURL}) => {
  const context=await browser.newContext({baseURL,serviceWorkers:'allow'});
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-15T17:00:00Z'));
  await requestGame(page,context); await acceptRequest(page);
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await context.unroute('**/data/sammeltjes.json*');
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByTestId('active-request')).toContainText('Wieringer Wolkje');
  await expect(page.locator('#request-stamp-count')).toHaveText('0 vriendschapsstempels');
  await expect(page.getByTestId('active-request')).toContainText('Geluksarmbandje');
  expect(await page.evaluate(async()=>!!(await caches.match('./assets/request-items.svg')))).toBe(true);
  await context.close();
});
