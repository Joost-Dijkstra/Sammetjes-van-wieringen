const Rules = window.SammeltjesRules;
const SHARED_CONFIG = window.SAMMELTJES_SHARED_CONFIG;
const ADMIN_SESSION_KEY = "sammeltjes-admin-auth";
const DATA_VERSION_KEY = "sammeltjes-data-version";
const $ = (id) => document.getElementById(id);
const fields = {};
const fieldIds = { id: "field-id", name: "field-name", type: "field-type", biome: "field-biome",
  lat: "field-lat", lng: "field-lng", radius: "field-radius", rarity: "field-rarity",
  description: "field-description", image: "field-image", thumbnail: "field-thumbnail",
  behavior: "field-behavior", speedKmh: "field-speed-kmh", availabilityMode: "field-availability-mode",
  activeFrom: "field-active-from", activeUntil: "field-active-until", randomHoursPerDay: "field-random-hours", active: "field-active" };
const numeric = new Set(["lat", "lng", "radius", "speedKmh", "randomHoursPerDay"]);
const state = { items: [], selectedId: null, saved: "", revision: null, undo: [], mode: "select",
  map: null, layers: new Map(), preview: null, player: null, playerMarker: null, radar: null,
  previewMarker: null, timer: null, running: false, lockedIds: new Set(), saving: false, assets: [] };
const terrain = window.SammeltjesTerrain.create(SHARED_CONFIG.WIERINGEN_POLYGON);
const snapshot = () => JSON.stringify(state.items);
const selected = () => state.items.find((item) => item.id === state.selectedId);
const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const color = (rarity) => ({ common: "#528361", rare: "#417caa", legendary: "#bb9137" }[rarity] || "#528361");
function status(message, error = false) { $("load-status").textContent = message; $("load-status").classList.toggle("is-error", error); }
function remember() {
  const value = snapshot();
  if (state.undo.at(-1)?.value !== value) state.undo.push({ value, id: state.selectedId });
  if (state.undo.length > 50) state.undo.shift();
  $("undo-btn").disabled = !state.undo.length;
}
function changed() {
  status(snapshot() === state.saved ? "Opgeslagen op computer" : "Niet-opgeslagen wijzigingen");
  $("undo-btn").disabled = !state.undo.length;
}
async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Verzoek mislukt (${response.status})`);
  return body;
}
document.addEventListener("DOMContentLoaded", () => {
  for (const [key, id] of Object.entries(fieldIds)) fields[key] = $(id);
  if (!["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
    $("admin-access-note").textContent = "Deze werkplaats is alleen op je computer beschikbaar. Open start-admin.bat in de spelmap.";
    $("login-submit").disabled = true; $("password-input").disabled = true; return;
  }
  $("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("password-input").value !== "sammeltjesdev") { $("login-error").hidden = false; return; }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "ok"); void unlock();
  });
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "ok") void unlock();
});
async function unlock() {
  $("login-screen").hidden = true; $("admin-app").hidden = false;
  if (state.map) return;
  initMap(); bindUi();
  try {
    const result = await api("/api/state");
    state.revision = result.revision;
    installItems(result.items);
    state.saved = snapshot();
    state.lockedIds = new Set(state.items.map((item) => item.id));
    state.assets = result.assets || state.items.map((item) => ({ name: item.name, image: item.image, thumbnail: item.thumbnail }));
    $("image-picker").innerHTML = '<option value="">Huidige afbeelding behouden</option>' + state.assets.map((asset, i) => `<option value="${i}">${escapeHtml(asset.name)}</option>`).join("");
    status("Opgeslagen gegevens van je computer geladen");
    if (new URLSearchParams(location.search).get("e2e") === "1") installTestApi();
  } catch (error) { status(`Laden mislukt: ${error.message}. Start de lokale server opnieuw.`, true); $("save-btn").disabled = true; }
}
function initMap() {
  const bounds = SHARED_CONFIG.WIERINGEN_BOUNDS;
  const view = L.latLngBounds([bounds.south - 0.018, bounds.west - 0.03], [bounds.north + 0.018, bounds.east + 0.03]);
  state.map = L.map("admin-map", { maxBounds: view, maxBoundsViscosity: 1, zoomSnap: .25, zoomControl: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap-bijdragers" }).addTo(state.map);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  state.map.fitBounds(view);
  const limitZoom = () => state.map.setMinZoom(state.map.getBoundsZoom(view));
  limitZoom(); state.map.on("resize", limitZoom);
  L.polygon(SHARED_CONFIG.WIERINGEN_POLYGON, { color: "#34897a", weight: 1, fillOpacity: .015, interactive: false }).addTo(state.map);
  state.map.on("click", ({ latlng }) => {
    if (state.mode === "player") { placePlayer(latlng); return; }
    if (state.mode === "move") {
      if (!Rules.inside(latlng, SHARED_CONFIG.WIERINGEN_POLYGON)) { status("Kies een woonplek op Wieringen.", true); return; }
      remember(); relocate(latlng); setMode("select"); return;
    }
    if (state.mode === "add") addItem(latlng);
  });
}
function bindUi() {
  $("item-selector").addEventListener("change", () => selectItem($("item-selector").value, true));
  $("show-all").addEventListener("change", renderLayers);
  $("item-search").addEventListener("input", renderList);
  $("editor-form").addEventListener("submit", (e) => e.preventDefault());
  $("editor-form").addEventListener("focusin", (e) => { if (e.target.name) remember(); });
  $("editor-form").addEventListener("input", (e) => { if (e.target.name) editField(e.target.name); });
  $("radius-slider").addEventListener("pointerdown", remember);
  $("radius-slider").addEventListener("input", () => { fields.radius.value = $("radius-slider").value; editField("radius"); });
  $("field-relocate").addEventListener("change", () => { const moving = $("field-relocate").checked; stopPreview(); setMode(moving ? "move" : "select"); });
  $("add-btn").addEventListener("click", () => { stopPreview(); setMode(state.mode === "add" ? "select" : "add"); });
  $("delete-btn").addEventListener("click", () => {
    if (!selected() || !confirm(`${selected().name} verwijderen? Je kunt dit ongedaan maken.`)) return;
    remember(); stopPreview();
    state.items = state.items.filter((item) => item.id !== state.selectedId);
    state.selectedId = state.items[0]?.id || null; rebuild(); changed();
  });
  $("undo-btn").addEventListener("click", () => {
    const previous = state.undo.pop(); if (!previous) return;
    stopPreview(); state.items = JSON.parse(previous.value); state.selectedId = previous.id; rebuild(); changed();
  });
  $("save-btn").addEventListener("click", () => void save());
  $("logout-btn").addEventListener("click", () => {
    if (snapshot() !== state.saved && !confirm("Je hebt niet-opgeslagen wijzigingen. Toch uitloggen?")) return;
    sessionStorage.removeItem(ADMIN_SESSION_KEY); location.reload();
  });
  window.addEventListener("beforeunload", (event) => { if (state.saved && snapshot() !== state.saved) { event.preventDefault(); event.returnValue = ""; } });
  $("preview-start").addEventListener("click", () => {
    if (state.preview) { state.running = !state.running; $("preview-start").textContent = state.running ? "Pauzeren" : "Verder"; }
    else startPreview();
  });
  $("preview-reset").addEventListener("click", () => { stopPreview(); startPreview(); });
  $("preview-stop").addEventListener("click", stopPreview);
  $("preview-time").addEventListener("input", () => { if (state.preview) updatePreview(0); });
  $("image-picker").addEventListener("change", () => {
    const asset = state.assets[Number($("image-picker").value)]; if ($("image-picker").value === "" || !asset || !selected()) return;
    remember(); Object.assign(selected(), { image: asset.image, thumbnail: asset.thumbnail }); fillEditor(); renderLayers(); changed();
  });
  $("import-btn").addEventListener("click", () => $("import-input").click());
  $("import-input").addEventListener("change", async () => {
    try {
      const file = $("import-input").files[0]; if (!file) return;
      const items = JSON.parse(await file.text());
      const errors = Rules.validate(items, SHARED_CONFIG.WIERINGEN_POLYGON);
      if (errors.length) throw new Error(errors[0]);
      if (!confirm("Dit vervangt de huidige lijst in de werkplaats. Doorgaan?")) return;
      remember(); stopPreview(); installItems(items); changed();
    } catch (error) { status(`Import niet uitgevoerd: ${error.message}`, true); }
    finally { $("import-input").value = ""; }
  });
  $("export-btn").addEventListener("click", () => {
    if (!validate()) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.items, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "sammeltjes.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); status("JSON gedownload. De website is niet gewijzigd.");
  });
  $("publish-btn").addEventListener("click", () => void preparePublish());
  $("publish-cancel").addEventListener("click", () => $("publish-dialog").close());
  $("publish-confirm").addEventListener("click", () => void publish());
}
function installItems(items) {
  state.items = items.map(Rules.normalize); state.selectedId = state.items[0]?.id || null; rebuild();
}
function rebuild() {
  for (const layer of state.layers.values()) { layer.marker.remove(); layer.circle.remove(); }
  state.layers.clear(); renderSelector(); renderList(); fillEditor(); renderLayers();
  $("item-count").textContent = `${state.items.length} Sammeltjes`;
  $("editor-fields").disabled = !selected();
  setMode("select");
}
function renderSelector() {
  $("item-selector").innerHTML = state.items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  $("item-selector").value = state.selectedId || "";
}
function renderList() {
  const query = $("item-search").value.toLowerCase();
  $("item-list").innerHTML = state.items.filter((item) => `${item.name} ${item.biome}`.toLowerCase().includes(query)).map((item) =>
    `<button type="button" class="item-row${item.id === state.selectedId ? " is-selected" : ""}" data-item-id="${escapeHtml(item.id)}"><span class="item-row__dot" style="background:${color(item.rarity)}"></span><span>${escapeHtml(item.name)}</span></button>`).join("");
  $("item-list").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectItem(button.dataset.itemId, true)));
}
function selectItem(id, focus = false) {
  if (!state.items.some((item) => item.id === id)) return;
  stopPreview(); state.selectedId = id; fillEditor(); renderSelector(); renderLayers(); renderList(); setMode("select");
  if (focus) state.map.setView([selected().lat, selected().lng], Math.max(15, state.map.getZoom()));
}
function fillEditor() {
  const item = selected();
  if (!item) { $("image-preview").removeAttribute("src"); $("selected-name").textContent = "Nog geen Sammeltje"; return; }
  for (const [key, field] of Object.entries(fields)) { if (key === "active") field.checked = item.active; else field.value = item[key] ?? ""; }
  $("radius-slider").value = item.radius; $("image-preview").src = item.thumbnail || item.image; $("image-preview").alt = item.name;
  $("selected-name").textContent = item.name;
  $("selected-summary").textContent = `${item.biome || "Eilandbewoner"} · ${item.type === "fixed" ? "Vaste plek" : `Woongebied ${item.radius} m`}`;
  updateHelp();
}
function updateHelp() {
  const item = selected(); if (!item) return;
  const fixed = item.type === "fixed";
  fields.behavior.disabled = fixed; fields.speedKmh.disabled = fixed;
  $("behavior-help").textContent = fixed ? "Dit vriendje blijft op zijn vaste plek. Kies bij Woonplek een wandelend vriendje om bewegen in te stellen."
    : item.behavior === "curious" ? "Komt binnen 60 meter naar je toe en wacht op ongeveer 12 meter."
    : item.behavior === "scared" ? "Wijkt 3 seconden uit, rust 6 seconden en blijft binnen zijn woongebied."
    : "Wandelt op eigen tempo, maar blijft staan wanneer je binnen 60 meter komt.";
  const custom = ["schedule", "random-hours"].includes(item.availabilityMode);
  fields.activeFrom.disabled = !custom; fields.activeUntil.disabled = !custom;
  fields.randomHoursPerDay.disabled = item.availabilityMode !== "random-hours";
  const format = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  $("schedule-help").textContent = item.availabilityMode === "random-hours"
    ? `Vandaag actief vanaf: ${Rules.activeSlots(item).map((slot) => format(slot.start)).join(", ")} (telkens een uur).`
    : item.availabilityMode === "all-day" ? "Dit vriendje slaapt niet: de hele dag en nacht te vinden." : `Vindbaar van ${item.activeFrom} tot ${item.activeUntil}. Gelijke tijden betekenen 24 uur.`;
}
function editField(key) {
  const item = selected(); if (!item || key === "id") return;
  const field = fields[key];
  item[key] = key === "active" ? field.checked : numeric.has(key) ? (field.value === "" ? NaN : Number(field.value)) : field.value;
  if (key === "availabilityMode") {
    const updated = Rules.normalize({ ...item, activeFrom: undefined, activeUntil: undefined });
    item.activeFrom = ["schedule", "random-hours"].includes(item.availabilityMode) ? "09:00" : updated.activeFrom;
    item.activeUntil = ["schedule", "random-hours"].includes(item.availabilityMode) ? "23:00" : updated.activeUntil;
    fields.activeFrom.value = item.activeFrom; fields.activeUntil.value = item.activeUntil;
  }
  if (key === "type" && item.type !== "fixed" && item.speedKmh === 0) { item.speedKmh = 2; fields.speedKmh.value = 2; }
  if (key === "radius") $("radius-slider").value = item.radius;
  $("selected-name").textContent = item.name;
  renderSelector(); renderList(); renderLayers(); updateHelp(); changed();
  if (state.preview) { state.preview = Rules.create(item); updatePreview(0); }
}
function icon(item) {
  return L.divIcon({ className: "admin-companion", iconSize: [44, 52], iconAnchor: [22, 44],
    html: `<img src="${escapeHtml(item.thumbnail || item.image)}" alt="${escapeHtml(item.name)}" style="border-color:${color(item.rarity)}" />` });
}
function renderLayers() {
  for (const item of state.items) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    let layer = state.layers.get(item.id);
    if (!layer) {
      const marker = L.marker([item.lat, item.lng], { draggable: true, autoPan: false, icon: icon(item) });
      const circle = L.circle([item.lat, item.lng], { radius: Number.isFinite(item.radius) ? item.radius : 50, color: color(item.rarity), weight: 1, fillOpacity: .05, interactive: false });
      marker.on("click", () => selectItem(item.id));
      marker.on("dragstart", () => { remember(); state.map.dragging.disable(); });
      marker.on("drag", () => { circle.setLatLng(marker.getLatLng()); });
      marker.on("dragend", () => {
        state.map.dragging.enable();
        const point = marker.getLatLng();
        if (!Rules.inside(point, SHARED_CONFIG.WIERINGEN_POLYGON)) { marker.setLatLng([item.lat, item.lng]); circle.setLatLng([item.lat, item.lng]); status("Blijf binnen Wieringen.", true); return; }
        Object.assign(item, { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6) });
        selectItem(item.id); changed();
      });
      layer = { marker, circle, image: "" }; state.layers.set(item.id, layer);
    }
    const visible = (item.id === state.selectedId || $("show-all").checked);
    if (visible) {
      layer.circle.addTo(state.map);
      if (!(state.preview && item.id === state.selectedId)) layer.marker.addTo(state.map); else layer.marker.remove();
    } else { layer.marker.remove(); layer.circle.remove(); }
    layer.marker.setLatLng([item.lat, item.lng]);
    layer.circle.setLatLng([item.lat, item.lng]).setRadius(Number.isFinite(item.radius) ? Math.max(0, item.radius) : 50);
    layer.circle.setStyle({ color: color(item.rarity) });
    const appearance = JSON.stringify([item.thumbnail, item.image, item.rarity]);
    if (layer.image !== appearance) { layer.marker.setIcon(icon(item)); layer.image = appearance; }
    const element = layer.marker.getElement();
    if (element) { element.setAttribute("data-testid", `admin-marker-${item.id}`); element.style.opacity = item.active ? "1" : ".45"; }
  }
}
function setMode(mode) {
  state.mode = selected() || mode === "add" ? mode : "select";
  $("field-relocate").checked = state.mode === "move";
  state.map.getContainer().classList.toggle("admin-map--relocate", ["move", "add"].includes(state.mode));
  $("map-mode-label").textContent = state.mode === "move" ? `Verplaatsmodus actief voor ${selected().name}: klik op de nieuwe woonplek.`
    : state.mode === "add" ? "Klik op Wieringen om een nieuw Sammeltje toe te voegen."
    : state.mode === "player" ? "Proefwandeling: klik om de testspeler te verplaatsen."
    : "Sleep het gekozen vriendje of gebruik Verplaats naar. Gewoon klikken verandert niets.";
}
function relocate(point) {
  if (!selected()) return;
  Object.assign(selected(), { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6) });
  fillEditor(); renderLayers(); changed();
}
function addItem(point) {
  if (!Rules.inside(point, SHARED_CONFIG.WIERINGEN_POLYGON)) { status("Kies een plek op Wieringen.", true); return; }
  remember();
  let n = 1; while (state.items.some((item) => item.id === `nieuw-sammeltje-${n}`) || state.lockedIds.has(`nieuw-sammeltje-${n}`)) n++;
  state.items.push(Rules.normalize({ id: `nieuw-sammeltje-${n}`, name: `Nieuw vriendje ${n}`, type: "roaming", behavior: "curious", speedKmh: 2,
    lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: 100, rarity: "common", biome: "", description: "",
    image: "", thumbnail: "", active: false, availabilityMode: "schedule", activeFrom: "09:00", activeUntil: "23:00" }));
  state.selectedId = state.items.at(-1).id; rebuild(); changed();
}
function previewDate() {
  const today = new Date();
  const desired = $("preview-time").value || "19:00";
  const [h, m] = desired.split(":").map(Number);
  const offset = h * 60 + m - Rules.localTime(today).minute;
  return new Date(today.getTime() + offset * 60000);
}
function placePlayer(point) {
  if (!Rules.inside(point, SHARED_CONFIG.WIERINGEN_POLYGON)) { status("Plaats de testspeler op Wieringen.", true); return; }
  state.player = { lat: point.lat, lng: point.lng };
  if (!state.playerMarker) {
    state.playerMarker = L.marker(point, { icon: L.divIcon({ className: "", html: '<div class="player-test-marker"></div>', iconSize: [18, 18] }) }).addTo(state.map);
    state.radar = L.circle(point, { radius: 60, color: "#ad547b", fillOpacity: .035, interactive: false }).addTo(state.map);
  } else { state.playerMarker.setLatLng(point); state.radar.setLatLng(point); }
  void terrain.refresh(state.player);
  $("player-status").textContent = "Klik elders op de kaart om te zien hoe je vriendje reageert.";
  updatePreview(0);
}
function startPreview() {
  if (!selected() || !validate()) return;
  stopPreview(); state.preview = Rules.create(selected()); state.running = true;
  state.previewMarker = L.marker([selected().lat, selected().lng], { icon: icon(selected()), interactive: false }).addTo(state.map);
  state.map.setView([selected().lat, selected().lng], 18);
  let start = Rules.destination(selected(), 40, 90);
  if (!Rules.inside(start, SHARED_CONFIG.WIERINGEN_POLYGON)) start = { lat: selected().lat, lng: selected().lng };
  placePlayer(start); setMode("player"); renderLayers();
  $("preview-overlay").hidden = false; $("preview-start").textContent = "Pauzeren";
  state.timer = setInterval(() => { if (state.running && !document.hidden) updatePreview(.2); }, 200);
}
function updatePreview(dt) {
  if (!state.preview) return;
  Rules.step(state.preview, { player: state.player, dt, now: previewDate(), canOccupy: terrain.canOccupy });
  state.previewMarker.setLatLng(Rules.point(state.preview));
  $("preview-state").textContent = `${state.preview.name} ${state.preview.status}`;
  $("preview-terrain").textContent = `Terrein: ${terrain.status}${terrain.status === "basis" ? " (alleen eilandgrens bekend)" : ""}`;
}
function stopPreview() {
  clearInterval(state.timer); state.previewMarker?.remove(); state.playerMarker?.remove(); state.radar?.remove();
  state.preview = null; state.previewMarker = null; state.playerMarker = null; state.radar = null; state.running = false;
  $("preview-overlay").hidden = true; $("preview-start").textContent = "Start proefwandeling";
  if (state.map) { setMode("select"); renderLayers(); }
}
function validate() {
  const errors = Rules.validate(state.items, SHARED_CONFIG.WIERINGEN_POLYGON);
  if (errors.length) { status(errors[0], true); return false; } return true;
}
async function save() {
  if (state.saving || !validate()) return false;
  state.saving = true; $("save-btn").disabled = true;
  const items = JSON.parse(snapshot());
  try {
    const result = await api("/api/save-sammeltjes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, revision: state.revision }) });
    state.revision = result.revision; state.saved = JSON.stringify(items);
    items.forEach((item) => state.lockedIds.add(item.id));
    localStorage.setItem(DATA_VERSION_KEY, String(Date.now()));
    status(snapshot() === state.saved ? "Opgeslagen op computer. Publiceer om je telefoonapp bij te werken." : "Vorige versie opgeslagen; er zijn nog nieuwe wijzigingen.");
    return true;
  } catch (error) { status(`Niet opgeslagen: ${error.message}`, true); return false; }
  finally { state.saving = false; $("save-btn").disabled = false; }
}
let publication = null;
async function preparePublish() {
  if (snapshot() !== state.saved) { status("Sla je wijzigingen eerst op de computer op.", true); return; }
  $("publish-btn").disabled = true;
  try {
    publication = await api("/api/publish-preview");
    $("publish-changes").innerHTML = publication.changes.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
    $("publish-warning").textContent = publication.changes.length ? "Alleen de opgeslagen Sammeltjesgegevens worden gepubliceerd." : "De gegevens komen overeen. Je kunt de online versie opnieuw controleren.";
    $("publish-dialog").showModal();
  } catch (error) { status(error.message, true); }
  finally { $("publish-btn").disabled = false; }
}
async function publish() {
  if (!publication) return;
  if (snapshot() !== state.saved) { $("publish-dialog").close(); status("Sla de nieuwe wijzigingen eerst op.", true); return; }
  $("publish-dialog").close(); $("publish-btn").disabled = true;
  try {
    const job = await api("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: publication.revision, remoteHead: publication.remoteHead }) });
    $("publish-status").textContent = "Publicatie bezig...";
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      result = await api(`/api/publish-status?id=${encodeURIComponent(job.id)}`);
      $("publish-status").textContent = result.message;
    } while (["working", "checking"].includes(result.status));
    if (result.status === "failed") status(result.message, true);
  } catch (error) { $("publish-status").textContent = `Publicatie niet bevestigd: ${error.message}`; }
  finally { $("publish-btn").disabled = false; }
}
function installTestApi() {
  window.__SAMMELTJES_ADMIN_TEST_API__ = {
    selectItem, getSelectedItem: () => JSON.parse(JSON.stringify(selected() || null)),
    updateSelectedItem(patch) { remember(); for (const [key, value] of Object.entries(patch)) { if (!fields[key] || key === "id") continue; if (key === "active") fields[key].checked = value; else fields[key].value = value; editField(key); } return this.getSelectedItem(); },
    save, getStateSnapshot: () => ({ selectedId: state.selectedId, itemCount: state.items.length, loadStatus: $("load-status").textContent }),
    getMapContainerPoint(lat, lng) { const p = state.map.latLngToContainerPoint([lat, lng]); return { x: p.x, y: p.y }; },
    getPreview: () => state.preview ? JSON.parse(JSON.stringify(state.preview)) : null,
    placePlayer, stepPreview: updatePreview
  };
}
