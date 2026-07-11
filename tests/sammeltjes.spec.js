const { test, expect } = require("@playwright/test");
test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/reset-sammeltjes");
  expect(response.ok()).toBeTruthy();
});

function collectClientErrors(page, label) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`[${label}] pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    if (/overpass|Failed to load resource/i.test(text)) {
      return;
    }

    errors.push(`[${label}] console error: ${text}`);
  });

  return errors;
}

async function prepareBrowserState(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function waitForGameApi(page) {
  await page.waitForFunction(() => Boolean(window.__SAMMELTJES_TEST_API__));
}

async function waitForAdminApi(page) {
  await page.waitForFunction(() => Boolean(window.__SAMMELTJES_ADMIN_TEST_API__));
}

async function loginAdmin(page) {
  await page.goto("/admin.html?e2e=1");
  await page.getByTestId("admin-password-input").fill("sammeltjesdev");
  await page.getByRole("button", { name: /open admin/i }).click();
  await expect(page.getByTestId("admin-app")).toBeVisible();
  await waitForAdminApi(page);
}

test("Test 1 - Basis flow", async ({ page }) => {
  const errors = collectClientErrors(page, "game");
  await prepareBrowserState(page);
  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);

  await expect(page.getByTestId("game-map")).toBeVisible();

  await page.evaluate(() => {
    const api = window.__SAMMELTJES_TEST_API__;
    api.clearDiscovered();
    api.setDemoMode(true);
    api.setShowAll(true);
    api.setPlayerPosition(52.934371, 5.026314);
  });

  await page.waitForFunction(() => window.__SAMMELTJES_TEST_API__.getStateSnapshot().visibleMarkers > 0);
  await page.evaluate(() => {
    window.__SAMMELTJES_TEST_API__.clickEntityMarker("molenmaatje");
  });
  await expect(page.getByTestId("toast")).toContainText("Molenmaatje");

  await page.evaluate(() => {
    window.__SAMMELTJES_TEST_API__.setPlayerPosition(52.934371, 5.026314);
  });
  await expect(page.getByTestId("discovery-modal")).toBeVisible();

  await page.getByRole("button", { name: /toevoegen aan sammeltjesboek/i }).click();
  await page.getByRole("button", { name: /sammeltjesboek/i }).click();
  await expect(page.getByTestId("book-panel")).toBeVisible();
  await expect(page.locator('[data-book-open="molenmaatje"]')).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 2 - Dev pagina openen", async ({ page }) => {
  const errors = collectClientErrors(page, "admin-open");
  await prepareBrowserState(page);
  await loginAdmin(page);

  await expect(page.getByTestId("admin-map")).toBeVisible();
  await expect(page.getByTestId("admin-item-count")).toContainText("Sammeltjes");
  await expect(page.getByTestId("admin-item-selector")).toBeVisible();
  await expect(page.getByTestId("admin-item-selector").locator("option")).toHaveCount(20);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 3 - Dev instellingen aanpassen", async ({ page }) => {
  const errors = collectClientErrors(page, "admin-edit");
  await prepareBrowserState(page);
  await loginAdmin(page);

  await page.evaluate(() => {
    window.__SAMMELTJES_ADMIN_TEST_API__.selectItem("molenmaatje");
  });
  await page.locator("#field-radius").fill("155");
  await page.getByTestId("admin-save-btn").click();
  await expect(page.getByTestId("admin-load-status")).toContainText("Live JSON opgeslagen");

  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);
  const entity = await page.evaluate(async () => {
    await window.__SAMMELTJES_TEST_API__.refreshData();
    return window.__SAMMELTJES_TEST_API__.getEntitySnapshot("molenmaatje");
  });

  expect(entity).toBeTruthy();
  expect(entity.radius).toBe(155);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 3b - Verplaatsen naar blijft herhaalbaar", async ({ page }) => {
  const errors = collectClientErrors(page, "admin-relocate");
  await prepareBrowserState(page);
  await loginAdmin(page);
  await page.evaluate(() => window.__SAMMELTJES_ADMIN_TEST_API__.selectItem("molenmaatje"));

  const targets = [
    { lat: 52.9, lng: 4.997 },
    { lat: 52.916, lng: 5.03 }
  ];
  for (const target of targets) {
    await page.locator("#field-relocate").check();
    await expect(page.getByTestId("admin-map-mode-label")).toContainText("Verplaatsmodus actief");
    const point = await page.evaluate(
      ({ lat, lng }) => window.__SAMMELTJES_ADMIN_TEST_API__.getMapContainerPoint(lat, lng),
      target
    );
    await page.getByTestId("admin-map").click({ position: point });
    await expect(page.locator("#field-relocate")).not.toBeChecked();
    expect(Number(await page.locator("#field-lat").inputValue())).toBeCloseTo(target.lat, 3);
    expect(Number(await page.locator("#field-lng").inputValue())).toBeCloseTo(target.lng, 3);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 4 - Spawn gedrag", async ({ page }) => {
  const errors = collectClientErrors(page, "spawn");
  await prepareBrowserState(page);
  await loginAdmin(page);

  await page.evaluate(async () => {
    const api = window.__SAMMELTJES_ADMIN_TEST_API__;
    api.selectItem("molenmaatje");
    api.updateSelectedItem({ active: false });
    await api.save();
  });
  await expect(page.getByTestId("admin-load-status")).toContainText("Live JSON opgeslagen");

  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);

  const snapshot = await page.evaluate(async () => {
    const api = window.__SAMMELTJES_TEST_API__;
    await api.refreshData();
    api.clearDiscovered();
    api.setDemoMode(true);
    api.setShowAll(true);
    api.setPlayerPosition(52.934371, 5.026314);
    return api.getEntitySnapshot("molenmaatje");
  });

  expect(snapshot.enabled).toBe(false);
  expect(snapshot.markerVisible).toBe(false);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 5 - Stability test", async ({ context }) => {
  const gamePage = await context.newPage();
  const adminPage = await context.newPage();
  const gameErrors = collectClientErrors(gamePage, "stability-game");
  const adminErrors = collectClientErrors(adminPage, "stability-admin");

  await prepareBrowserState(gamePage);
  await prepareBrowserState(adminPage);

  await gamePage.goto("/index.html?e2e=1");
  await waitForGameApi(gamePage);
  await gamePage.evaluate(() => {
    const api = window.__SAMMELTJES_TEST_API__;
    api.clearDiscovered();
    api.setDemoMode(true);
    api.setShowAll(true);
    api.setPlayerPosition(52.9005, 4.9485);
  });

  if (await gamePage.getByTestId("discovery-modal").isVisible()) {
    await gamePage.getByRole("button", { name: /sluit ontdekking/i }).click();
  }

  await gamePage.locator('[data-view="radar"]').click();
  await expect(gamePage.getByTestId("radar-panel")).toBeVisible();
  await gamePage.locator('[data-view="radar"]').click();
  await expect(gamePage.getByTestId("radar-panel")).toBeHidden();
  await gamePage.locator('[data-view="book"]').click();
  await expect(gamePage.getByTestId("book-panel")).toBeVisible();
  await gamePage.locator('[data-view="book"]').click();
  await expect(gamePage.getByTestId("book-panel")).toBeHidden();

  await loginAdmin(adminPage);
  await adminPage.evaluate(() => {
    const api = window.__SAMMELTJES_ADMIN_TEST_API__;
    api.selectItem("molenmaatje");
    api.updateSelectedItem({ radius: 180, behavior: "shy" });
  });
  await adminPage.getByTestId("admin-save-btn").click();
  await expect(adminPage.getByTestId("admin-load-status")).toContainText("Live JSON opgeslagen");

  const refreshed = await gamePage.evaluate(async () => {
    await window.__SAMMELTJES_TEST_API__.refreshData();
    return window.__SAMMELTJES_TEST_API__.getEntitySnapshot("molenmaatje");
  });

  expect(refreshed.radius).toBe(180);
  await expect(gamePage.getByTestId("game-map")).toBeVisible();
  await expect(adminPage.getByTestId("admin-map")).toBeVisible();
  expect([...gameErrors, ...adminErrors], [...gameErrors, ...adminErrors].join("\n")).toEqual([]);
});

test("Test 6 - Mobiele layout blijft vrij en bedienbaar", async ({ page }) => {
  const errors = collectClientErrors(page, "mobile-layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareBrowserState(page);
  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);

  const hud = page.getByTestId("hud-panel");
  const miniRadar = page.getByTestId("mini-radar-panel");
  const scan = page.getByTestId("scan-panel");
  await expect(hud).toHaveClass(/is-collapsed/);
  await expect(miniRadar).toHaveClass(/is-collapsed/);
  await expect(scan).toHaveClass(/is-collapsed/);

  const navigation = page.locator("nav");
  const recenter = page.getByTestId("recenter-btn");
  const [hudBox, radarBox, scanBox, navigationBox, recenterBox] = await Promise.all([
    hud.boundingBox(),
    miniRadar.boundingBox(),
    scan.boundingBox(),
    navigation.boundingBox(),
    recenter.boundingBox()
  ]);
  expect(hudBox).toBeTruthy();
  expect(radarBox).toBeTruthy();
  expect(scanBox).toBeTruthy();
  expect(navigationBox).toBeTruthy();
  expect(recenterBox).toBeTruthy();
  expect(radarBox.y).toBeGreaterThanOrEqual(hudBox.y + hudBox.height);
  expect(recenterBox.y).toBeGreaterThanOrEqual(radarBox.y + radarBox.height);
  expect(recenterBox.y + recenterBox.height).toBeLessThan(scanBox.y);
  expect(scanBox.y).toBeGreaterThan(hudBox.y + hudBox.height);
  expect(scanBox.y + scanBox.height).toBeLessThanOrEqual(navigationBox.y + 2);
  await page.locator('[data-view="book"]').click();
  const bookBox = await page.getByTestId("book-panel").boundingBox();
  expect(bookBox).toBeTruthy();
  expect(bookBox.x).toBeGreaterThanOrEqual(0);
  expect(bookBox.x + bookBox.width).toBeLessThanOrEqual(390);
  expect(bookBox.y + bookBox.height).toBeLessThanOrEqual(844);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 7 - Geinstalleerde app opent offline", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = collectClientErrors(page, "offline-pwa");
  await page.goto("/index.html");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("game-map")).toBeVisible();
  await expect(page.locator("#terrain-status")).toContainText("offline");
  expect(errors, errors.join("\n")).toEqual([]);
  await context.close();
});

test("Test 8 - GPS verplaatst de kaart niet automatisch", async ({ page }) => {
  const errors = collectClientErrors(page, "manual-recenter");
  await prepareBrowserState(page);
  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);

  const result = await page.evaluate(() => {
    const api = window.__SAMMELTJES_TEST_API__;
    const before = api.setMapCenter(52.9, 4.95, 14);
    api.setPlayerPosition(52.916, 5.03);
    return { before, afterGps: api.getMapCenter() };
  });
  expect(result.afterGps.lat).toBeCloseTo(result.before.lat, 5);
  expect(result.afterGps.lng).toBeCloseTo(result.before.lng, 5);

  await page.getByTestId("recenter-btn").click();
  await page.waitForFunction(() => {
    const center = window.__SAMMELTJES_TEST_API__.getMapCenter();
    return Math.abs(center.lat - 52.916) < 0.0002 && Math.abs(center.lng - 5.03) < 0.0002;
  });
  const centered = await page.evaluate(() => window.__SAMMELTJES_TEST_API__.getMapCenter());
  expect(centered.zoom).toBe(16);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Test 9 - Kaart blijft begrensd tot Wieringen", async ({ page }) => {
  const errors = collectClientErrors(page, "island-map");
  await prepareBrowserState(page);
  await page.goto("/index.html?e2e=1");
  await waitForGameApi(page);

  await expect(page.locator(".island-pergament-mask")).toHaveCount(1);
  await expect(page.locator(".handdrawn-coast")).toHaveCount(4);
  const result = await page.evaluate(() => {
    const api = window.__SAMMELTJES_TEST_API__;
    const limits = api.getMapLimits();
    api.setMapCenter(0, 0, 1);
    return { limits, constrained: api.getMapCenter() };
  });

  expect(result.constrained.zoom).toBeGreaterThanOrEqual(result.limits.minZoom);
  expect(result.constrained.lat).toBeGreaterThanOrEqual(result.limits.south);
  expect(result.constrained.lat).toBeLessThanOrEqual(result.limits.north);
  expect(result.constrained.lng).toBeGreaterThanOrEqual(result.limits.west);
  expect(result.constrained.lng).toBeLessThanOrEqual(result.limits.east);
  expect(errors, errors.join("\n")).toEqual([]);
});
