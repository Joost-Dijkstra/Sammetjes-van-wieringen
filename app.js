const SHARED_CONFIG = window.SAMMELTJES_SHARED_CONFIG;
const Rules = window.SammeltjesRules;
const FriendRequests = window.SammeltjesRequests;

if (!SHARED_CONFIG) {
  throw new Error("shared-config.js ontbreekt of is niet geladen.");
}

const CONFIG = {
  ACTIVATION_RADIUS: 300,
  RADAR_RADIUS: 60,
  DISCOVERY_RADIUS: 20,
  SIMULATION_RADIUS: 1000,
  TERRAIN_FETCH_RADIUS: 900,
  TERRAIN_REFRESH_DISTANCE: 350,
  TERRAIN_REQUEST_TIMEOUT_MS: 12000,
  TERRAIN_RETRY_DELAY_MS: 120000,
  ROAMING_UPDATE_MS: 200,
  UI_UPDATE_MS: 1000,
  PLAYER_STORAGE_KEY: "sammeltjes-wieringen-discovered",
  DEFAULT_CENTER: { lat: 52.9005, lng: 4.9485 },
  WIERINGEN_POLYGON: SHARED_CONFIG.WIERINGEN_POLYGON,
  OVERPASS_ENDPOINTS: [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
  ]
};
const DATA_VERSION_KEY = "sammeltjes-data-version";
const PANEL_STATE_KEY = "sammeltjes-ui-panels-v2";
const WIERINGEN_VIEW_BOUNDS = createExpandedMapBounds(
  SHARED_CONFIG.WIERINGEN_BOUNDS,
  SHARED_CONFIG.GAME_MARGIN_METERS
);

const state = {
  map: null,
  playerMarker: null,
  coastLayers: [],
  terrain: {
    ready: false,
    isLoading: false,
    retryAfter: 0,
    endpointOffset: 0,
    center: null,
    allowedPolygons: [],
    forbiddenPolygons: [],
    allowedLines: [],
    forbiddenLines: []
  },
  playerPosition: null,
  hasGpsLock: false,
  demoMode: false,
  showAllMode: false,
  lastKnownGpsPosition: null,
  entities: [],
  currentView: "map",
  bookFilter: "all",
  requests: loadFriendRequests(),
  requestOffer: null,
  discovered: new Set(loadDiscoveredIds()),
  discoveryQueue: [],
  pendingDiscoveries: new Set(),
  currentDiscoveryId: null,
  currentBookDetailId: null,
  lastFocusedElement: null,
  simulationTimer: null,
  lastUiRenderAt: 0,
  toastTimer: null,
  isRefreshingData: false,
  lastDataVersion: localStorage.getItem(DATA_VERSION_KEY) || null,
  dataFingerprint: "",
  foundDates: loadFoundDates(),
  nearEntityId: null,
  gpsAccuracy: Infinity,
  gpsTimestamp: 0,
  collapsedPanels: loadCollapsedPanelState()
};

const ui = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  applyCollapsedPanelState();
  requestAnimationFrame(updateOverlayPositions);
  bindUi();
  initMap();

  let data = [];
  try {
    data = await loadSammeltjesData();
  } catch (error) {
    ui.gpsStatus.textContent = "De Sammeltjesdata kon niet worden geladen. Controleer je verbinding en herlaad de app.";
    showToast("Sammeltjesdata niet beschikbaar.");
    return;
  }
  state.entities = createEntities(data);
  state.dataFingerprint = JSON.stringify(data);
  renderBook();
  renderScanList();
  updateCounters();
  setTerrainStatus("basis");

  setPlayerPosition(CONFIG.DEFAULT_CENTER, { source: "fallback", silentToast: true });
  startGeolocation();
  state.simulationTimer = window.setInterval(simulationTick, CONFIG.ROAMING_UPDATE_MS);
  simulationTick(true);
  if (isE2eMode()) {
    installTestApi();
  }
}

function cacheDom() {
  ui.gpsStatus = document.getElementById("gps-status");
  ui.demoToggleButton = document.getElementById("demo-toggle-btn");
  ui.toggleAllButton = document.getElementById("toggle-all-btn");
  ui.foundCounter = document.getElementById("found-counter");
  ui.activeCounter = document.getElementById("active-counter");
  ui.terrainStatus = document.getElementById("terrain-status");
  ui.bookSummary = document.getElementById("book-summary");
  ui.bookGrid = document.getElementById("book-grid");
  ui.scanPanel = document.getElementById("scan-panel");
  ui.scanSummary = document.getElementById("scan-summary");
  ui.scanList = document.getElementById("scan-list");
  ui.requestsPanel = document.getElementById("requests-panel");
  ui.bookPanel = document.getElementById("book-panel");
  ui.toast = document.getElementById("toast");
  ui.discoveryModal = document.getElementById("discovery-modal");
  ui.discoveryName = document.getElementById("discovery-name");
  ui.discoveryImage = document.getElementById("discovery-image");
  ui.discoveryRarity = document.getElementById("discovery-rarity");
  ui.discoveryType = document.getElementById("discovery-type");
  ui.discoveryDescription = document.getElementById("discovery-description");
  ui.collectButton = document.getElementById("collect-btn");
  ui.bookDetailModal = document.getElementById("book-detail-modal");
  ui.bookDetailName = document.getElementById("book-detail-name");
  ui.bookDetailImage = document.getElementById("book-detail-image");
  ui.bookDetailRarity = document.getElementById("book-detail-rarity");
  ui.bookDetailType = document.getElementById("book-detail-type");
  ui.bookDetailDescription = document.getElementById("book-detail-description");
  ui.navButtons = Array.from(document.querySelectorAll("[data-view]"));
  ui.recenterButton = document.getElementById("recenter-btn");
  ui.hudPanel = document.getElementById("hud-panel");
  ui.hudPanelToggle = document.getElementById("toggle-hud-panel");
  ui.scanPanelToggle = document.getElementById("toggle-scan-panel");
  ui.hudPanelBody = document.getElementById("hud-panel-body");
  ui.scanPanelBody = document.getElementById("scan-panel-body");
  ui.encounterButton = document.getElementById("encounter-btn");
  ui.nearbyMessage = document.getElementById("nearby-message");
  ui.nearbyPortrait = document.getElementById("nearby-portrait");
}

function bindUi() {
  const localTools = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  document.getElementById("local-test-tools").hidden = !localTools;
  ui.encounterButton.addEventListener("click", () => {
    const entity = state.entities.find((item) => item.id === state.nearEntityId);
    if (canMeet(entity)) enqueueDiscovery(entity);
  });
  ui.toggleAllButton.addEventListener("click", toggleShowAllMode);
  ui.demoToggleButton.addEventListener("click", toggleDemoMode);

  ui.recenterButton.addEventListener("click", centerMapOnPlayer);

  document.getElementById("close-requests-btn").addEventListener("click", () => switchView("map"));
  document.getElementById("accept-request-btn").addEventListener("click", acceptFriendRequest);
  document.getElementById("requests-content").addEventListener("click", handleRequestClick);
  document.getElementById("close-book-btn").addEventListener("click", () => switchView("map"));
  document.getElementById("dismiss-discovery-btn").addEventListener("click", () => dismissDiscovery(true));
  document.getElementById("discovery-backdrop").addEventListener("click", () => dismissDiscovery(true));
  document.getElementById("dismiss-book-detail-btn").addEventListener("click", closeBookDetail);
  document.getElementById("book-detail-backdrop").addEventListener("click", closeBookDetail);
  ui.collectButton.addEventListener("click", collectCurrentDiscovery);
  ui.bookGrid.addEventListener("click", handleBookGridClick);
  document.querySelectorAll("[data-book-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bookFilter = button.dataset.bookFilter;
      renderBook();
      ui.bookGrid.scrollTop = 0;
    });
  });

  bindCollapsiblePanel("hud", ui.hudPanel, ui.hudPanelToggle);
  bindCollapsiblePanel("scan", ui.scanPanel, ui.scanPanelToggle);

  ui.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      switchView(state.currentView === view && view !== "map" ? "map" : view);
    });
  });

  window.addEventListener("keydown", handleDemoMovement);
  window.addEventListener("focus", () => {
    void refreshSammeltjesData({ silent: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshSammeltjesData({ silent: true });
      simulationTick(true);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === FriendRequests.STORAGE_KEY) {
      state.requests = loadFriendRequests();
      renderRequests();
      renderEncounterRequest(state.entities.find((item) => item.id === state.currentDiscoveryId));
      return;
    }
    if (event.key !== DATA_VERSION_KEY || !event.newValue || event.newValue === state.lastDataVersion) {
      return;
    }

    state.lastDataVersion = event.newValue;
    void refreshSammeltjesData({ silent: false });
  });
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  window.addEventListener("resize", updateOverlayPositions);
  updateConnectionStatus();
}

function bindCollapsiblePanel(key, panel, button) {
  if (!panel || !button) {
    return;
  }

  button.addEventListener("click", () => {
    setPanelCollapsed(key, panel, button, !panel.classList.contains("is-collapsed"));
  });
}

function applyCollapsedPanelState() {
  const definitions = [
    ["hud", ui.hudPanel, ui.hudPanelToggle],
    ["scan", ui.scanPanel, ui.scanPanelToggle]
  ];

  for (const [key, panel, button] of definitions) {
    if (!panel || !button) {
      continue;
    }

    setPanelCollapsed(key, panel, button, Boolean(state.collapsedPanels[key]), false);
  }
}

function setPanelCollapsed(key, panel, button, collapsed, persist = true) {
  const controlledBodyId = button.getAttribute("aria-controls");
  const controlledBody = controlledBodyId ? document.getElementById(controlledBodyId) : null;

  panel.classList.toggle("is-collapsed", collapsed);
  if (controlledBody) {
    controlledBody.classList.toggle("hidden", collapsed);
  }
  button.textContent = collapsed ? "Openen" : "Inklappen";
  button.setAttribute("aria-expanded", String(!collapsed));

  state.collapsedPanels[key] = collapsed;
  if (persist) {
    saveCollapsedPanelState(state.collapsedPanels);
  }
  requestAnimationFrame(updateOverlayPositions);
}

function updateOverlayPositions() {
  const hudBottom = ui.hudPanel?.getBoundingClientRect().bottom || 126;
  document.documentElement.style.setProperty("--hud-clearance", `${Math.ceil(hudBottom + 10)}px`);
  const controlTop = hudBottom + 10;
  document.documentElement.style.setProperty("--map-control-top", `${Math.ceil(controlTop)}px`);
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    maxBounds: WIERINGEN_VIEW_BOUNDS,
    maxBoundsViscosity: 1,
    zoomSnap: 0.25
  }).setView([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-bijdragers"
  }).addTo(state.map);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.control.attribution({ position: "topright", prefix: false }).addTo(state.map);
  mountIslandFrame();
  state.map.fitBounds(WIERINGEN_VIEW_BOUNDS, { padding: [8, 8], animate: false });
  updateMapZoomLimit();
  state.map.on("resize", updateMapZoomLimit);
  state.map.on("zoomend", updateCoastlineStyle);

  const playerIcon = L.divIcon({
    className: "",
    html: '<div class="player-marker"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  state.playerMarker = L.marker([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], {
    icon: playerIcon
  }).addTo(state.map);


  state.map.on("click", (event) => {
    if (!state.demoMode) {
      return;
    }

    if (!pointInPolygon(event.latlng, CONFIG.WIERINGEN_POLYGON)) {
      showToast("De Sammeltjes wonen binnen de getekende kustlijn van Wieringen.");
      return;
    }

    setPlayerPosition(event.latlng, { source: "demo" });
    if (state.demoMode) {
      showToast("Demo-modus: je speler is naar deze plek verplaatst.");
    }
  });
}

function mountIslandFrame() {
  const maskPane = state.map.createPane("islandMaskPane");
  maskPane.style.zIndex = "330";
  maskPane.style.pointerEvents = "none";

  const coastPane = state.map.createPane("islandCoastPane");
  coastPane.style.zIndex = "360";
  coastPane.style.pointerEvents = "none";

  const maskBounds = createExpandedMapBounds(SHARED_CONFIG.WIERINGEN_BOUNDS, 25000);
  const outerRing = [
    maskBounds.getSouthWest(),
    maskBounds.getNorthWest(),
    maskBounds.getNorthEast(),
    maskBounds.getSouthEast()
  ];
  const islandRing = CONFIG.WIERINGEN_POLYGON.map((point) => [point.lat, point.lng]);
  L.polygon([outerRing, islandRing], {
    pane: "islandMaskPane",
    stroke: false,
    fill: true,
    fillColor: "#d3e8e0",
    fillOpacity: 0.16,
    fillRule: "evenodd",
    className: "island-pergament-mask",
    interactive: false
  }).addTo(state.map);

  const coastline = closePolygonRing(CONFIG.WIERINGEN_POLYGON);
  const firstWave = closePolygonRing(offsetPolygonOutward(CONFIG.WIERINGEN_POLYGON, 38));
  const secondWave = closePolygonRing(offsetPolygonOutward(CONFIG.WIERINGEN_POLYGON, 72));
  const coastLayers = [
    L.polyline(coastline, {
      pane: "islandCoastPane",
      color: "#f5dfaa",
      weight: 3,
      opacity: 0.2,
      lineCap: "round",
      lineJoin: "round",
      className: "handdrawn-coast handdrawn-coast--sand",
      interactive: false
    }),
    L.polyline(coastline, {
      pane: "islandCoastPane",
      color: "#6b4527",
      weight: 1,
      opacity: 0.3,
      lineCap: "round",
      lineJoin: "round",
      className: "handdrawn-coast handdrawn-coast--ink",
      interactive: false
    }),
    L.polyline(firstWave, {
      pane: "islandCoastPane",
      color: "#fff1c8",
      weight: 1.2,
      opacity: 0.14,
      dashArray: "2 9",
      lineCap: "round",
      className: "handdrawn-coast handdrawn-coast--wave",
      interactive: false
    }),
    L.polyline(secondWave, {
      pane: "islandCoastPane",
      color: "#ead09a",
      weight: 0.8,
      opacity: 0.06,
      dashArray: "1 13",
      lineCap: "round",
      className: "handdrawn-coast handdrawn-coast--wave",
      interactive: false
    })
  ];
  coastLayers.forEach((layer) => layer.addTo(state.map));
  state.coastLayers = coastLayers;
  updateCoastlineStyle();
}

function updateMapZoomLimit() {
  const minimumZoom = Math.max(10, state.map.getBoundsZoom(WIERINGEN_VIEW_BOUNDS, false));
  state.map.setMinZoom(minimumZoom);
  if (state.map.getZoom() < minimumZoom) {
    state.map.setZoom(minimumZoom, { animate: false });
  }
  updateCoastlineStyle();
}

function updateCoastlineStyle() {
  if (!state.map || state.coastLayers.length !== 4) {
    return;
  }

  const zoomRange = Math.max(1, 16 - state.map.getMinZoom());
  const detail = Math.max(0, Math.min(1, (state.map.getZoom() - state.map.getMinZoom()) / zoomRange));
  const styles = [
    { weight: 1.5 + detail * 2.5, opacity: 0.08 + detail * 0.22 },
    { weight: 0.7 + detail * 0.8, opacity: 0.16 + detail * 0.3 },
    { weight: 0.8 + detail * 0.8, opacity: 0.05 + detail * 0.18 },
    { weight: 0.6 + detail * 0.5, opacity: detail * 0.09 }
  ];
  state.coastLayers.forEach((layer, index) => layer.setStyle(styles[index]));
}

async function loadSammeltjesData() {
  const response = await fetch("data/sammeltjes.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Kon JSON niet laden (${response.status}).`);
  }

  const data = await response.json();
  const errors = Rules.validate(data, CONFIG.WIERINGEN_POLYGON);
  if (errors.length) throw new Error(errors[0]);
  return data;
}

async function refreshSammeltjesData(options = {}) {
  if (state.isRefreshingData) {
    return;
  }

  state.isRefreshingData = true;

  try {
    const data = await loadSammeltjesData();
    const fingerprint = JSON.stringify(data);
    if (fingerprint === state.dataFingerprint) return;
    replaceEntities(data);
    state.dataFingerprint = fingerprint;

    if (!options.silent) {
      showToast("Sammeltjesdata ververst vanuit de admin.");
    }
  } catch (error) {
    if (!options.silent) showToast("Verversen lukte niet. Je huidige wandeling blijft beschikbaar.");
  } finally {
    state.isRefreshingData = false;
  }
}

function replaceEntities(records) {
  const old = new Map(state.entities.map((item) => [item.id, item]));
  state.entities = records.map((record) => {
    const previous = old.get(record.id);
    old.delete(record.id);
    if (previous && previous.recordFingerprint === JSON.stringify(record)) return previous;
    if (previous) hideEntityMarker(previous);
    return createEntities([record])[0];
  });
  old.forEach(hideEntityMarker);
  if (state.currentDiscoveryId && !state.entities.some((item) => item.id === state.currentDiscoveryId && item.enabled)) dismissDiscovery(false);
  if (state.currentBookDetailId) {
    const current = state.entities.find((item) => item.id === state.currentBookDetailId);
    if (current) openBookDetail(current); else closeBookDetail();
  }
  renderBook();
  renderScanList();
  renderRequests();
  updateCounters();
  simulationTick(true);
}

function createEntities(records) {
  return records.map((record) => {
    const entity = {
      ...Rules.create(record),
      recordFingerprint: JSON.stringify(record),
      homeLat: record.lat,
      homeLng: record.lng,
      currentLat: record.lat,
      currentLng: record.lng,
      target: null,
      distance: Number.POSITIVE_INFINITY,
      active: false,
      radarVisible: false,
      availableNow: true,
      enabled: record.active !== false,
      collected: state.discovered.has(record.id),
      marker: null,
      discoveryCooldownUntil: 0,
      terrainValidated: false,
      radius: normalizeEntityRadius(record.radius),
      behavior: oneOf(record.behavior, ["curious", "scared", "shy"], defaultBehaviorForType(record.type)),
      speedKmh: normalizeSpeedKmh(record.speedKmh, record.rarity),
      speedMps: kmhToMps(normalizeSpeedKmh(record.speedKmh, record.rarity)),
      availabilityMode: oneOf(
        record.availabilityMode,
        ["all-day", "morning", "afternoon", "evening", "night", "random-hours", "schedule"],
        "all-day"
      ),
      randomHoursPerDay: normalizeRandomHours(record.randomHoursPerDay)
    };

    return entity;
  });
}

function startGeolocation() {
  if (!navigator.geolocation) {
    ui.gpsStatus.textContent = "GPS wordt niet ondersteund. Tik op de kaart voor demo-modus.";
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      state.hasGpsLock = true;
      state.gpsAccuracy = position.coords.accuracy;
      state.gpsTimestamp = position.timestamp || Date.now();
      const nextPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      state.lastKnownGpsPosition = nextPosition;

      if (!state.demoMode) {
        setPlayerPosition(nextPosition, { source: "gps", silentToast: true });
      }

      updateLocationStatus();
    },
    () => {
      state.hasGpsLock = false;
      updateLocationStatus();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000
    }
  );
}

function setPlayerPosition(latlng, options = {}) {
  const nextPosition = normalizeLatLng(latlng);
  state.playerPosition = nextPosition;

  state.playerMarker.setLatLng(nextPosition);

  if (options.source !== "fallback") {
    void maybeRefreshTerrain();
  }
}

function centerMapOnPlayer() {
  if (!state.playerPosition) {
    showToast("Je locatie is nog niet beschikbaar.");
    return;
  }

  if (!pointInPolygon(state.playerPosition, CONFIG.WIERINGEN_POLYGON)) {
    showToast("Je bent nu buiten het speelgebied van Wieringen.");
    return;
  }

  state.map.setView([state.playerPosition.lat, state.playerPosition.lng], 16, { animate: true });
}

function toggleDemoMode() {
  state.demoMode = !state.demoMode;
  ui.demoToggleButton.textContent = state.demoMode ? "Gebruik echte GPS" : "Demo besturen";
  ui.demoToggleButton.classList.toggle("soft-button--primary", state.demoMode);

  if (state.demoMode) {
    if (!state.playerPosition) {
      setPlayerPosition(CONFIG.DEFAULT_CENTER, { source: "demo", silentToast: true });
    }

    showToast("Demo-modus aan. Gebruik pijltjestoetsen of tik op de kaart.");
  } else if (state.lastKnownGpsPosition) {
    setPlayerPosition(state.lastKnownGpsPosition, { source: "gps", silentToast: true });
    showToast("Demo-modus uit. Terug naar je echte GPS-locatie.");
  } else {
    showToast("Demo-modus uit. Nog geen GPS-lock gevonden.");
  }

  updateLocationStatus();
}

function toggleShowAllMode() {
  state.showAllMode = !state.showAllMode;
  ui.toggleAllButton.textContent = state.showAllMode ? "Verberg extra" : "Toon alles";
  ui.toggleAllButton.classList.toggle("soft-button--primary", state.showAllMode);

  for (const entity of state.entities) {
    syncEntityMarker(entity);
  }

  renderScanList();
  showToast(
    state.showAllMode
      ? "Testmodus aan: alle Sammeltjes staan nu op de kaart."
      : "Testmodus uit: alleen Sammeltjes binnen bereik staan op de kaart."
  );
}

function handleDemoMovement(event) {
  if (event.key === "Escape") {
    dismissDiscovery(true);
    closeBookDetail();
    return;
  }

  if (!state.demoMode || !state.playerPosition) {
    return;
  }

  const keyToBearing = {
    ArrowUp: 0,
    ArrowRight: 90,
    ArrowDown: 180,
    ArrowLeft: 270
  };

  const bearing = keyToBearing[event.key];
  if (bearing === undefined) {
    return;
  }

  event.preventDefault();

  const stepDistance = event.shiftKey ? 60 : 18;
  const nextPosition = destinationPoint(state.playerPosition, stepDistance, bearing);
  setPlayerPosition(nextPosition, { source: "demo", silentToast: true });
}

function updateLocationStatus() {
  if (state.demoMode) {
    ui.gpsStatus.textContent =
      "Demo-modus actief. Gebruik pijltjestoetsen of tik op de kaart om jezelf te verplaatsen.";
    return;
  }

  if (state.hasGpsLock && state.lastKnownGpsPosition?.accuracy) {
    ui.gpsStatus.textContent = `GPS actief. Nauwkeurigheid ${Math.round(state.lastKnownGpsPosition.accuracy)} meter.`;
    return;
  }

  ui.gpsStatus.textContent = "Wacht op je locatie. Geef de browser toegang tot GPS om vriendjes te ontmoeten.";
}

function hasUsablePosition() {
  return state.demoMode || (state.hasGpsLock && state.gpsAccuracy <= 50 && Date.now() - state.gpsTimestamp < 60000);
}

function canMeet(entity) {
  return Boolean(entity && hasUsablePosition() && entity.enabled && Rules.available(entity) &&
    distanceMeters(state.playerPosition, entityPoint(entity)) <= CONFIG.DISCOVERY_RADIUS);
}

function simulationTick(forceUi = false) {
  if (!state.playerPosition || (document.hidden && !forceUi)) {
    return;
  }

  for (const entity of state.entities) {
    if (!entity.enabled) {
      entity.active = false;
      entity.radarVisible = false;
      hideEntityMarker(entity);
      continue;
    }

    const distanceToPlayer = distanceMeters(state.playerPosition, entityPoint(entity));
    entity.isSimulated = distanceToPlayer <= CONFIG.SIMULATION_RADIUS;
    entity.distance = distanceToPlayer;
    entity.availableNow = Rules.available(entity);

    if (!entity.availableNow) {
      entity.distance = Number.POSITIVE_INFINITY;
      entity.active = false;
      entity.radarVisible = false;
      hideEntityMarker(entity);
      continue;
    }

    if (entity.isSimulated && hasUsablePosition()) {
      Rules.step(entity, { player: state.playerPosition,
        canOccupy: (point) => canOccupyTerrain(point, !state.terrain.ready) });
    }

    entity.distance = distanceMeters(state.playerPosition, entityPoint(entity));
    entity.active = hasUsablePosition() && entity.distance <= CONFIG.ACTIVATION_RADIUS;
    entity.radarVisible = hasUsablePosition() && entity.distance <= CONFIG.RADAR_RADIUS;

    syncEntityMarker(entity);

  }

  const now = performance.now();
  if (forceUi || now - state.lastUiRenderAt >= CONFIG.UI_UPDATE_MS) {
    renderRequests();
    renderScanList();
    updateCounters();
    renderEncounterPrompt();
    state.lastUiRenderAt = now;
  }
}


function syncEntityMarker(entity) {
  const shouldShow = entity.enabled && (state.showAllMode || (entity.availableNow && entity.active));

  if (!shouldShow) {
    hideEntityMarker(entity);
    return;
  }

  const revealed = entity.radarVisible || state.showAllMode;
  const appearance = `${revealed}:${entity.collected}:${entity.rarity}:${entity.thumbnail}`;
  const label = revealed ? entity.name : "Een Sammeltje in de buurt";

  if (!entity.marker) {
    entity.marker = L.marker([entity.currentLat, entity.currentLng], { icon: companionIcon(entity, revealed), keyboard: true, title: label })
      .on("click", () => {
        if (canMeet(entity)) enqueueDiscovery(entity);
        else showToast(revealed ? `${entity.name}: kom rustig dichterbij.` : "Een zacht signaal. Kom dichterbij om kennis te maken.");
      })
      .bindTooltip(label, {
        direction: "top",
        offset: [0, -10],
        opacity: 0.92
      })
      .addTo(state.map);
    entity.markerAppearance = appearance;
    decorateEntityMarkerForTests(entity);
    return;
  }

  entity.marker.setLatLng([entity.currentLat, entity.currentLng]);
  if (entity.markerAppearance !== appearance) {
    entity.marker.setIcon(companionIcon(entity, revealed));
    entity.marker.setTooltipContent(label);
    entity.markerAppearance = appearance;
  }
  entity.marker.getElement()?.classList.toggle("is-walking", Boolean(entity.moving));
  decorateEntityMarkerForTests(entity);
}

function companionIcon(entity, revealed) {
  return L.divIcon({ className: "companion-marker", iconSize: [52, 62], iconAnchor: [26, 52],
    html: revealed ? `<span class="companion-portrait companion-portrait--${entity.rarity}"><img src="${escapeHtml(entity.thumbnail || entity.image)}" alt="${escapeHtml(entity.name)}" />${entity.collected ? '<span class="friend-badge" aria-label="Bekend vriendje">&#10003;</span>' : ""}</span>`
      : '<span class="mystery-signal" aria-label="Onbekend signaal">?</span>' });
}

function renderEncounterPrompt() {
  const nearest = state.entities.filter((item) => item.enabled && item.availableNow && item.active)
    .sort((a, b) => a.distance - b.distance)[0];
  state.nearEntityId = nearest?.id || null;
  const ready = canMeet(nearest);
  ui.encounterButton.hidden = !ready;
  ui.encounterButton.textContent = nearest?.collected ? "Begroeten" : "Kennismaken";
  ui.nearbyMessage.textContent = !hasUsablePosition() ? (state.hasGpsLock ? "Je GPS is nog onnauwkeurig. Even geduld." : "Je wandeling begint zodra je locatie bekend is.")
    : !Rules.inside(state.playerPosition, CONFIG.WIERINGEN_POLYGON) ? "Je vriendjes wonen op Wieringen."
    : !nearest ? "Een rustig moment. Ontdek het eiland op je eigen tempo."
    : nearest.radarVisible ? `${nearest.name} ${nearest.status || "is dichtbij"}. ${Math.round(nearest.distance)} m`
    : `Een zacht signaal op ongeveer ${Math.round(nearest.distance)} meter.`;
  ui.nearbyPortrait.hidden = !nearest?.radarVisible;
  if (nearest?.radarVisible) {
    const src = nearest.thumbnail || nearest.image;
    if (ui.nearbyPortrait.getAttribute("src") !== src) ui.nearbyPortrait.src = src;
    ui.nearbyPortrait.alt = nearest.name;
  }
}

function hideEntityMarker(entity) {
  if (!entity.marker) {
    return;
  }

  entity.marker.remove();
  entity.marker = null;
}

function decorateEntityMarkerForTests(entity) {
  const path = entity.marker?.getElement();
  if (!path) {
    return;
  }

  path.setAttribute("data-testid", `entity-marker-${entity.id}`);
  path.setAttribute("data-entity-id", entity.id);
  path.setAttribute("data-entity-name", entity.name);
}

function enqueueDiscovery(entity) {
  if (state.pendingDiscoveries.has(entity.id) || state.currentDiscoveryId === entity.id) {
    return;
  }

  state.pendingDiscoveries.add(entity.id);
  state.discoveryQueue.push(entity.id);
  showNextDiscovery();
}

function showNextDiscovery() {
  if (state.currentDiscoveryId || state.discoveryQueue.length === 0) {
    return;
  }

  const nextId = state.discoveryQueue.shift();
  const entity = state.entities.find((item) => item.id === nextId);

  if (!canMeet(entity)) {
    state.pendingDiscoveries.delete(nextId);
    showNextDiscovery();
    return;
  }

  state.currentDiscoveryId = nextId;
  ui.discoveryName.textContent = entity.name;
  ui.discoveryImage.src = entity.image;
  ui.discoveryImage.alt = entity.name;
  ui.discoveryDescription.textContent = entity.description;
  document.getElementById("discovery-eyebrow").textContent = entity.collected ? "Een bekend vriendje" : "Een nieuwe ontmoeting";
  ui.collectButton.textContent = entity.collected ? "Fijn je weer te zien" : "Toevoegen aan Sammeltjesboek";
  ui.discoveryRarity.textContent = rarityLabel(entity.rarity);
  ui.discoveryRarity.className = `rarity-pill rarity-pill--${entity.rarity}`;
  ui.discoveryType.textContent = typeLabel(entity.type);
  renderEncounterRequest(entity);
  ui.discoveryModal.classList.remove("hidden");
  ui.discoveryModal.classList.add("flex");
  state.lastFocusedElement = document.activeElement;
  ui.discoveryModal.focus();
}

function dismissDiscovery(applyCooldown) {
  if (!state.currentDiscoveryId) {
    return;
  }

  const entity = state.entities.find((item) => item.id === state.currentDiscoveryId);
  if (entity && applyCooldown) {
    entity.discoveryCooldownUntil = Date.now() + 60000;
  }

  state.pendingDiscoveries.delete(state.currentDiscoveryId);
  state.currentDiscoveryId = null;
  ui.discoveryModal.classList.add("hidden");
  ui.discoveryModal.classList.remove("flex");
  restoreLastFocus();
  showNextDiscovery();
}

function collectCurrentDiscovery() {
  if (!state.currentDiscoveryId) {
    return;
  }

  const entity = state.entities.find((item) => item.id === state.currentDiscoveryId);
  if (!entity) {
    dismissDiscovery(false);
    return;
  }

  if (!canMeet(entity)) {
    showToast("Kom weer rustig dichtbij om dit vriendje te begroeten.");
    dismissDiscovery(false);
    return;
  }
  entity.collected = true;
  const alreadyKnown = state.discovered.has(entity.id);
  state.discovered.add(entity.id);
  if (!alreadyKnown) {
    state.foundDates[entity.id] = new Date().toISOString();
    try { localStorage.setItem("sammeltjes-found-dates", JSON.stringify(state.foundDates)); } catch (error) { showToast("Je browser kan je voortgang niet bewaren."); }
  }
  persistDiscoveredIds();
  syncEntityMarker(entity);
  renderBook();
  renderScanList();
  updateCounters();
  state.requests = loadFriendRequests();
  const requestGiver = state.entities.find((item) => item.id === state.requests.active?.giverId);
  const completed = alreadyKnown ? FriendRequests.complete(state.requests, entity.id, canMeet(entity) && FriendRequests.enabled(requestGiver)) : state.requests;
  const requestFinished = completed !== state.requests;
  if (requestFinished && !saveFriendRequests(completed)) return;
  renderRequests();
  showToast(requestFinished ? "Groet bezorgd! Je nieuwe stempel staat bij Verzoekjes." : alreadyKnown ? `${entity.name} is blij je weer te zien.` : `${entity.name} heeft een plekje in je Sammeltjesboek.`);
  dismissDiscovery(false);
  renderEncounterPrompt();
}


function loadFriendRequests() {
  try { return FriendRequests.normalize(JSON.parse(localStorage.getItem(FriendRequests.STORAGE_KEY) || "null")); }
  catch (error) { return FriendRequests.normalize(null); }
}

function saveFriendRequests(progress) {
  try {
    const next = FriendRequests.normalize(progress);
    localStorage.setItem(FriendRequests.STORAGE_KEY, JSON.stringify(next));
    state.requests = next;
    return true;
  } catch (error) {
    showToast("Je verzoekje kon niet worden opgeslagen. Probeer het nog eens.");
    return false;
  }
}

function renderEncounterRequest(entity) {
  const note = document.getElementById("encounter-request");
  const button = document.getElementById("accept-request-btn");
  state.requestOffer = null;
  note.hidden = true;
  button.hidden = true;
  if (!entity || !state.discovered.has(entity.id)) return;
  const active = state.requests.active;
  if (active?.targetId === entity.id) {
    const giver = state.entities.find((item) => item.id === active.giverId);
    note.hidden = false;
    document.getElementById("encounter-request-text").textContent = `Je hebt een groet van ${giver?.name || "een eilandvriendje"} bij je. Begroet ${entity.name} om het verzoekje af te ronden.`;
    return;
  }
  const offer = FriendRequests.offer(entity, state.entities, state.discovered, state.requests);
  if (!offer) return;
  state.requestOffer = offer;
  const target = state.entities.find((item) => item.id === offer.targetId);
  note.hidden = false;
  button.hidden = false;
  document.getElementById("encounter-request-text").textContent = FriendRequests.tale(entity.biome).message.replace("{target}", target.name);
}

function acceptFriendRequest() {
  const offered = state.requestOffer;
  state.requests = loadFriendRequests();
  const giver = state.entities.find((item) => item.id === state.currentDiscoveryId);
  const fresh = FriendRequests.offer(giver, state.entities, state.discovered, state.requests);
  if (!canMeet(giver) || !offered || fresh?.targetId !== offered.targetId || fresh?.giverId !== offered.giverId) {
    renderEncounterRequest(giver);
    showToast("Dit verzoekje is nu niet beschikbaar. Kijk rustig opnieuw.");
    return;
  }
  if (!saveFriendRequests({...state.requests, active:fresh})) return;
  dismissDiscovery(false);
  switchView("requests");
}

function requestPortrait(entity) {
  return entity ? `<img src="${escapeHtml(entity.thumbnail || entity.image)}" alt="${escapeHtml(entity.name)}" width="72" height="72" />` : "";
}

function renderRequests() {
  const content = document.getElementById("requests-content");
  if (!content) return;
  const active = state.requests.active;
  const completed = state.requests.completed;
  document.getElementById("request-nav-count").hidden = !active;
  document.getElementById("request-stamp-count").textContent = `${completed.length} ${completed.length === 1 ? "vriendschapsstempel" : "vriendschapsstempels"}`;
  if (state.currentView !== "requests") return;
  let html = "";
  if (active) {
    const giver = state.entities.find((item) => item.id === active.giverId);
    const target = state.entities.find((item) => item.id === active.targetId);
    const reachable = FriendRequests.enabled(giver) && FriendRequests.enabled(target) && state.discovered.has(active.targetId);
    const awake = reachable && Rules.available(target);
    const message = !reachable ? "Een van deze vriendjes is niet meer beschikbaar. Je kunt het verzoekje zonder nadeel teruggeven."
      : !awake ? `${target.name} rust nu. Kom later terug; je verzoekje blijft bewaard.`
      : `Ga naar ${target.name} en kies van dichtbij Begroeten. Met je groet maak je het verzoekje af.`;
    html += `<article class="request-letter" data-testid="active-request">
      <p class="book-eyebrow">Jouw kleine ommetje</p><h3>${escapeHtml(FriendRequests.tale(giver?.biome).title)}</h3>
      <div class="request-friends">${requestPortrait(giver)}<span aria-hidden="true">&#8594;</span>${requestPortrait(target)}</div>
      <p class="request-from">Van ${escapeHtml(giver?.name || "een eilandvriendje")} voor ${escapeHtml(target?.name || "een eilandvriendje")}</p>
      <p class="request-instruction" role="status">${escapeHtml(message)}</p>
      <div class="request-actions">${reachable ? `<button class="soft-button soft-button--primary" data-request-locate="${escapeHtml(target.id)}" type="button">Bekijk de woonplek</button>` : ""}<button class="request-return" data-request-cancel type="button">Verzoekje teruggeven</button></div>
      <p class="request-footnote">Geen tijdslimiet. Wandel op openbare paden.</p></article>`;
  } else {
    const offers = state.entities.filter((item) => Rules.available(item) && FriendRequests.offer(item, state.entities, state.discovered, state.requests));
    offers.sort((a,b) => hasUsablePosition() ? distanceMeters(state.playerPosition,a)-distanceMeters(state.playerPosition,b) : a.id.localeCompare(b.id));
    html += `<div class="request-intro"><h3>${completed.length ? "Nog een vriendelijk ommetje?" : "Een groet doet goed"}</h3><p>${state.discovered.size < 2 ? "Ontdek eerst twee Sammeltjes. Als bekende vriendjes bij elkaar in de buurt wonen, kun je een groet voor ze overbrengen." : "Begroet een bekend vriendje op de kaart. Soms heeft het een klein verzoekje voor je. Jij kiest of je helpt."}</p></div>`;
    if (offers.length) {
      html += `<p class="request-section-label">Deze vriendjes hebben iets te vragen</p>`;
      html += offers.slice(0,3).map((giver) => `<button class="request-host" type="button" data-request-locate="${escapeHtml(giver.id)}">${requestPortrait(giver)}<span><strong>${escapeHtml(giver.name)}</strong><small>Ga langs voor een verzoekje</small></span><span aria-hidden="true">&#8599;</span></button>`).join("");
    } else {
      html += `<p class="request-footnote">Nu geen verzoekjes beschikbaar. Ontmoet meer vriendjes of kijk later nog eens; er hoeft niets vandaag.</p><button class="soft-button" type="button" data-request-map>Verder wandelen</button>`;
    }
  }
  if (completed.length) {
    html += `<h3 class="request-section-label">Kleine gebaren, mooie verhalen</h3>`;
    html += [...completed].reverse().map((request,index) => {
      const giver = state.entities.find((item) => item.id === request.giverId);
      const target = state.entities.find((item) => item.id === request.targetId);
      const tale = FriendRequests.tale(giver?.biome);
      const date = new Intl.DateTimeFormat("nl-NL", {dateStyle:"long",timeZone:"Europe/Amsterdam"}).format(new Date(request.completedAt));
      return `<details class="request-memory" ${index === 0 ? "open" : ""}><summary><span class="request-stamp" aria-hidden="true">&#10003;</span><span>${escapeHtml(tale.title)}<small>${escapeHtml(date)}</small></span></summary><p>${escapeHtml(tale.story)}</p><p class="request-footnote">${escapeHtml(giver?.name || "Een eilandvriendje")} &amp; ${escapeHtml(target?.name || "een eilandvriendje")}</p></details>`;
    }).join("");
  }
  // Keep focus, expanded memories and scroll position while the simulation ticks.
  if (content.dataset.rendered !== html) { content.innerHTML = html; content.dataset.rendered = html; }
}

function handleRequestClick(event) {
  if (event.target.closest("[data-request-map]")) { switchView("map"); return; }
  if (event.target.closest("[data-request-cancel]")) {
    if (!window.confirm("Wil je dit verzoekje teruggeven? Je verliest geen stempels en kunt later opnieuw helpen.")) return;
    state.requests = loadFriendRequests();
    if (saveFriendRequests({...state.requests, active:null})) renderRequests();
    return;
  }
  const locate = event.target.closest("[data-request-locate]");
  const entity = state.entities.find((item) => item.id === locate?.dataset.requestLocate);
  if (!entity || !state.discovered.has(entity.id)) return;
  switchView("map");
  state.map.setView([entity.lat, entity.lng], 17);
  showToast(`Woonplek van ${entity.name}. Dit vriendje kan in de buurt rondlopen.`);
}

function renderScanList() {
  if (!ui.scanList || !state.playerPosition || !ui.scanList.getClientRects().length) {
    return;
  }

  const contacts = state.entities
    .map((entity) => ({
      entity,
      distance: distanceMeters(state.playerPosition, entityPoint(entity)),
      direction: cardinalDirection(bearingDegrees(state.playerPosition, entityPoint(entity)))
    }))
    .sort((left, right) => left.distance - right.distance);

  const activeCount = contacts.filter(({ entity }) => entity.enabled && !entity.collected && entity.active).length;
  const mapCount = contacts.filter(({ entity }) => entity.enabled && !entity.collected).length;
  ui.scanSummary.textContent = state.showAllMode ? `${mapCount} op kaart` : `${activeCount} actief`;

  ui.scanList.innerHTML = contacts
    .map(({ entity, distance, direction }) => {
      const status = !entity.enabled
        ? "Uitgeschakeld"
        : entity.collected
        ? "Gevonden"
        : !entity.availableNow
          ? "Slaapt nu"
        : entity.radarVisible
          ? "Radar"
          : entity.active
            ? "Actief"
            : "Ver weg";

      return `
        <div class="contact-chip contact-chip--${entity.rarity}">
          <span class="contact-chip__dot" style="background:${getRarityColor(entity.rarity)}"></span>
          <div>
            <div class="font-extrabold text-slate-800">${escapeHtml(entity.name)}</div>
            <div class="contact-chip__meta">${status} • ${escapeHtml(typeLabel(entity.type))}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-slate-800">${Math.round(distance)} m</div>
            <div class="contact-chip__meta">${direction}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBook() {
  const total = state.entities.length;
  const found = state.entities.filter((entity) => state.discovered.has(entity.id)).length;

  ui.bookSummary.textContent =
    total > 0 && found === total ? "Alle eilandvriendjes hebben een plekje in jouw boek!"
      : found > 0 ? "Vertrouwde gezichtjes, verzameld tijdens jouw wandelingen."
      : "Er wacht een eiland vol ontmoetingen op je.";
  const progress = document.getElementById("book-progress");
  progress.max = Math.max(1, total);
  progress.value = found;
  progress.setAttribute("aria-valuetext", `${found} van ${total} vriendjes gevonden`);
  document.getElementById("book-progress-label").textContent = `${found} van ${total} vriendjes`;
  document.getElementById("book-total-count").textContent = total;
  document.getElementById("book-found-count").textContent = found;
  document.querySelectorAll("[data-book-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.bookFilter === state.bookFilter));
  });

  const cards = state.entities.map((entity, index) => ({ entity, index }))
    .filter(({ entity }) => state.bookFilter !== "found" || state.discovered.has(entity.id))
    .sort((a, b) => Number(state.discovered.has(b.entity.id)) - Number(state.discovered.has(a.entity.id)));
  ui.bookGrid.innerHTML = cards
    .map(({ entity, index }) => {
      const discovered = state.discovered.has(entity.id);
      const habitat = bookHabitat(entity.biome);
      const number = String(index + 1).padStart(2, "0");
      const decoration = `<svg class="habitat-drawing" viewBox="0 0 160 70" aria-hidden="true"><use href="#habitat-${habitat.theme}"/></svg>`;
      if (!discovered) {
        return `
          <article class="book-card book-card--undiscovered habitat-${habitat.theme}">
            <div class="book-card__art"><span class="book-card__number">${number}</span>${decoration}
              <svg class="mystery-friend" viewBox="0 0 160 150" role="img" aria-label="Silhouet van een onbekend vriendje"><use href="#mystery-friend"/></svg><span class="mystery-question" aria-hidden="true">?</span>
            </div>
            <div class="book-card__copy">
              <p class="book-card__habitat">${habitat.label}</p>
              <p class="book-card__name">Wie woont hier?</p>
              <p class="book-card__mystery">Nog te ontmoeten</p>
            </div>
          </article>
        `;
      }

      return `
        <button class="book-card book-card--interactive habitat-${habitat.theme}" data-book-open="${escapeHtml(entity.id)}" type="button" aria-label="Bekijk ${escapeHtml(entity.name)}">
          <div class="book-card__art"><span class="book-card__number">${number}</span>${decoration}
            <img src="${escapeHtml(entity.thumbnail || entity.image)}" alt="${escapeHtml(entity.name)}" loading="lazy" width="240" height="240" />
            <span class="friend-stamp">Gevonden</span>
          </div>
          <div class="book-card__copy">
            <p class="book-card__habitat">${habitat.label}</p>
            <p class="book-card__name">${escapeHtml(entity.name)}</p>
            <span class="book-card__rarity"><i class="rarity-dot rarity-dot--${entity.rarity}" aria-hidden="true"></i>${rarityLabel(entity.rarity)}<span class="book-card__open" aria-hidden="true">&#8599;</span></span>
          </div>
        </button>
      `;
    })
    .join("") || `<div class="book-empty"><svg class="drawn-icon" viewBox="0 0 48 48" aria-hidden="true"><use href="#icon-map"/></svg><h3>Het eerste hoofdstuk is voor jou</h3><p>Je hebt nog geen vriendjes gevonden. Ga naar de kaart en maak buiten kennis met je eerste Sammeltje.</p><button class="soft-button soft-button--primary" type="button" data-book-walk>Terug naar de kaart</button></div>`;
}

function bookHabitat(biome) {
  if (["kust", "haven", "wad", "kwelder"].includes(biome)) return { theme: "coast", label: "Langs het water" };
  if (biome === "lucht") return { theme: "sky", label: "Op de zeewind" };
  if (biome === "mystiek") return { theme: "mystic", label: "Vol eilandmagie" };
  if (["duin", "dijk"].includes(biome)) return { theme: "dune", label: "Over duin en dijk" };
  if (biome === "schaapsveld") return { theme: "meadow", label: "Tussen de schapen" };
  return { theme: "field", label: "In het eilandgroen" };
}

function handleBookGridClick(event) {
  if (event.target.closest("[data-book-walk]")) { switchView("map"); return; }
  const trigger = event.target.closest("[data-book-open]");
  if (!trigger) {
    return;
  }

  const entity = state.entities.find((item) => item.id === trigger.dataset.bookOpen);
  if (!entity || !state.discovered.has(entity.id)) {
    return;
  }

  openBookDetail(entity);
}

function openBookDetail(entity) {
  state.currentBookDetailId = entity.id;
  ui.bookDetailName.textContent = entity.name;
  ui.bookDetailImage.src = entity.image;
  ui.bookDetailImage.alt = `${entity.name} groot in het Sammeltjesboek`;
  document.getElementById("book-detail-art").className = `book-detail-art habitat-${bookHabitat(entity.biome).theme}`;
  ui.bookDetailRarity.textContent = rarityLabel(entity.rarity);
  ui.bookDetailRarity.className = `rarity-pill rarity-pill--${entity.rarity}`;
  ui.bookDetailType.textContent = typeLabel(entity.type);
  ui.bookDetailDescription.textContent = entity.description;
  const found = state.foundDates[entity.id];
  document.getElementById("book-detail-date").textContent = found
    ? `Vriendjes sinds ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "Europe/Amsterdam" }).format(new Date(found))}`
    : "Een vertrouwd vriendje uit je verzameling.";
  ui.bookDetailModal.classList.remove("hidden");
  ui.bookDetailModal.classList.add("flex");
  state.lastFocusedElement = document.activeElement;
  ui.bookDetailModal.focus();
}

function closeBookDetail() {
  state.currentBookDetailId = null;
  ui.bookDetailModal.classList.add("hidden");
  ui.bookDetailModal.classList.remove("flex");
  restoreLastFocus();
}

function restoreLastFocus() {
  if (state.lastFocusedElement instanceof HTMLElement && state.lastFocusedElement.isConnected) {
    state.lastFocusedElement.focus();
  }
  state.lastFocusedElement = null;
}

function switchView(view) {
  window.clearTimeout(state.toastTimer);
  ui.toast.classList.remove("is-visible");
  ui.toast.classList.add("hidden");
  state.currentView = view;
  if (view !== "map" && window.matchMedia("(max-width: 767px)").matches) {
    setPanelCollapsed("hud", ui.hudPanel, ui.hudPanelToggle, true);
  }
  if (view !== "book") {
    closeBookDetail();
  }

  ui.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
    button.setAttribute("aria-current", button.dataset.view === view ? "page" : "false");
  });

  ui.bookPanel.classList.toggle("hidden", view !== "book");
  ui.requestsPanel.classList.toggle("hidden", view !== "requests");
  ui.scanPanel.classList.toggle("hidden", view !== "map");
  ui.recenterButton.classList.toggle("hidden", view !== "map");
  ui.recenterButton.hidden = view !== "map";
  document.body.dataset.gameView = view;
  document.getElementById("nearby-panel").hidden = view !== "map";
  if (view === "requests") renderRequests();
}

function updateCounters() {
  const found = state.entities.filter((entity) => state.discovered.has(entity.id)).length;
  const active = state.entities.filter((entity) => entity.enabled && !entity.collected && entity.active).length;
  ui.foundCounter.textContent = `${found} / ${state.entities.length}`;
  ui.activeCounter.textContent = String(active);
}

const terrainService = window.SammeltjesTerrain.create(CONFIG.WIERINGEN_POLYGON);
async function maybeRefreshTerrain() {
  if (!state.playerPosition || !hasUsablePosition()) return;
  await terrainService.refresh(state.playerPosition);
  setTerrainStatus(terrainService.status);
}
function canOccupyTerrain(point) {
  return terrainService.canOccupy(point);
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove("hidden");
  requestAnimationFrame(() => ui.toast.classList.add("is-visible"));

  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    ui.toast.classList.remove("is-visible");
    window.setTimeout(() => ui.toast.classList.add("hidden"), 220);
  }, 2200);
}

function setTerrainStatus(label) {
  ui.terrainStatus.textContent = navigator.onLine ? label : "offline";
}

function updateConnectionStatus() {
  const offline = !navigator.onLine;
  document.body.classList.toggle("is-offline", offline);
  ui.terrainStatus.title = offline
    ? "Offline: kaarttegels en terrein gebruiken eerder opgeslagen gegevens."
    : "Terreindetectie voor wegen, water en gebouwen.";
  if (offline) {
    setTerrainStatus("offline");
  } else if (ui.terrainStatus.textContent === "offline") {
    setTerrainStatus(terrainService.status);
  }
}

function loadDiscoveredIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(CONFIG.PLAYER_STORAGE_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch (error) {
    return [];
  }
}

function loadFoundDates() {
  try {
    const dates = JSON.parse(localStorage.getItem("sammeltjes-found-dates") || "{}");
    return Object.fromEntries(Object.entries(dates).filter(([, date]) => typeof date === "string" && Number.isFinite(Date.parse(date))));
  } catch (error) { return {}; }
}

function loadCollapsedPanelState() {
  const compactScreen = window.matchMedia("(max-width: 767px)").matches;
  const defaults = {
    hud: compactScreen,
    scan: compactScreen
  };

  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || "{}")
    };
  } catch (error) {
    return defaults;
  }
}

function saveCollapsedPanelState(value) {
  localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(value));
}

function persistDiscoveredIds() {
  try { localStorage.setItem(CONFIG.PLAYER_STORAGE_KEY, JSON.stringify(Array.from(state.discovered))); }
  catch (error) { showToast("Je browser kan je voortgang niet bewaren. Houd deze pagina open."); }
}

function defaultBehaviorForType(type) {
  if (type === "wild") {
    return "scared";
  }

  if (type === "roaming") {
    return "curious";
  }

  return "shy";
}

function normalizeSpeedKmh(value, rarity) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return Number(numericValue.toFixed(1));
  }

  if (rarity === "legendary") {
    return 1.6;
  }

  if (rarity === "rare") {
    return 2.1;
  }

  return 2.6;
}

function kmhToMps(speedKmh) {
  return speedKmh / 3.6;
}

function normalizeRandomHours(value) {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return 6;
  }

  return Math.min(24, Math.max(1, numericValue));
}

function normalizeEntityRadius(value) {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return 80;
  }

  return Math.min(500, Math.max(50, numericValue));
}


function oneOf(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

function entityPoint(entity) {
  return { lat: entity.currentLat, lng: entity.currentLng };
}

function normalizeLatLng(latlng) {
  return {
    lat: Number(latlng.lat),
    lng: Number(latlng.lng)
  };
}

function getRarityColor(rarity) {
  if (rarity === "legendary") {
    return "#f0bf4c";
  }

  if (rarity === "rare") {
    return "#4e8dff";
  }

  return "#4cb66b";
}

function rarityLabel(rarity) {
  if (rarity === "legendary") {
    return "Legendarisch";
  }

  if (rarity === "rare") {
    return "Zeldzaam";
  }

  return "Gewoon";
}

function typeLabel(type) {
  if (type === "fixed") {
    return "Vaste plek";
  }

  if (type === "roaming") {
    return "Zwervend";
  }

  return "Wild";
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createExpandedMapBounds(bounds, marginMeters) {
  const centerLat = (bounds.south + bounds.north) / 2;
  const marginLat = marginMeters / 111320;
  const marginLng = marginMeters / (111320 * Math.cos(toRadians(centerLat)));
  return L.latLngBounds(
    [bounds.south - marginLat, bounds.west - marginLng],
    [bounds.north + marginLat, bounds.east + marginLng]
  );
}

function closePolygonRing(points) {
  const pathPoints = points.map((point) => [point.lat, point.lng]);
  const [firstLat, firstLng] = pathPoints[0];
  const [lastLat, lastLng] = pathPoints.at(-1);
  if (firstLat !== lastLat || firstLng !== lastLng) {
    pathPoints.push([firstLat, firstLng]);
  }
  return pathPoints;
}

function offsetPolygonOutward(points, offsetMeters) {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const isClosed = firstPoint?.lat === lastPoint?.lat && firstPoint?.lng === lastPoint?.lng;
  const uniquePoints = (isClosed ? points.slice(0, -1) : points).filter(Boolean);
  const center = uniquePoints.reduce(
    (result, point) => ({ lat: result.lat + point.lat, lng: result.lng + point.lng }),
    { lat: 0, lng: 0 }
  );
  center.lat /= uniquePoints.length;
  center.lng /= uniquePoints.length;

  return points.map((point) => {
    const distance = distanceMeters(center, point);
    return destinationPoint(center, distance + offsetMeters, bearingDegrees(center, point));
  });
}

function distanceMeters(from, to) {
  const earthRadius = 6371000;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(from, distance, bearing) {
  const earthRadius = 6371000;
  const angularDistance = distance / earthRadius;
  const bearingRad = toRadians(bearing);
  const lat1 = toRadians(from.lat);
  const lng1 = toRadians(from.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2)
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const xi = polygon[index].lng;
    const yi = polygon[index].lat;
    const xj = polygon[previous].lng;
    const yj = polygon[previous].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function isClosedPolygon(coords) {
  if (coords.length < 4) {
    return false;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  return distanceMeters(first, last) < 6;
}

function isNearLine(point, line, thresholdMeters) {
  for (let index = 0; index < line.length - 1; index += 1) {
    if (distanceToSegmentMeters(point, line[index], line[index + 1]) <= thresholdMeters) {
      return true;
    }
  }

  return false;
}

function distanceToSegmentMeters(point, start, end) {
  const originLat = (point.lat + start.lat + end.lat) / 3;
  const projectedPoint = projectToMeters(point, originLat);
  const projectedStart = projectToMeters(start, originLat);
  const projectedEnd = projectToMeters(end, originLat);

  const deltaX = projectedEnd.x - projectedStart.x;
  const deltaY = projectedEnd.y - projectedStart.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared === 0) {
    return Math.hypot(projectedPoint.x - projectedStart.x, projectedPoint.y - projectedStart.y);
  }

  let t =
    ((projectedPoint.x - projectedStart.x) * deltaX +
      (projectedPoint.y - projectedStart.y) * deltaY) /
    lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const nearestX = projectedStart.x + t * deltaX;
  const nearestY = projectedStart.y + t * deltaY;

  return Math.hypot(projectedPoint.x - nearestX, projectedPoint.y - nearestY);
}

function projectToMeters(point, originLat) {
  const earthRadius = 6371000;
  return {
    x: toRadians(point.lng) * earthRadius * Math.cos(toRadians(originLat)),
    y: toRadians(point.lat) * earthRadius
  };
}

function cardinalDirection(bearing) {
  const directions = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  return directions[Math.round(bearing / 45) % directions.length];
}

function randomPointInPolygon(polygon) {
  const bounds = polygon.reduce(
    (accumulator, point) => ({
      minLat: Math.min(accumulator.minLat, point.lat),
      maxLat: Math.max(accumulator.maxLat, point.lat),
      minLng: Math.min(accumulator.minLng, point.lng),
      maxLng: Math.max(accumulator.maxLng, point.lng)
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY
    }
  );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = {
      lat: randomBetween(bounds.minLat, bounds.maxLat),
      lng: randomBetween(bounds.minLng, bounds.maxLng)
    };

    if (pointInPolygon(candidate, polygon)) {
      return candidate;
    }
  }

  return null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isE2eMode() {
  return new URLSearchParams(window.location.search).get("e2e") === "1";
}

function installTestApi() {
  window.__SAMMELTJES_TEST_API__ = {
    setDemoMode(enabled) {
      if (Boolean(enabled) !== state.demoMode) {
        toggleDemoMode();
      }
      return state.demoMode;
    },
    setShowAll(enabled) {
      if (Boolean(enabled) !== state.showAllMode) {
        toggleShowAllMode();
      }
      return state.showAllMode;
    },
    setPlayerPosition(lat, lng) {
      setPlayerPosition({ lat, lng }, { source: "demo", silentToast: true });
      simulationTick(true);
      return { ...state.playerPosition };
    },
    setMapCenter(lat, lng, zoom = 14) {
      state.map.setView([lat, lng], zoom, { animate: false });
      return this.getMapCenter();
    },
    getMapCenter() {
      const center = state.map.getCenter();
      return { lat: center.lat, lng: center.lng, zoom: state.map.getZoom() };
    },
    getMapLimits() {
      const bounds = L.latLngBounds(state.map.options.maxBounds);
      return {
        minZoom: state.map.getMinZoom(),
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      };
    },
    async refreshData() {
      await refreshSammeltjesData({ silent: true });
      return this.getStateSnapshot();
    },
    clearDiscovered() {
      state.discovered = new Set();
      persistDiscoveredIds();
      for (const entity of state.entities) {
        entity.collected = false;
      }
      renderBook();
      renderScanList();
      renderRequests();
      simulationTick(true);
      return true;
    },
    getEntitySnapshot(id) {
      const entity = state.entities.find((item) => item.id === id);
      if (!entity) {
        return null;
      }

      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        rarity: entity.rarity,
        behavior: entity.behavior,
        speedKmh: entity.speedKmh,
        enabled: entity.enabled,
        radius: entity.radius,
        active: entity.active,
        availableNow: entity.availableNow,
        collected: entity.collected,
        distance: entity.distance,
        currentLat: entity.currentLat,
        currentLng: entity.currentLng,
        markerVisible: Boolean(entity.marker)
      };
    },
    getStateSnapshot() {
      return {
        currentView: state.currentView,
        demoMode: state.demoMode,
        showAllMode: state.showAllMode,
        discoveredCount: state.discovered.size,
        visibleMarkers: state.entities.filter((entity) => Boolean(entity.marker)).length,
        discoveryModalOpen: !ui.discoveryModal.classList.contains("hidden"),
        bookDetailOpen: !ui.bookDetailModal.classList.contains("hidden"),
        toastText: ui.toast.textContent || "",
        scanSummary: ui.scanSummary?.textContent || ""
      };
    },
    clickEntityMarker(id) {
      const entity = state.entities.find((item) => item.id === id);
      entity?.marker?.fire("click");
      return entity ? this.getEntitySnapshot(id) : null;
    }
  };
}
