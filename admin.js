const ADMIN_PASSWORD = "sammeltjesdev";
const ADMIN_SESSION_KEY = "sammeltjes-admin-auth";
const DATA_VERSION_KEY = "sammeltjes-data-version";
const SHARED_CONFIG = window.SAMMELTJES_SHARED_CONFIG;

if (!SHARED_CONFIG) {
  throw new Error("shared-config.js ontbreekt of is niet geladen.");
}

const DEFAULT_CENTER = { lat: 52.9005, lng: 4.9485 };
const DEFAULT_ZOOM = 14;
const DEFAULT_RADAR_RADIUS = 60;
const boundsCenterLat = (SHARED_CONFIG.WIERINGEN_BOUNDS.south + SHARED_CONFIG.WIERINGEN_BOUNDS.north) / 2;
const boundsMarginLat = SHARED_CONFIG.ADMIN_MARGIN_METERS / 111320;
const boundsMarginLng =
  SHARED_CONFIG.ADMIN_MARGIN_METERS / (111320 * Math.cos((boundsCenterLat * Math.PI) / 180));
const WIERINGEN_VIEW_BOUNDS = L.latLngBounds(
  [
    SHARED_CONFIG.WIERINGEN_BOUNDS.south - boundsMarginLat,
    SHARED_CONFIG.WIERINGEN_BOUNDS.west - boundsMarginLng
  ],
  [
    SHARED_CONFIG.WIERINGEN_BOUNDS.north + boundsMarginLat,
    SHARED_CONFIG.WIERINGEN_BOUNDS.east + boundsMarginLng
  ]
);

const state = {
  map: null,
  items: [],
  selectedId: null,
  pendingRelocateId: null,
  markers: new Map(),
  circles: new Map(),
  playerMarker: null,
  playerRadius: null,
  simulatePlayerPlacement: false,
  draggingMarker: false,
  relocateMode: false
};

const ui = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheDom();
  if (!isLocalDevHost()) {
    ui.adminAccessNote.textContent =
      "Deze beheerpagina is bewust uitgeschakeld op de openbare website. Start dev-server.py op je computer om wijzigingen veilig op te slaan.";
    ui.passwordInput.disabled = true;
    ui.loginSubmit.disabled = true;
    ui.loginSubmit.textContent = "Alleen lokaal beschikbaar";
    return;
  }
  bindLogin();

  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "ok") {
    unlockAdmin();
  }
}

function cacheDom() {
  ui.loginScreen = document.getElementById("login-screen");
  ui.adminApp = document.getElementById("admin-app");
  ui.loginForm = document.getElementById("login-form");
  ui.passwordInput = document.getElementById("password-input");
  ui.loginError = document.getElementById("login-error");
  ui.adminAccessNote = document.getElementById("admin-access-note");
  ui.loginSubmit = document.getElementById("login-submit");
  ui.itemCount = document.getElementById("item-count");
  ui.loadStatus = document.getElementById("load-status");
  ui.protocolWarning = document.getElementById("protocol-warning");
  ui.mapModeLabel = document.getElementById("map-mode-label");
  ui.simulatePlayerButton = document.getElementById("simulate-player-btn");
  ui.importButton = document.getElementById("import-btn");
  ui.importInput = document.getElementById("import-input");
  ui.saveButton = document.getElementById("save-btn");
  ui.logoutButton = document.getElementById("logout-btn");
  ui.deleteButton = document.getElementById("delete-btn");
  ui.clearPlayerButton = document.getElementById("clear-player-btn");
  ui.playerStatus = document.getElementById("player-status");
  ui.sortNearestButton = document.getElementById("sort-nearest-btn");
  ui.editorForm = document.getElementById("editor-form");
  ui.itemList = document.getElementById("item-list");
  ui.itemSelector = document.getElementById("item-selector");
  ui.itemSearch = document.getElementById("item-search");
  ui.collapseButtons = Array.from(document.querySelectorAll("[data-admin-collapse]"));
  ui.imagePreview = document.getElementById("image-preview");
  ui.fields = {
    id: document.getElementById("field-id"),
    name: document.getElementById("field-name"),
    type: document.getElementById("field-type"),
    biome: document.getElementById("field-biome"),
    lat: document.getElementById("field-lat"),
    lng: document.getElementById("field-lng"),
    radius: document.getElementById("field-radius"),
    rarity: document.getElementById("field-rarity"),
    description: document.getElementById("field-description"),
    image: document.getElementById("field-image"),
    thumbnail: document.getElementById("field-thumbnail"),
    behavior: document.getElementById("field-behavior"),
    speedKmh: document.getElementById("field-speed-kmh"),
    availabilityMode: document.getElementById("field-availability-mode"),
    randomHoursPerDay: document.getElementById("field-random-hours"),
    active: document.getElementById("field-active"),
    relocate: document.getElementById("field-relocate")
  };
}

function bindLogin() {
  ui.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (ui.passwordInput.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "ok");
      unlockAdmin();
      return;
    }

    ui.loginError.classList.remove("hidden");
  });
}

async function unlockAdmin() {
  ui.loginScreen.classList.add("hidden");
  ui.adminApp.classList.remove("hidden");

  if (window.location.protocol === "file:") {
    ui.protocolWarning.classList.remove("hidden");
  }

  if (!state.map) {
    initMap();
    bindAdminUi();
    await loadDataFromFile();
    if (isE2eMode()) {
      installAdminTestApi();
    }
  }
}

function bindAdminUi() {
  ui.simulatePlayerButton.addEventListener("click", togglePlayerPlacementMode);
  ui.importButton.addEventListener("click", () => ui.importInput.click());
  ui.importInput.addEventListener("change", importJsonFile);
  ui.saveButton.addEventListener("click", downloadJson);
  ui.logoutButton.addEventListener("click", logoutAdmin);
  ui.deleteButton.addEventListener("click", deleteSelectedItem);
  ui.clearPlayerButton.addEventListener("click", clearPlayerMarker);
  ui.sortNearestButton.addEventListener("click", sortListByMapCenter);
  ui.itemSelector.addEventListener("change", () => selectItem(ui.itemSelector.value, { focus: true }));
  ui.itemSearch.addEventListener("input", renderItemList);
  ui.collapseButtons.forEach((button) => button.addEventListener("click", () => toggleAdminSection(button)));
  ui.editorForm.addEventListener("input", handleFormInput);
  ui.editorForm.addEventListener("change", handleFormInput);
  ui.fields.relocate.addEventListener("change", handleRelocateToggle);
}

function initMap() {
  state.map = L.map("admin-map", {
    maxBounds: WIERINGEN_VIEW_BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomSnap: 0.25,
    zoomControl: true
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-bijdragers"
  }).addTo(state.map);

  state.map.fitBounds(WIERINGEN_VIEW_BOUNDS, {
    padding: [24, 24]
  });
  state.map.setMinZoom(state.map.getBoundsZoom(WIERINGEN_VIEW_BOUNDS) - 0.25);
  state.map.setMaxZoom(18);

  L.polygon(SHARED_CONFIG.WIERINGEN_POLYGON, {
    color: "#0891b2",
    weight: 2,
    opacity: 0.8,
    fillColor: "#67e8f9",
    fillOpacity: 0.025,
    interactive: false
  }).addTo(state.map);

  state.map.on("click", (event) => {
    if (state.draggingMarker) {
      return;
    }

    if (state.relocateMode && state.pendingRelocateId) {
      relocateSelectedItem(event.latlng);
      return;
    }

    if (state.simulatePlayerPlacement) {
      placePlayerMarker(event.latlng);
      return;
    }

    createNewItemAt(event.latlng);
  });
}

async function loadDataFromFile() {
  try {
    const response = await fetch("data/sammeltjes.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setItems(data);
    setLoadStatus("Live JSON geladen", "success");
  } catch (error) {
    setItems([]);
    setLoadStatus("Kon data/sammeltjes.json niet laden. Start de lokale dev-server opnieuw.", "error");
  }
}

function setItems(items) {
  state.items = items.map((item, index) => normalizeItem(item, index));

  clearAllMarkerLayers();
  state.items.forEach((item) => mountItemLayers(item));

  updateItemCount();
  renderItemSelector();
  renderItemList();

  if (state.items.length > 0) {
    selectItem(state.items[0].id, { focus: false });
  }
}

function normalizeItem(item, index) {
  return {
    id: String(item.id || `nieuw-sammeltje-${index + 1}`),
    name: String(item.name || `Nieuw Sammeltje ${index + 1}`),
    type: oneOf(item.type, ["fixed", "roaming", "wild"], "fixed"),
    biome: String(item.biome || ""),
    lat: Number(item.lat ?? DEFAULT_CENTER.lat),
    lng: Number(item.lng ?? DEFAULT_CENTER.lng),
    radius: normalizeRadius(item.radius),
    rarity: oneOf(item.rarity, ["common", "rare", "legendary"], "common"),
    description: String(item.description || ""),
    image: String(item.image || ""),
    thumbnail: String(item.thumbnail || item.image || ""),
    behavior: oneOf(item.behavior, ["curious", "scared", "shy"], defaultBehaviorForType(item.type)),
    speedKmh: normalizeSpeedKmh(item.speedKmh, item.rarity),
    availabilityMode: oneOf(
      item.availabilityMode,
      ["all-day", "morning", "afternoon", "evening", "night", "random-hours"],
      "all-day"
    ),
    randomHoursPerDay: normalizeRandomHours(item.randomHoursPerDay),
    active: item.active === undefined ? true : Boolean(item.active)
  };
}

function mountItemLayers(item) {
  const marker = L.marker([item.lat, item.lng], {
    draggable: true,
    autoPan: false,
    riseOnHover: true,
    icon: createMarkerIcon(item, item.id === state.selectedId)
  }).addTo(state.map);

  const circle = L.circle([item.lat, item.lng], {
    radius: item.radius,
    color: getRarityColor(item.rarity),
    weight: 2,
    opacity: item.active ? 0.8 : 0.38,
    fillColor: getRarityColor(item.rarity),
    fillOpacity: item.active ? 0.08 : 0.03,
    interactive: false
  }).addTo(state.map);

  marker.on("click", () => selectItem(item.id, { focus: false }));
  marker.on("dragstart", () => {
    state.draggingMarker = true;
    state.map.dragging.disable();
    state.map.doubleClickZoom.disable();
  });
  marker.on("drag", (event) => {
    const nextLatLng = event.target.getLatLng();
    updateItemPosition(item.id, nextLatLng);
  });
  marker.on("dragend", () => {
    state.draggingMarker = false;
    state.map.dragging.enable();
    state.map.doubleClickZoom.enable();
    updateLayerStyles(item);
    selectItem(item.id, { focus: false });
  });

  state.markers.set(item.id, marker);
  state.circles.set(item.id, circle);
  decorateAdminMarkerForTests(item);
}

function createMarkerIcon(item, selected) {
  const selectedClass = selected ? " sammeltje-marker--selected" : "";
  const inactiveClass = item.active ? "" : " sammeltje-marker--inactive";

  return L.divIcon({
    className: "",
    html: `<div class="sammeltje-marker sammeltje-marker--${item.rarity}${selectedClass}${inactiveClass}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function updateLayerStyles(item) {
  const marker = state.markers.get(item.id);
  const circle = state.circles.get(item.id);
  if (!marker || !circle) {
    return;
  }

  marker.setIcon(createMarkerIcon(item, item.id === state.selectedId));
  marker.setLatLng([item.lat, item.lng]);
  circle.setLatLng([item.lat, item.lng]);
  circle.setRadius(item.radius);
  circle.setStyle({
    color: getRarityColor(item.rarity),
    fillColor: getRarityColor(item.rarity),
    opacity: item.active ? 0.8 : 0.38,
    fillOpacity: item.active ? 0.08 : 0.03
  });
  decorateAdminMarkerForTests(item);
}

function selectItem(id, options = {}) {
  state.selectedId = id;
  if (state.relocateMode) {
    state.pendingRelocateId = id;
  }
  const item = getSelectedItem();
  if (!item) {
    return;
  }

  state.items.forEach((entry) => updateLayerStyles(entry));
  fillEditor(item);
  ui.itemSelector.value = item.id;
  renderItemList();
  updateMapModeLabel();

  if (options.focus) {
    state.map.setView([item.lat, item.lng], Math.max(state.map.getZoom(), 15), { animate: true });
  }
}

function fillEditor(item) {
  ui.fields.id.value = item.id;
  ui.fields.name.value = item.name;
  ui.fields.type.value = item.type;
  ui.fields.biome.value = item.biome;
  ui.fields.lat.value = item.lat.toFixed(6);
  ui.fields.lng.value = item.lng.toFixed(6);
  ui.fields.radius.value = String(item.radius);
  ui.fields.rarity.value = item.rarity;
  ui.fields.description.value = item.description;
  ui.fields.image.value = item.image;
  ui.fields.thumbnail.value = item.thumbnail;
  ui.fields.behavior.value = item.behavior;
  ui.fields.speedKmh.value = item.speedKmh.toFixed(1);
  ui.fields.availabilityMode.value = item.availabilityMode;
  ui.fields.randomHoursPerDay.value = String(item.randomHoursPerDay);
  ui.fields.active.checked = item.active;
  ui.fields.relocate.checked = state.relocateMode;
  ui.imagePreview.src = item.thumbnail || item.image || "";
  ui.imagePreview.alt = item.name || "Preview";
  updateAvailabilityFieldState();
  syncRelocateUi();
}

function handleFormInput(event) {
  if (event?.target === ui.fields.relocate) {
    return;
  }

  const item = getSelectedItem();
  if (!item) {
    return;
  }

  const previousId = item.id;
  const nextId = slugify(ui.fields.id.value || item.id || item.name);

  if (previousId !== nextId) {
    if (state.items.some((entry) => entry !== item && entry.id === nextId)) {
      ui.fields.id.value = previousId;
      setLoadStatus(`ID '${nextId}' bestaat al. Kies een uniek ID.`, "error");
      return;
    }
    remapItemLayerKeys(previousId, nextId);
    state.selectedId = nextId;
    if (state.pendingRelocateId === previousId) {
      state.pendingRelocateId = nextId;
    }
  }

  item.id = nextId;
  item.name = ui.fields.name.value.trim();
  item.type = ui.fields.type.value;
  item.biome = ui.fields.biome.value.trim();
  item.lat = Number(ui.fields.lat.value || item.lat);
  item.lng = Number(ui.fields.lng.value || item.lng);
  item.radius = normalizeRadius(ui.fields.radius.value || item.radius);
  item.rarity = ui.fields.rarity.value;
  item.description = ui.fields.description.value.trim();
  item.image = ui.fields.image.value.trim();
  item.thumbnail = ui.fields.thumbnail.value.trim() || item.image;
  item.behavior = ui.fields.behavior.value;
  item.speedKmh = normalizeSpeedKmh(ui.fields.speedKmh.value, item.rarity);
  item.availabilityMode = ui.fields.availabilityMode.value;
  item.randomHoursPerDay = normalizeRandomHours(ui.fields.randomHoursPerDay.value);
  item.active = ui.fields.active.checked;

  updateLayerStyles(item);
  ui.imagePreview.src = item.thumbnail || item.image || "";
  ui.imagePreview.alt = item.name || "Preview";
  renderItemSelector();
  renderItemList();
  updateAvailabilityFieldState();
  updateMapModeLabel();
}

function updateItemPosition(id, latlng) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  if (!pointInPolygon(latlng, SHARED_CONFIG.WIERINGEN_POLYGON)) {
    setLoadStatus("Kies een plek binnen de blauwe grens van Wieringen.", "error");
    updateLayerStyles(item);
    return;
  }

  item.lat = roundCoord(latlng.lat);
  item.lng = roundCoord(latlng.lng);
  updateLayerStyles(item);

  if (state.selectedId === id) {
    ui.fields.lat.value = item.lat.toFixed(6);
    ui.fields.lng.value = item.lng.toFixed(6);
  }

  renderItemList();
}

function createNewItemAt(latlng) {
  if (!pointInPolygon(latlng, SHARED_CONFIG.WIERINGEN_POLYGON)) {
    setLoadStatus("Nieuwe Sammeltjes kunnen alleen binnen Wieringen worden geplaatst.", "error");
    return;
  }
  let nextIndex = state.items.length + 1;
  while (state.items.some((item) => item.id === `nieuw-sammeltje-${nextIndex}`)) {
    nextIndex += 1;
  }
  const nextItem = normalizeItem(
    {
      id: `nieuw-sammeltje-${nextIndex}`,
      name: `Nieuw Sammeltje ${nextIndex}`,
      type: "fixed",
      biome: "",
      lat: roundCoord(latlng.lat),
      lng: roundCoord(latlng.lng),
      radius: 80,
      rarity: "common",
      description: "",
      image: "",
      behavior: "shy",
      speedKmh: 2.2,
      availabilityMode: "all-day",
      randomHoursPerDay: 6,
      active: true
    },
    nextIndex
  );

  state.items.push(nextItem);
  mountItemLayers(nextItem);
  updateItemCount();
  renderItemSelector();
  renderItemList();
  state.relocateMode = false;
  state.pendingRelocateId = null;
  selectItem(nextItem.id, { focus: false });
}

function deleteSelectedItem() {
  if (!state.selectedId || state.items.length === 0) {
    return;
  }

  const index = state.items.findIndex((item) => item.id === state.selectedId);
  if (index === -1) {
    return;
  }

  state.markers.get(state.selectedId)?.remove();
  state.circles.get(state.selectedId)?.remove();
  state.markers.delete(state.selectedId);
  state.circles.delete(state.selectedId);
  state.items.splice(index, 1);

  updateItemCount();
  renderItemSelector();
  renderItemList();

  if (state.items.length > 0) {
    selectItem(state.items[Math.max(0, index - 1)].id, { focus: false });
  } else {
    state.selectedId = null;
    state.relocateMode = false;
    state.pendingRelocateId = null;
    ui.editorForm.reset();
    ui.fields.relocate.checked = false;
    ui.imagePreview.removeAttribute("src");
    updateMapModeLabel();
  }
}

function renderItemList() {
  const query = (ui.itemSearch?.value || "").trim().toLowerCase();
  const items = state.items.filter((item) =>
    `${item.name} ${item.id} ${item.type} ${item.biome}`.toLowerCase().includes(query)
  );
  ui.itemList.innerHTML = items
    .map((item) => {
      const selectedClass = item.id === state.selectedId ? " is-selected" : "";
      return `
        <button class="item-row${selectedClass}" type="button" data-item-id="${escapeHtml(item.id)}" data-testid="admin-item-row-${escapeHtml(item.id)}">
          <span class="item-row__dot" style="background:${getRarityColor(item.rarity)}"></span>
          <span>
            <strong class="block text-left text-slate-900">${escapeHtml(item.name)}</strong>
            <span class="item-row__meta">${escapeHtml(item.type)} • ${Math.round(item.radius)}m • ${item.active ? "active" : "inactive"}</span>
          </span>
          <span class="item-row__meta">${item.lat.toFixed(3)}, ${item.lng.toFixed(3)}</span>
        </button>
      `;
    })
    .join("");

  ui.itemList.querySelectorAll("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.itemId, { focus: true }));
  });
}

function renderItemSelector() {
  const previousValue = state.selectedId;
  ui.itemSelector.innerHTML = state.items
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (${escapeHtml(item.type)})</option>`)
    .join("");
  if (previousValue && state.items.some((item) => item.id === previousValue)) {
    ui.itemSelector.value = previousValue;
  }
}

function toggleAdminSection(button) {
  const body = document.getElementById(button.dataset.adminCollapse);
  if (!body) {
    return;
  }
  const collapsed = !body.hidden;
  body.hidden = collapsed;
  body.closest(".admin-collapsible")?.classList.toggle("is-collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.textContent = collapsed ? "Openen" : "Inklappen";
  if (!collapsed) {
    window.setTimeout(() => state.map.invalidateSize(), 0);
  }
}

function updateItemCount() {
  ui.itemCount.textContent = `${state.items.length} Sammeltjes`;
}

function setLoadStatus(message, tone) {
  ui.loadStatus.textContent = message;
  ui.loadStatus.className = "rounded-full px-4 py-2 text-sm font-medium";

  if (tone === "success") {
    ui.loadStatus.classList.add("border", "border-emerald-200", "bg-emerald-50", "text-emerald-800");
    return;
  }

  if (tone === "error") {
    ui.loadStatus.classList.add("border", "border-rose-200", "bg-rose-50", "text-rose-800");
    return;
  }

  ui.loadStatus.classList.add("border", "border-amber-200", "bg-amber-50", "text-amber-800");
}

function togglePlayerPlacementMode() {
  state.simulatePlayerPlacement = !state.simulatePlayerPlacement;
  if (state.simulatePlayerPlacement) {
    state.relocateMode = false;
    state.pendingRelocateId = null;
  }

  ui.simulatePlayerButton.classList.toggle("admin-btn--primary", state.simulatePlayerPlacement);
  ui.simulatePlayerButton.classList.toggle("admin-btn--ghost", !state.simulatePlayerPlacement);
  syncRelocateUi();
}

function placePlayerMarker(latlng) {
  const icon = L.divIcon({
    className: "",
    html: '<div class="player-test-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  if (!state.playerMarker) {
    state.playerMarker = L.marker([latlng.lat, latlng.lng], { icon }).addTo(state.map);
  } else {
    state.playerMarker.setLatLng([latlng.lat, latlng.lng]);
  }

  if (!state.playerRadius) {
    state.playerRadius = L.circle([latlng.lat, latlng.lng], {
      radius: DEFAULT_RADAR_RADIUS,
      color: "#ec4899",
      fillColor: "#ec4899",
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.08
    }).addTo(state.map);
  } else {
    state.playerRadius.setLatLng([latlng.lat, latlng.lng]);
  }

  ui.playerStatus.textContent = `Speler op ${roundCoord(latlng.lat).toFixed(5)}, ${roundCoord(latlng.lng).toFixed(5)}`;
}

function clearPlayerMarker() {
  state.playerMarker?.remove();
  state.playerRadius?.remove();
  state.playerMarker = null;
  state.playerRadius = null;
  ui.playerStatus.textContent = "Geen gesimuleerde speler";
}

function relocateSelectedItem(latlng) {
  const item = state.items.find((entry) => entry.id === state.pendingRelocateId) || getSelectedItem();
  if (!item) {
    return;
  }

  if (!pointInPolygon(latlng, SHARED_CONFIG.WIERINGEN_POLYGON)) {
    setLoadStatus("Verplaatsen kan alleen binnen de blauwe grens van Wieringen.", "error");
    return;
  }

  item.lat = roundCoord(latlng.lat);
  item.lng = roundCoord(latlng.lng);
  state.relocateMode = false;
  state.pendingRelocateId = null;
  updateLayerStyles(item);
  selectItem(item.id, { focus: false });
}

async function importJsonFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const rawText = await file.text();
  const importedItems = JSON.parse(rawText);
  setItems(importedItems);
  ui.importInput.value = "";
}

async function downloadJson() {
  const exportItems = buildExportItems();
  const validationErrors = validateItems(exportItems);
  if (validationErrors.length > 0) {
    setLoadStatus(`Niet opgeslagen: ${validationErrors[0]}`, "error");
    return false;
  }

  try {
    const response = await fetch("/api/save-sammeltjes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(exportItems)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    localStorage.setItem(DATA_VERSION_KEY, String(Date.now()));
    setLoadStatus(`Live JSON opgeslagen${payload.path ? `: ${payload.path}` : ""}`, "success");
    return true;
  } catch (error) {
    triggerJsonDownload(exportItems);
    setLoadStatus("Direct opslaan niet beschikbaar. JSON is als download opgeslagen.", "warning");
    return false;
  }
}

function validateItems(items) {
  const errors = [];
  const ids = new Set();
  for (const item of items) {
    if (!item.id || !item.name) {
      errors.push("ieder Sammeltje heeft een ID en naam nodig.");
      continue;
    }
    if (ids.has(item.id)) {
      errors.push(`ID '${item.id}' komt meer dan een keer voor.`);
    }
    ids.add(item.id);
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) {
      errors.push(`${item.name} heeft geen geldige locatie.`);
    } else if (!pointInPolygon(item, SHARED_CONFIG.WIERINGEN_POLYGON)) {
      errors.push(`${item.name} staat buiten Wieringen.`);
    }
    if (item.radius < 50 || item.radius > 500) {
      errors.push(`${item.name} heeft een radius buiten 50-500 meter.`);
    }
    if (!item.image || !item.thumbnail) {
      errors.push(`${item.name} mist een afbeeldingspad.`);
    }
  }
  return errors;
}

function buildExportItems() {
  return state.items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    biome: item.biome,
    lat: roundCoord(item.lat),
    lng: roundCoord(item.lng),
    radius: normalizeRadius(item.radius),
    rarity: item.rarity,
    description: item.description,
    image: item.image,
    thumbnail: item.thumbnail,
    behavior: item.behavior,
    speedKmh: normalizeSpeedKmh(item.speedKmh, item.rarity),
    availabilityMode: item.availabilityMode,
    randomHoursPerDay: normalizeRandomHours(item.randomHoursPerDay),
    active: item.active
  }));
}

function triggerJsonDownload(exportItems) {
  const blob = new Blob([`${JSON.stringify(exportItems, null, 2)}\n`], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sammeltjes.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sortListByMapCenter() {
  const center = state.map.getCenter();
  state.items.sort((left, right) => distanceMeters(center, left) - distanceMeters(center, right));
  renderItemSelector();
  renderItemList();
}

function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.reload();
}

function isLocalDevHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isE2eMode() {
  return new URLSearchParams(window.location.search).get("e2e") === "1";
}

function updateAvailabilityFieldState() {
  const useRandomHours = ui.fields.availabilityMode.value === "random-hours";
  ui.fields.randomHoursPerDay.disabled = !useRandomHours;
}

function handleRelocateToggle() {
  if (!state.selectedId) {
    state.relocateMode = false;
    state.pendingRelocateId = null;
    ui.fields.relocate.checked = false;
    syncRelocateUi();
    return;
  }

  state.relocateMode = ui.fields.relocate.checked;
  state.pendingRelocateId = state.relocateMode ? state.selectedId : null;

  if (state.relocateMode) {
    state.simulatePlayerPlacement = false;
    ui.simulatePlayerButton.classList.remove("admin-btn--primary");
    ui.simulatePlayerButton.classList.add("admin-btn--ghost");
  }

  syncRelocateUi();
}

function syncRelocateUi() {
  ui.fields.relocate.checked = state.relocateMode;
  state.map.getContainer().classList.toggle("admin-map--relocate", state.relocateMode);
  updateMapModeLabel();
}

function updateMapModeLabel() {
  if (state.simulatePlayerPlacement) {
    ui.mapModeLabel.textContent = "Kaartklik plaatst nu een speler marker met radar radius.";
    return;
  }

  if (state.relocateMode && state.pendingRelocateId) {
    const item = state.items.find((entry) => entry.id === state.pendingRelocateId);
    ui.mapModeLabel.textContent = item
      ? `Verplaatsmodus actief voor ${item.name}: klik op de kaart om dit Sammeltje daar neer te zetten.`
      : "Verplaatsmodus actief: klik op de kaart om het geselecteerde Sammeltje daar neer te zetten.";
    return;
  }

  ui.mapModeLabel.textContent = "Kaartklik maakt een nieuw Sammeltje. Gebruik 'Verplaats naar' in het bewerkpaneel om een bestaand Sammeltje te verzetten.";
}

function clearAllMarkerLayers() {
  state.markers.forEach((marker) => marker.remove());
  state.circles.forEach((circle) => circle.remove());
  state.markers.clear();
  state.circles.clear();
}

function decorateAdminMarkerForTests(item) {
  const markerElement = state.markers.get(item.id)?._icon;
  if (!markerElement) {
    return;
  }

  markerElement.setAttribute("data-testid", `admin-marker-${item.id}`);
  markerElement.setAttribute("data-item-id", item.id);
}

function remapItemLayerKeys(previousId, nextId) {
  const marker = state.markers.get(previousId);
  const circle = state.circles.get(previousId);

  if (marker) {
    state.markers.delete(previousId);
    state.markers.set(nextId, marker);
  }

  if (circle) {
    state.circles.delete(previousId);
    state.circles.set(nextId, circle);
  }
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

function getRarityColor(rarity) {
  if (rarity === "legendary") {
    return "#c9972f";
  }

  if (rarity === "rare") {
    return "#3074c7";
  }

  return "#3f8f56";
}

function oneOf(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
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

function normalizeRandomHours(value) {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return 6;
  }

  return Math.min(24, Math.max(1, numericValue));
}

function normalizeRadius(value) {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return 80;
  }

  return Math.min(500, Math.max(50, numericValue));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "nieuw-sammeltje";
}

function roundCoord(value) {
  return Number(Number(value).toFixed(6));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function installAdminTestApi() {
  window.__SAMMELTJES_ADMIN_TEST_API__ = {
    login() {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "ok");
      return true;
    },
    async reloadData() {
      await loadDataFromFile();
      return this.getStateSnapshot();
    },
    selectItem(id) {
      selectItem(id, { focus: false });
      return this.getSelectedItem();
    },
    updateSelectedItem(patch) {
      const item = getSelectedItem();
      if (!item) {
        return null;
      }

      const next = { ...item, ...patch };
      if (patch.id !== undefined) {
        ui.fields.id.value = String(patch.id);
      }
      if (patch.name !== undefined) {
        ui.fields.name.value = String(patch.name);
      }
      if (patch.type !== undefined) {
        ui.fields.type.value = String(patch.type);
      }
      if (patch.biome !== undefined) {
        ui.fields.biome.value = String(patch.biome);
      }
      if (patch.lat !== undefined) {
        ui.fields.lat.value = String(patch.lat);
      }
      if (patch.lng !== undefined) {
        ui.fields.lng.value = String(patch.lng);
      }
      if (patch.radius !== undefined) {
        ui.fields.radius.value = String(patch.radius);
      }
      if (patch.rarity !== undefined) {
        ui.fields.rarity.value = String(patch.rarity);
      }
      if (patch.description !== undefined) {
        ui.fields.description.value = String(patch.description);
      }
      if (patch.image !== undefined) {
        ui.fields.image.value = String(patch.image);
      }
      if (patch.thumbnail !== undefined) {
        ui.fields.thumbnail.value = String(patch.thumbnail);
      }
      if (patch.behavior !== undefined) {
        ui.fields.behavior.value = String(patch.behavior);
      }
      if (patch.speedKmh !== undefined) {
        ui.fields.speedKmh.value = String(patch.speedKmh);
      }
      if (patch.availabilityMode !== undefined) {
        ui.fields.availabilityMode.value = String(patch.availabilityMode);
      }
      if (patch.randomHoursPerDay !== undefined) {
        ui.fields.randomHoursPerDay.value = String(patch.randomHoursPerDay);
      }
      if (patch.active !== undefined) {
        ui.fields.active.checked = Boolean(patch.active);
      }

      handleFormInput();
      return this.getSelectedItem();
    },
    async save() {
      await downloadJson();
      return {
        loadStatus: ui.loadStatus.textContent.trim()
      };
    },
    getSelectedItem() {
      const item = getSelectedItem();
      return item ? JSON.parse(JSON.stringify(item)) : null;
    },
    getStateSnapshot() {
      return {
        selectedId: state.selectedId,
        itemCount: state.items.length,
        loadStatus: ui.loadStatus.textContent.trim(),
        mapModeLabel: ui.mapModeLabel.textContent.trim()
      };
    },
    getMapContainerPoint(lat, lng) {
      const point = state.map.latLngToContainerPoint([lat, lng]);
      return { x: point.x, y: point.y };
    }
  };
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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.lng > point.lng !== previousPoint.lng > point.lng &&
      point.lat <
        ((previousPoint.lat - currentPoint.lat) * (point.lng - currentPoint.lng)) /
          (previousPoint.lng - currentPoint.lng) +
          currentPoint.lat;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
