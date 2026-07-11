const CACHE_VERSION = "v5";
const SHELL_CACHE = `sammeltjes-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sammeltjes-runtime-${CACHE_VERSION}`;
const TILE_CACHE = `sammeltjes-tiles-${CACHE_VERSION}`;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./tailwind.generated.css?v=20260711",
  "./vendor/leaflet/leaflet.css?v=1.9.4",
  "./vendor/leaflet/leaflet.js?v=1.9.4",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./style.css?v=20260711",
  "./shared-config.js?v=20260711",
  "./app.js?v=20260711",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApp().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) =>
            [SHELL_CACHE, RUNTIME_CACHE, TILE_CACHE].includes(key) ? Promise.resolve() : caches.delete(key)
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(tileCacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }
  if (url.pathname.endsWith("/data/sammeltjes.json")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.destination === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.destination === "style" || request.destination === "script") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function precacheApp() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_ASSETS);
  try {
    const dataRequest = new Request("./data/sammeltjes.json", { cache: "reload" });
    const response = await fetch(dataRequest);
    if (!response.ok) {
      return;
    }
    const items = await response.clone().json();
    await shell.put(dataRequest, response);
    const images = [...new Set(items.flatMap((item) => [item.image, item.thumbnail]).filter(Boolean))];
    await Promise.allSettled(images.map((image) => shell.add(new Request(`./${image}`))));
  } catch (error) {
    // The shell is still usable; images are cached when they are viewed.
  }
}

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await caches.match(request)) || (fallbackUrl && caches.match(fallbackUrl));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  });
  return cached || network;
}

async function tileCacheFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
    await trimCache(cache, 160);
  }
  return response;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}
