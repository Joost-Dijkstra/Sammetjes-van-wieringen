(function (root) {
  "use strict";
  const Rules = root.SammeltjesRules;
  function nearLine(point, line, meters) {
    const scale = Math.cos(point.lat * Math.PI / 180);
    const project = (p) => ({ x: (p.lng - point.lng) * 111320 * scale, y: (p.lat - point.lat) * 111320 });
    for (let i = 1; i < line.length; i++) {
      const a = project(line[i - 1]), b = project(line[i]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(a.x + t * dx, a.y + t * dy) <= meters) return true;
    }
    return false;
  }
  function create(polygon) {
    let data = null, loading = false, retryAt = 0;
    try {
      const cached = JSON.parse(localStorage.getItem("sammeltjes-terrain-v1") || "null");
      if (cached?.savedAt > Date.now() - 7 * 86400000 && ["blocked", "paths", "waterways", "fields"].every((key) => Array.isArray(cached[key]))) data = cached;
    } catch (error) { /* An unavailable cache does not prevent a walk. */ }
    function canOccupy(point) {
      if (!Rules.inside(point, polygon)) return false;
      if (!data || Rules.distance(point, data.center) > 900) return true;
      if (data.blocked.some((shape) => Rules.inside(point, shape))) return false;
      if (data.waterways.some((line) => nearLine(point, line, 8))) return false;
      return data.fields.some((shape) => Rules.inside(point, shape)) || data.paths.some((line) => nearLine(point, line, 16));
    }
    async function refresh(center) {
      if (loading || !navigator.onLine || Date.now() < retryAt || !Rules.inside(center, polygon) || (data && Rules.distance(center, data.center) < 350)) return;
      loading = true;
      const origin = { lat: center.lat, lng: center.lng };
      const query = `[out:json][timeout:12];(way[building](around:900,${origin.lat},${origin.lng});way[natural=water](around:900,${origin.lat},${origin.lng});way[waterway](around:900,${origin.lat},${origin.lng});way[highway](around:900,${origin.lat},${origin.lng});way[landuse~"grass|farmland|meadow|reservoir|basin"](around:900,${origin.lat},${origin.lng});way[leisure=park](around:900,${origin.lat},${origin.lng});way[natural=grassland](around:900,${origin.lat},${origin.lng}););out geom;`;
      try {
        let result;
        for (const endpoint of ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          try {
            const response = await fetch(endpoint, { method: "POST", body: query, signal: controller.signal });
            if (!response.ok) throw new Error(`Terrein ${response.status}`);
            result = await response.json();
            if (!Array.isArray(result.elements)) throw new Error("Onvolledig terrein");
            break;
          } catch (error) { result = null; } finally { clearTimeout(timer); }
        }
        if (!result) throw new Error("Terrein tijdelijk niet bereikbaar");
        const next = { center: origin, savedAt: Date.now(), blocked: [], waterways: [], fields: [], paths: [] };
        for (const element of result.elements) {
          if (!Array.isArray(element.geometry) || element.geometry.length < 2) continue;
          const points = element.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
          const tags = element.tags || {};
          const closed = points.length > 3 && Rules.distance(points[0], points.at(-1)) < 6;
          if ((tags.building || tags.natural === "water" || /^(reservoir|basin)$/.test(tags.landuse)) && closed) next.blocked.push(points);
          else if (tags.waterway) next.waterways.push(points);
          else if (tags.highway) next.paths.push(points);
          else if (closed) next.fields.push(points);
        }
        data = next;
        try { localStorage.setItem("sammeltjes-terrain-v1", JSON.stringify(data)); } catch (error) { /* Use memory if storage is full. */ }
      } catch (error) { retryAt = Date.now() + 120000; }
      finally { loading = false; }
    }
    return { canOccupy, refresh, get status() { return loading ? "laden" : data ? "slim" : "basis"; } };
  }
  root.SammeltjesTerrain = { create };
})(window);
