const CACHE_NAME = "fitplan-pro-v2-cache-v2"; // 👈 bump version
const BASE = self.registration.scope;

const ASSETS = [
  BASE,
  BASE + "index.html",
  BASE + "styles.css",
  BASE + "app.js",
  BASE + "db.js",
  BASE + "plan.js",
  BASE + "manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // 👈 activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      )
    )
  );
  self.clients.claim(); // 👈 control tabs immediately
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Network-first for JS/CSS (so updates apply)
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
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});