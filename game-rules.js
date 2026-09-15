(function (root) {
  "use strict";
  const RADAR_RADIUS = 60;
  const DISCOVERY_RADIUS = 20;
  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  const modes = ["all-day", "morning", "afternoon", "evening", "night", "random-hours", "schedule"];
  const windows = { "all-day": ["00:00", "00:00"], morning: ["06:00", "14:00"],
    afternoon: ["11:00", "19:00"], evening: ["17:00", "23:00"], night: ["21:00", "07:00"] };
  const radians = (n) => n * Math.PI / 180;
  const degrees = (n) => n * 180 / Math.PI;
  const clamp = (n, min, max, fallback) => Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Number(n))) : fallback;
  const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const validTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  function normalize(record) {
    const type = ["fixed", "roaming", "wild"].includes(record.type) ? record.type : "fixed";
    const mode = modes.includes(record.availabilityMode) ? record.availabilityMode : "all-day";
    const defaults = windows[mode] || (mode === "random-hours" ? ["00:00", "00:00"] : ["09:00", "23:00"]);
    return { ...record, type, radius: Math.round(clamp(record.radius, 50, 500, 80)),
      behavior: ["curious", "scared", "shy"].includes(record.behavior) ? record.behavior : "shy",
      speedKmh: clamp(record.speedKmh, 0, 15, 2), active: record.active !== false,
      availabilityMode: mode,
      activeFrom: validTime(record.activeFrom) ? record.activeFrom : defaults[0],
      activeUntil: validTime(record.activeUntil) ? record.activeUntil : defaults[1],
      randomHoursPerDay: Math.round(clamp(record.randomHoursPerDay, 1, 24, 6)) };
  }

  function localTime(now = new Date()) {
    const parts = Object.fromEntries(timeFormat.formatToParts(now).map(({ type, value }) => [type, value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  function seededRandom(text) {
    let seed = 2166136261;
    for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }

  function activeSlots(record, now = new Date()) {
    const item = normalize(record);
    const start = minute(item.activeFrom);
    const duration = (minute(item.activeUntil) - start + 1440) % 1440 || 1440;
    const slots = Array.from({ length: Math.floor(duration / 60) }, (_, i) => i);
    const random = seededRandom(`${item.id}:${localTime(now).date}`);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots.slice(0, item.randomHoursPerDay).sort((a, b) => a - b)
      .map((slot) => ({ start: (start + slot * 60) % 1440, duration: 60 }));
  }

  function available(record, now = new Date()) {
    const item = normalize(record);
    if (!(typeof record.enabled === "boolean" ? record.enabled : item.active)) return false;
    if (item.availabilityMode === "all-day") return true;
    const current = localTime(now).minute;
    if (item.availabilityMode === "random-hours") {
      return activeSlots(item, now).some((slot) => (current - slot.start + 1440) % 1440 < slot.duration);
    }
    const start = minute(item.activeFrom);
    const duration = (minute(item.activeUntil) - start + 1440) % 1440 || 1440;
    return (current - start + 1440) % 1440 < duration;
  }

  function distance(a, b) {
    const lat = radians(b.lat - a.lat), lng = radians(b.lng - a.lng);
    const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const d = radians(b.lng - a.lng);
    return (degrees(Math.atan2(Math.sin(d) * Math.cos(radians(b.lat)),
      Math.cos(radians(a.lat)) * Math.sin(radians(b.lat)) - Math.sin(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.cos(d))) + 360) % 360;
  }
  function destination(from, meters, heading) {
    const d = meters / 6371000, b = radians(heading), lat = radians(from.lat), lng = radians(from.lng);
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
    return { lat: degrees(nextLat), lng: degrees(lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(nextLat))) };
  }
  function inside(point, polygon) {
    if (!polygon?.length || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.lat > point.lat) !== (b.lat > point.lat) && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) result = !result;
    }
    return result;
  }
  function create(record) {
    const item = normalize(record);
    return { ...item, homeLat: item.lat, homeLng: item.lng, currentLat: item.lat, currentLng: item.lng,
      target: null, phaseSeconds: 0, inRadar: false, status: "wacht rustig", moving: false };
  }
  function point(entity) { return { lat: entity.currentLat, lng: entity.currentLng }; }
  function step(entity, { player, dt = 0.2, now = new Date(), random = Math.random, canOccupy = () => true }) {
    entity.moving = false;
    if (!available(entity, now)) { entity.status = (entity.enabled ?? entity.active) === false ? "uitgeschakeld" : "slaapt"; return entity; }
    const current = point(entity);
    const near = player && distance(current, player) <= RADAR_RADIUS;
    if (!near) entity.phaseSeconds = 0;
    else entity.phaseSeconds = entity.inRadar ? entity.phaseSeconds + dt : 0;
    entity.inRadar = Boolean(near);
    if (entity.type === "fixed" || entity.speedKmh === 0 || (near && entity.behavior === "shy")) {
      entity.status = near ? "kijkt je rustig aan" : "wacht rustig";
      entity.target = null;
      return entity;
    }
    const home = { lat: entity.homeLat, lng: entity.homeLng };
    const allowed = (p) => distance(home, p) <= entity.radius + 0.01 && canOccupy(p);
    if (near && entity.behavior === "curious") {
      if (distance(current, player) <= 12) { entity.status = "blij je te zien"; return entity; }
      entity.target = player;
      entity.status = "loopt naar je toe";
    } else if (near && entity.behavior === "scared") {
      if (entity.phaseSeconds % 9 >= 3) { entity.status = "rust even uit"; return entity; }
      entity.target = destination(current, 8, bearing(player, current));
      entity.status = "wijkt voorzichtig uit";
    } else {
      entity.status = "verkent zijn woonplek";
      if (!entity.target || distance(current, entity.target) < 1) {
        entity.target = null;
        for (let i = 0; i < 12; i++) {
          const target = destination(current, 5 + random() * 20, random() * 360);
          if (allowed(target)) { entity.target = target; break; }
        }
      }
    }
    if (!entity.target) { entity.status = "wacht op een vrij paadje"; return entity; }
    const meters = Math.min(entity.speedKmh / 3.6 * Math.min(dt, 0.5), distance(current, entity.target));
    const heading = bearing(current, entity.target);
    const candidate = destination(current, meters, heading);
    // Check the segment as well as its endpoint; no skipping across a ditch.
    const pieces = Math.max(1, Math.ceil(meters / 1));
    for (let i = 1; i <= pieces; i++) {
      if (!allowed(destination(current, meters * i / pieces, heading))) {
        entity.target = null;
        entity.status = "wacht op een vrij paadje";
        return entity;
      }
    }
    entity.currentLat = candidate.lat;
    entity.currentLng = candidate.lng;
    entity.moving = meters > 0;
    return entity;
  }

  function validate(items, polygon) {
    if (!Array.isArray(items) || !items.length) return ["Het bestand moet minstens een Sammeltje bevatten."];
    const errors = [], ids = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object") { errors.push("Ongeldig Sammeltje."); continue; }
      const label = item.name || item.id || "Sammeltje";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || "") || ids.has(item.id)) errors.push(`${label}: ID ontbreekt, is ongeldig of bestaat al.`);
      ids.add(item.id);
      if (typeof item.name !== "string" || !item.name.trim() || typeof item.description !== "string" || !item.description.trim()) errors.push(`${label}: vul naam en verhaal in.`);
      if (!inside(item, polygon)) errors.push(`${label}: kies een woonplek op Wieringen.`);
      if (!["fixed", "roaming", "wild"].includes(item.type) || !["common", "rare", "legendary"].includes(item.rarity)) errors.push(`${label}: ongeldige woonwijze of zeldzaamheid.`);
      if (!["curious", "scared", "shy"].includes(item.behavior)) errors.push(`${label}: kies een karakter.`);
      if (!Number.isFinite(item.radius) || item.radius < 50 || item.radius > 500) errors.push(`${label}: woonradius moet 50-500 meter zijn.`);
      if (!Number.isFinite(item.speedKmh) || item.speedKmh < 0 || item.speedKmh > 15) errors.push(`${label}: snelheid moet 0-15 km/u zijn.`);
      if (typeof item.active !== "boolean") errors.push(`${label}: kies of het actief is.`);
      for (const key of ["image", "thumbnail"]) {
        if (typeof item[key] !== "string" || !/^assets\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g)$/i.test(item[key]) || item[key].includes("..")) errors.push(`${label}: kies een bestaande afbeelding uit assets.`);
      }
      if (!modes.includes(item.availabilityMode)) errors.push(`${label}: kies een dagritme.`);
      for (const key of ["activeFrom", "activeUntil"]) if (item[key] !== undefined && !validTime(item[key])) errors.push(`${label}: gebruik een geldige tijd (uu:mm).`);
      if (item.availabilityMode === "random-hours") {
        const normalized = normalize(item);
        const duration = (minute(normalized.activeUntil) - minute(normalized.activeFrom) + 1440) % 1440 || 1440;
        if (!Number.isInteger(item.randomHoursPerDay) || item.randomHoursPerDay < 1 || item.randomHoursPerDay > Math.floor(duration / 60)) errors.push(`${label}: het aantal willekeurige uren past niet in het tijdvenster.`);
      }
    }
    return errors;
  }
  const api = { RADAR_RADIUS, DISCOVERY_RADIUS, normalize, localTime, activeSlots, available,
    seededRandom, distance, bearing, destination, inside, create, point, step, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SammeltjesRules = Object.freeze(api);
})(typeof window === "undefined" ? globalThis : window);
