const CACHE_NAME = "fitplan-pro-v2-cache-v2-6";
const BASE = self.registration.scope;

const ASSETS = [
  BASE,
  BASE + "index.html",
  BASE + "styles.css",
  BASE + "app.js",
  BASE + "db.js",
  BASE + "plan.js",
  BASE + "manifest.webmanifest",
  BASE + "sw.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Network-first for JS/CSS
  if (req.url.endsWith(".js") || req.url.endsWith(".css")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});