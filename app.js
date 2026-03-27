const CONFIG = {
  ACTIVATION_RADIUS: 300,
  RADAR_RADIUS: 60,
  DISCOVERY_RADIUS: 20,
  SIMULATION_RADIUS: 1000,
  TERRAIN_FETCH_RADIUS: 1200,
  TERRAIN_REFRESH_DISTANCE: 350,
  ROAMING_UPDATE_MS: 200,
  PLAYER_STORAGE_KEY: "sammeltjes-wieringen-discovered",
  DEFAULT_CENTER: { lat: 52.9005, lng: 4.9485 },
  WIERINGEN_POLYGON: [
    { lat: 52.9278, lng: 4.876 },
    { lat: 52.931, lng: 4.904 },
    { lat: 52.9285, lng: 4.949 },
    { lat: 52.921, lng: 4.987 },
    { lat: 52.91, lng: 4.999 },
    { lat: 52.894, lng: 5.0 },
    { lat: 52.8805, lng: 4.985 },
    { lat: 52.8738, lng: 4.95 },
    { lat: 52.8765, lng: 4.91 },
    { lat: 52.886, lng: 4.883 },
    { lat: 52.906, lng: 4.8725 }
  ],
  OVERPASS_ENDPOINTS: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ]
};
const DATA_VERSION_KEY = "sammeltjes-data-version";
const PANEL_STATE_KEY = "sammeltjes-ui-panels";

const state = {
  map: null,
  playerMarker: null,
  radarCircle: null,
  activationCircle: null,
  terrain: {
    ready: false,
    isLoading: false,
    center: null,
    allowedPolygons: [],
    forbiddenPolygons: [],
    allowedLines: [],
    forbiddenLines: []
  },
  playerPosition: null,
  hasGpsLock: false,
  hasCenteredMap: false,
  demoMode: false,
  showAllMode: false,
  lastKnownGpsPosition: null,
  entities: [],
  currentView: "map",
  discovered: new Set(loadDiscoveredIds()),
  discoveryQueue: [],
  pendingDiscoveries: new Set(),
  currentDiscoveryId: null,
  currentBookDetailId: null,
  simulationTimer: null,
  toastTimer: null,
  isRefreshingData: false,
  lastDataVersion: localStorage.getItem(DATA_VERSION_KEY) || null,
  collapsedPanels: loadCollapsedPanelState()
};

const ui = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  applyCollapsedPanelState();
  bindUi();
  initMap();

  const data = await loadSammeltjesData();
  state.entities = createEntities(data);
  renderBook();
  renderScanList();
  updateCounters();
  setTerrainStatus("basis");

  setPlayerPosition(CONFIG.DEFAULT_CENTER, { source: "fallback", silentToast: true });
  startGeolocation();
  state.simulationTimer = window.setInterval(simulationTick, CONFIG.ROAMING_UPDATE_MS);
  simulationTick();
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
  ui.radarPanel = document.getElementById("radar-panel");
  ui.bookPanel = document.getElementById("book-panel");
  ui.miniRadarPanel = document.getElementById("mini-radar-panel");
  ui.miniRadarSignals = document.getElementById("mini-radar-signals");
  ui.miniRadarSummary = document.getElementById("mini-radar-summary");
  ui.fullRadarSignals = document.getElementById("full-radar-signals");
  ui.radarList = document.getElementById("radar-list");
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
  ui.hudPanel = document.getElementById("hud-panel");
  ui.miniRadarPanelToggle = document.getElementById("toggle-mini-radar-panel");
  ui.hudPanelToggle = document.getElementById("toggle-hud-panel");
  ui.scanPanelToggle = document.getElementById("toggle-scan-panel");
  ui.hudPanelBody = document.getElementById("hud-panel-body");
  ui.miniRadarPanelBody = document.getElementById("mini-radar-panel-body");
  ui.scanPanelBody = document.getElementById("scan-panel-body");
}

function bindUi() {
  ui.toggleAllButton.addEventListener("click", toggleShowAllMode);
  ui.demoToggleButton.addEventListener("click", toggleDemoMode);

  document.getElementById("recenter-btn").addEventListener("click", () => {
    if (!state.playerPosition) {
      return;
    }

    const focusPosition =
      !state.demoMode && state.lastKnownGpsPosition ? state.lastKnownGpsPosition : state.playerPosition;

    state.map.setView([focusPosition.lat, focusPosition.lng], 16, { animate: true });
  });

  document.getElementById("open-radar-btn").addEventListener("click", () => switchView("radar"));
  document.getElementById("close-radar-btn").addEventListener("click", () => switchView("map"));
  document.getElementById("close-book-btn").addEventListener("click", () => switchView("map"));
  document.getElementById("dismiss-discovery-btn").addEventListener("click", () => dismissDiscovery(true));
  document.getElementById("dismiss-book-detail-btn").addEventListener("click", closeBookDetail);
  document.getElementById("book-detail-backdrop").addEventListener("click", closeBookDetail);
  ui.collectButton.addEventListener("click", collectCurrentDiscovery);
  ui.bookGrid.addEventListener("click", handleBookGridClick);

  bindCollapsiblePanel("hud", ui.hudPanel, ui.hudPanelToggle);
  bindCollapsiblePanel("mini-radar", ui.miniRadarPanel, ui.miniRadarPanelToggle);
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
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== DATA_VERSION_KEY || !event.newValue || event.newValue === state.lastDataVersion) {
      return;
    }

    state.lastDataVersion = event.newValue;
    void refreshSammeltjesData({ silent: false });
  });
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
    ["mini-radar", ui.miniRadarPanel, ui.miniRadarPanelToggle],
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
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: false
  }).setView([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-bijdragers"
  }).addTo(state.map);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.control.attribution({ position: "topright", prefix: false }).addTo(state.map);

  const playerIcon = L.divIcon({
    className: "",
    html: '<div class="player-marker"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  state.playerMarker = L.marker([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], {
    icon: playerIcon
  }).addTo(state.map);

  state.activationCircle = L.circle([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], {
    radius: CONFIG.ACTIVATION_RADIUS,
    color: "#7ad8bb",
    weight: 1.6,
    opacity: 0.45,
    fillColor: "#aef2d8",
    fillOpacity: 0.04,
    dashArray: "5 8"
  }).addTo(state.map);

  state.radarCircle = L.circle([CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng], {
    radius: CONFIG.RADAR_RADIUS,
    color: "#32b47c",
    weight: 2.2,
    opacity: 0.85,
    fillColor: "#6af0ad",
    fillOpacity: 0.08
  }).addTo(state.map);

  state.map.on("click", (event) => {
    if (state.hasGpsLock && !state.demoMode) {
      return;
    }

    setPlayerPosition(event.latlng, { source: "demo" });
    if (state.demoMode) {
      showToast("Demo-modus: je speler is naar deze plek verplaatst.");
    }
  });
}

async function loadSammeltjesData() {
  try {
    const response = await fetch("data/sammeltjes.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Kon JSON niet laden (${response.status}).`);
    }

    return await response.json();
  } catch (error) {
    const fallbackNode = document.getElementById("sammeltjes-fallback");
    if (fallbackNode) {
      return JSON.parse(fallbackNode.textContent.trim());
    }

    throw error;
  }
}

async function refreshSammeltjesData(options = {}) {
  if (state.isRefreshingData) {
    return;
  }

  state.isRefreshingData = true;

  try {
    const data = await loadSammeltjesData();
    replaceEntities(data);

    if (!options.silent) {
      showToast("Sammeltjesdata ververst vanuit de admin.");
    }
  } finally {
    state.isRefreshingData = false;
  }
}

function replaceEntities(records) {
  for (const entity of state.entities) {
    hideEntityMarker(entity);
  }

  state.discoveryQueue = [];
  state.pendingDiscoveries.clear();
  state.currentDiscoveryId = null;
  state.currentBookDetailId = null;
  ui.discoveryModal.classList.add("hidden");
  ui.discoveryModal.classList.remove("flex");
  ui.bookDetailModal.classList.add("hidden");
  ui.bookDetailModal.classList.remove("flex");

  state.entities = createEntities(records);
  renderBook();
  renderScanList();
  renderRadar();
  updateCounters();
  simulationTick();
}

function createEntities(records) {
  return records.map((record) => {
    const entity = {
      ...record,
      homeLat: record.lat,
      homeLng: record.lng,
      currentLat: record.lat,
      currentLng: record.lng,
      target: null,
      distance: Number.POSITIVE_INFINITY,
      active: false,
      radarVisible: false,
      availableNow: true,
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
        ["all-day", "morning", "afternoon", "evening", "night", "random-hours"],
        "all-day"
      ),
      randomHoursPerDay: normalizeRandomHours(record.randomHoursPerDay)
    };

    if (entity.type === "roaming" || entity.type === "wild") {
      entity.target = chooseRoamingTarget(entity);
    }

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
      if (!state.hasGpsLock) {
        updateLocationStatus();
      }
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
  state.activationCircle.setLatLng(nextPosition);
  state.radarCircle.setLatLng(nextPosition);

  if (!state.hasCenteredMap || options.source === "gps") {
    state.map.setView([nextPosition.lat, nextPosition.lng], state.hasCenteredMap ? state.map.getZoom() : 15, {
      animate: state.hasCenteredMap
    });
    state.hasCenteredMap = true;
  }

  void maybeRefreshTerrain();
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

  ui.gpsStatus.textContent = "Geen GPS-lock. Zet demo besturen aan of tik op de kaart voor testmodus.";
}

function simulationTick() {
  if (!state.playerPosition) {
    return;
  }

  for (const entity of state.entities) {
    if (entity.collected) {
      hideEntityMarker(entity);
      continue;
    }

    const distanceToPlayer = distanceMeters(state.playerPosition, entityPoint(entity));
    entity.isSimulated = distanceToPlayer <= CONFIG.SIMULATION_RADIUS;
    entity.distance = distanceToPlayer;
    entity.availableNow = isEntityAvailableNow(entity);

    if (!entity.availableNow) {
      entity.distance = Number.POSITIVE_INFINITY;
      entity.active = false;
      entity.radarVisible = false;
      hideEntityMarker(entity);
      continue;
    }

    if (entity.isSimulated && (entity.type === "roaming" || entity.type === "wild")) {
      moveRoamingEntity(entity);
    }

    if (entity.isSimulated && entity.type === "wild" && state.terrain.ready && !entity.terrainValidated) {
      respawnWildEntity(entity, false);
    }

    entity.distance = distanceMeters(state.playerPosition, entityPoint(entity));
    entity.active = entity.distance <= CONFIG.ACTIVATION_RADIUS;
    entity.radarVisible = entity.distance <= CONFIG.RADAR_RADIUS;

    syncEntityMarker(entity);

    if (
      entity.distance <= CONFIG.DISCOVERY_RADIUS &&
      !state.discovered.has(entity.id) &&
      Date.now() > entity.discoveryCooldownUntil
    ) {
      enqueueDiscovery(entity);
    }
  }

  renderRadar();
  renderScanList();
  updateCounters();
}

function moveRoamingEntity(entity) {
  if (entity.behavior === "shy" && entity.distance <= CONFIG.RADAR_RADIUS) {
    entity.target = null;
    return;
  }

  if (entity.distance <= CONFIG.RADAR_RADIUS) {
    const reactiveTarget = chooseReactiveTarget(entity);
    if (reactiveTarget) {
      entity.target = reactiveTarget;
    }
  }

  if (!entity.target) {
    entity.target = chooseRoamingTarget(entity);
    return;
  }

  const current = entityPoint(entity);
  const targetDistance = distanceMeters(current, entity.target);

  if (targetDistance < 5) {
    entity.target = chooseRoamingTarget(entity);
    return;
  }

  const stepDistance = entity.speedMps * (CONFIG.ROAMING_UPDATE_MS / 1000);
  const stepBearing = bearingDegrees(current, entity.target);
  const nextPoint = destinationPoint(current, stepDistance, stepBearing);

  const homeDistance = distanceMeters({ lat: entity.homeLat, lng: entity.homeLng }, nextPoint);
  const allowed = canOccupyTerrain(nextPoint, !state.terrain.ready);

  if (homeDistance > entity.radius || !allowed) {
    entity.target = chooseRoamingTarget(entity);
    return;
  }

  entity.currentLat = nextPoint.lat;
  entity.currentLng = nextPoint.lng;

  if (entity.marker) {
    entity.marker.setLatLng(nextPoint);
  }
}

function chooseRoamingTarget(entity) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = destinationPoint(
      { lat: entity.homeLat, lng: entity.homeLng },
      randomBetween(entity.radius * 0.25, Math.max(entity.radius, entity.radius * 0.75)),
      randomBetween(0, 360)
    );

    if (
      distanceMeters({ lat: entity.homeLat, lng: entity.homeLng }, candidate) <= entity.radius &&
      canOccupyTerrain(candidate, !state.terrain.ready)
    ) {
      return candidate;
    }
  }

  return { lat: entity.homeLat, lng: entity.homeLng };
}

function chooseReactiveTarget(entity) {
  if (!state.playerPosition || entity.type === "fixed") {
    return null;
  }

  if (entity.behavior === "curious") {
    return clampEntityTarget(entity, state.playerPosition);
  }

  if (entity.behavior === "scared") {
    const awayBearing = (bearingDegrees(entityPoint(entity), state.playerPosition) + 180) % 360;
    const awayDistance = Math.max(CONFIG.RADAR_RADIUS, entity.radius || CONFIG.ACTIVATION_RADIUS * 0.5);
    const candidate = destinationPoint(entityPoint(entity), Math.min(awayDistance, 45), awayBearing);
    return clampEntityTarget(entity, candidate);
  }

  return null;
}

function clampEntityTarget(entity, candidate) {
  if (entity.type === "wild") {
    if (pointInPolygon(candidate, CONFIG.WIERINGEN_POLYGON) && canOccupyTerrain(candidate, !state.terrain.ready)) {
      return candidate;
    }

    return chooseRoamingTarget(entity);
  }

  const homePoint = { lat: entity.homeLat, lng: entity.homeLng };
  if (distanceMeters(homePoint, candidate) <= entity.radius && canOccupyTerrain(candidate, !state.terrain.ready)) {
    return candidate;
  }

  const limitedDistance = Math.max(6, Math.min(entity.radius, distanceMeters(homePoint, candidate)));
  const limitedCandidate = destinationPoint(homePoint, limitedDistance, bearingDegrees(homePoint, candidate));
  if (canOccupyTerrain(limitedCandidate, !state.terrain.ready)) {
    return limitedCandidate;
  }

  return chooseRoamingTarget(entity);
}

function respawnWildEntity(entity, allowLooseTerrain) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = destinationPoint(
      { lat: entity.homeLat, lng: entity.homeLng },
      randomBetween(0, entity.radius || 1400),
      randomBetween(0, 360)
    );

    if (!pointInPolygon(candidate, CONFIG.WIERINGEN_POLYGON)) {
      continue;
    }

    if (!canOccupyTerrain(candidate, allowLooseTerrain)) {
      continue;
    }

    entity.currentLat = candidate.lat;
    entity.currentLng = candidate.lng;
    entity.terrainValidated = state.terrain.ready;

    if (entity.marker) {
      entity.marker.setLatLng(candidate);
    }

    return;
  }

  const fallback = randomPointInPolygon(CONFIG.WIERINGEN_POLYGON) || CONFIG.DEFAULT_CENTER;
  entity.currentLat = fallback.lat;
  entity.currentLng = fallback.lng;
  entity.terrainValidated = false;
}

function syncEntityMarker(entity) {
  const shouldShow = !entity.collected && (state.showAllMode || entity.active);

  if (!shouldShow) {
    hideEntityMarker(entity);
    return;
  }

  const style = {
    color: getRarityColor(entity.rarity),
    fillColor: getRarityColor(entity.rarity),
    fillOpacity: entity.radarVisible ? 0.82 : state.showAllMode && !entity.active ? 0.2 : 0.58,
    opacity: state.showAllMode && !entity.active ? 0.65 : 0.95,
    radius: entity.radarVisible ? 11 : state.showAllMode && !entity.active ? 6 : 8,
    weight: 2
  };

  if (!entity.marker) {
    entity.marker = L.circleMarker([entity.currentLat, entity.currentLng], style)
      .bindTooltip(entity.name, {
        direction: "top",
        offset: [0, -10],
        opacity: 0.92
      })
      .addTo(state.map);
    return;
  }

  entity.marker.setLatLng([entity.currentLat, entity.currentLng]);
  entity.marker.setStyle(style);
}

function hideEntityMarker(entity) {
  if (!entity.marker) {
    return;
  }

  entity.marker.remove();
  entity.marker = null;
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

  if (!entity || entity.collected) {
    state.pendingDiscoveries.delete(nextId);
    showNextDiscovery();
    return;
  }

  state.currentDiscoveryId = nextId;
  ui.discoveryName.textContent = entity.name;
  ui.discoveryImage.src = entity.image;
  ui.discoveryImage.alt = entity.name;
  ui.discoveryDescription.textContent = entity.description;
  ui.discoveryRarity.textContent = rarityLabel(entity.rarity);
  ui.discoveryRarity.className = `rarity-pill rarity-pill--${entity.rarity}`;
  ui.discoveryType.textContent = typeLabel(entity.type);
  ui.discoveryModal.classList.remove("hidden");
  ui.discoveryModal.classList.add("flex");
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

  entity.collected = true;
  state.discovered.add(entity.id);
  persistDiscoveredIds();
  hideEntityMarker(entity);
  renderBook();
  renderScanList();
  renderRadar();
  updateCounters();
  showToast(`${entity.name} is toegevoegd aan je Sammeltjesboek.`);
  dismissDiscovery(false);
}

function renderRadar() {
  const contacts = state.entities
    .filter((entity) => !entity.collected && entity.radarVisible)
    .sort((left, right) => left.distance - right.distance);

  renderRadarSignals(ui.miniRadarSignals, contacts, false);
  renderRadarSignals(ui.fullRadarSignals, contacts, true);

  ui.miniRadarSummary.textContent = contacts.length
    ? `${contacts.length} signaal${contacts.length === 1 ? "" : "en"} binnen ${CONFIG.RADAR_RADIUS} meter.`
    : "Nog geen signalen binnen bereik.";

  if (!contacts.length) {
    ui.radarList.innerHTML = '<p class="contact-chip__meta">Nog geen signalen binnen 60 meter. Loop verder over Wieringen.</p>';
    return;
  }

  ui.radarList.innerHTML = contacts
    .map((entity) => {
      const direction = cardinalDirection(bearingDegrees(state.playerPosition, entityPoint(entity)));
      return `
        <div class="contact-chip contact-chip--${entity.rarity}">
          <span class="contact-chip__dot" style="background:${getRarityColor(entity.rarity)}"></span>
          <div>
            <div class="font-extrabold text-slate-800">${escapeHtml(entity.name)}</div>
            <div class="contact-chip__meta">${escapeHtml(typeLabel(entity.type))}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-slate-800">${Math.round(entity.distance)} m</div>
            <div class="contact-chip__meta">${direction}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRadarSignals(container, contacts, showDistance) {
  const gridSize = container.parentElement.clientWidth || (showDistance ? 312 : 128);
  const center = gridSize / 2;
  const maxRadiusPx = center * 0.86;

  if (!state.playerPosition) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = contacts
    .map((entity) => {
      const bearing = bearingDegrees(state.playerPosition, entityPoint(entity));
      const angleRad = (bearing * Math.PI) / 180;
      const scaledRadius = Math.max(10, (entity.distance / CONFIG.RADAR_RADIUS) * maxRadiusPx);
      const x = center + Math.sin(angleRad) * scaledRadius;
      const y = center - Math.cos(angleRad) * scaledRadius;
      const distanceBadge = showDistance
        ? `<span class="radar-distance-badge">${Math.round(entity.distance)}m</span>`
        : "";

      return `
        <div
          class="radar-signal radar-signal--${entity.rarity}"
          style="left:${x}px; top:${y}px;"
          title="${escapeHtml(entity.name)}"
        >
          ${distanceBadge}
        </div>
      `;
    })
    .join("");
}

function renderScanList() {
  if (!ui.scanList || !state.playerPosition) {
    return;
  }

  const contacts = state.entities
    .map((entity) => ({
      entity,
      distance: distanceMeters(state.playerPosition, entityPoint(entity)),
      direction: cardinalDirection(bearingDegrees(state.playerPosition, entityPoint(entity)))
    }))
    .sort((left, right) => left.distance - right.distance);

  const activeCount = contacts.filter(({ entity }) => !entity.collected && entity.active).length;
  const mapCount = contacts.filter(({ entity }) => !entity.collected).length;
  ui.scanSummary.textContent = state.showAllMode ? `${mapCount} op kaart` : `${activeCount} actief`;

  ui.scanList.innerHTML = contacts
    .map(({ entity, distance, direction }) => {
      const status = entity.collected
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
    found > 0
      ? `Je hebt ${found} van de ${total} Sammeltjes gevonden.`
      : "Je hebt nog geen Sammeltjes toegevoegd.";

  ui.bookGrid.innerHTML = state.entities
    .map((entity) => {
      const discovered = state.discovered.has(entity.id);
      if (!discovered) {
        return `
          <article class="book-card book-card--undiscovered">
            <img src="${entity.image}" alt="Verborgen silhouet" loading="lazy" />
            <div>
              <p class="book-card__name text-slate-500">Onbekend Sammeltje</p>
              <p class="book-card__mystery">Silhouet zichtbaar. Loop dichterbij om dit vriendje te onthullen.</p>
            </div>
          </article>
        `;
      }

      return `
        <button class="book-card book-card--interactive" data-book-open="${escapeHtml(entity.id)}" type="button">
          <img src="${entity.image}" alt="${escapeHtml(entity.name)}" loading="lazy" />
          <div class="flex items-center gap-2">
            <span class="rarity-pill rarity-pill--${entity.rarity}">${rarityLabel(entity.rarity)}</span>
            <span class="status-chip status-chip--subtle">${escapeHtml(typeLabel(entity.type))}</span>
          </div>
          <div>
            <p class="book-card__name text-slate-800">${escapeHtml(entity.name)}</p>
            <p class="book-card__description">${escapeHtml(entity.description)}</p>
          </div>
        </button>
      `;
    })
    .join("");
}

function handleBookGridClick(event) {
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
  ui.bookDetailRarity.textContent = rarityLabel(entity.rarity);
  ui.bookDetailRarity.className = `rarity-pill rarity-pill--${entity.rarity}`;
  ui.bookDetailType.textContent = typeLabel(entity.type);
  ui.bookDetailDescription.textContent = entity.description;
  ui.bookDetailModal.classList.remove("hidden");
  ui.bookDetailModal.classList.add("flex");
}

function closeBookDetail() {
  state.currentBookDetailId = null;
  ui.bookDetailModal.classList.add("hidden");
  ui.bookDetailModal.classList.remove("flex");
}

function switchView(view) {
  state.currentView = view;
  if (view !== "book") {
    closeBookDetail();
  }

  ui.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  ui.bookPanel.classList.toggle("hidden", view !== "book");
  ui.radarPanel.classList.toggle("hidden", view !== "radar");
  ui.miniRadarPanel.classList.toggle("hidden", view !== "map");
  ui.scanPanel.classList.toggle("hidden", view !== "map");
}

function updateCounters() {
  const found = state.entities.filter((entity) => state.discovered.has(entity.id)).length;
  const active = state.entities.filter((entity) => !entity.collected && entity.active).length;
  ui.foundCounter.textContent = `${found} / ${state.entities.length}`;
  ui.activeCounter.textContent = String(active);
}

async function maybeRefreshTerrain() {
  if (
    state.terrain.isLoading ||
    !state.playerPosition ||
    (state.terrain.center &&
      distanceMeters(state.terrain.center, state.playerPosition) < CONFIG.TERRAIN_REFRESH_DISTANCE)
  ) {
    return;
  }

  state.terrain.isLoading = true;
  setTerrainStatus("laden");

  const query = `
    [out:json][timeout:20];
    (
      way["building"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["natural"="water"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["landuse"~"reservoir|basin"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["waterway"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["highway"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["landuse"~"grass|farmland|meadow"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["leisure"="park"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
      way["natural"="grassland"](around:${CONFIG.TERRAIN_FETCH_RADIUS},${state.playerPosition.lat},${state.playerPosition.lng});
    );
    out geom;
  `;

  try {
    let terrainData = null;

    for (const endpoint of CONFIG.OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: query
        });

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        terrainData = await response.json();
        break;
      } catch (error) {
        terrainData = null;
      }
    }

    if (!terrainData) {
      throw new Error("Geen terreinrespons ontvangen.");
    }

    hydrateTerrain(terrainData);
    state.terrain.center = { ...state.playerPosition };
    setTerrainStatus("slim");

    for (const entity of state.entities) {
      if (entity.type === "wild" && !entity.collected) {
        respawnWildEntity(entity, false);
      }

      if (entity.type === "roaming") {
        entity.target = chooseRoamingTarget(entity);
      }
    }
  } catch (error) {
    state.terrain.ready = false;
    setTerrainStatus("basis");
  } finally {
    state.terrain.isLoading = false;
  }
}

function hydrateTerrain(data) {
  const allowedPolygons = [];
  const forbiddenPolygons = [];
  const allowedLines = [];
  const forbiddenLines = [];

  for (const element of data.elements || []) {
    if (!Array.isArray(element.geometry) || element.geometry.length < 2) {
      continue;
    }

    const coords = element.geometry.map((point) => ({ lat: point.lat, lng: point.lon }));
    const tags = element.tags || {};
    const isClosed = isClosedPolygon(coords);

    if (tags.building && isClosed) {
      forbiddenPolygons.push(coords);
      continue;
    }

    if ((tags.natural === "water" || /reservoir|basin/.test(tags.landuse || "")) && isClosed) {
      forbiddenPolygons.push(coords);
      continue;
    }

    if (tags.waterway) {
      forbiddenLines.push(coords);
      continue;
    }

    if (tags.highway) {
      allowedLines.push(coords);
      continue;
    }

    if (
      ((tags.landuse && /grass|farmland|meadow/.test(tags.landuse)) ||
        tags.leisure === "park" ||
        tags.natural === "grassland") &&
      isClosed
    ) {
      allowedPolygons.push(coords);
    }
  }

  state.terrain.ready = true;
  state.terrain.allowedPolygons = allowedPolygons;
  state.terrain.forbiddenPolygons = forbiddenPolygons;
  state.terrain.allowedLines = allowedLines;
  state.terrain.forbiddenLines = forbiddenLines;
}

function canOccupyTerrain(point, allowLooseTerrain) {
  if (!pointInPolygon(point, CONFIG.WIERINGEN_POLYGON)) {
    return false;
  }

  if (!state.terrain.ready) {
    return allowLooseTerrain;
  }

  if (state.terrain.forbiddenPolygons.some((polygon) => pointInPolygon(point, polygon))) {
    return false;
  }

  if (state.terrain.forbiddenLines.some((line) => isNearLine(point, line, 10))) {
    return false;
  }

  if (state.terrain.allowedPolygons.some((polygon) => pointInPolygon(point, polygon))) {
    return true;
  }

  if (state.terrain.allowedLines.some((line) => isNearLine(point, line, 16))) {
    return true;
  }

  return allowLooseTerrain;
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
  ui.terrainStatus.textContent = label;
}

function loadDiscoveredIds() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.PLAYER_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function loadCollapsedPanelState() {
  const defaults = {
    hud: false,
    "mini-radar": window.matchMedia("(max-width: 767px)").matches,
    scan: window.matchMedia("(max-width: 767px)").matches
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
  localStorage.setItem(CONFIG.PLAYER_STORAGE_KEY, JSON.stringify(Array.from(state.discovered)));
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

function isEntityAvailableNow(entity, now = new Date()) {
  const hour = now.getHours();

  if (entity.availabilityMode === "all-day") {
    return true;
  }

  if (entity.availabilityMode === "morning") {
    return hour >= 6 && hour < 14;
  }

  if (entity.availabilityMode === "afternoon") {
    return hour >= 11 && hour < 19;
  }

  if (entity.availabilityMode === "evening") {
    return hour >= 17 && hour < 23;
  }

  if (entity.availabilityMode === "night") {
    return hour >= 21 || hour < 7;
  }

  const activeHours = getRandomActiveHours(entity, now);
  return activeHours.has(hour);
}

function getRandomActiveHours(entity, now) {
  const seed = createSeed(`${entity.id}-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
  const generator = createSeededRandom(seed);
  const selectedHours = new Set();
  const preferredHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const allHours = Array.from({ length: 24 }, (_, hour) => hour);

  while (selectedHours.size < entity.randomHoursPerDay) {
    const pool = generator() < 0.78 ? preferredHours : allHours;
    selectedHours.add(pool[Math.floor(generator() * pool.length)]);
  }

  return selectedHours;
}

function createSeed(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let current = seed || 1;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 4294967296;
  };
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
    return "Legendary";
  }

  if (rarity === "rare") {
    return "Rare";
  }

  return "Common";
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
