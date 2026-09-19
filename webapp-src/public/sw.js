/** Service worker for ChronoNote Web App PWA.
 *
 * Implements an offline-capable, instant-launch caching strategy:
 * - Pre-caches the core application shell on install (HTML, icons, manifest).
 * - Serves immutable hashed static assets (/assets/) Cache-First for instant 0ms load.
 * - Serves navigation requests (index.html) with a fast network timeout (1.5s),
 *   falling back immediately to the cached shell when offline or on poor connections.
 * - Completely bypasses caching for Microsoft OAuth, Entra ID, and Graph API endpoints.
 */

const CACHE_NAME = "chrononote-webapp-shell-v2";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-256.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => {
        console.warn("[SW] Precache failed:", err);
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass service worker for Microsoft OAuth, Graph API, and cross-origin requests
  if (
    url.hostname === "login.microsoftonline.com" ||
    url.hostname === "graph.microsoft.com" ||
    url.hostname.endsWith(".microsoft.com") ||
    url.hostname.endsWith(".microsoftonline.com") ||
    url.hostname.endsWith(".microsoftpersonalcontent.com") ||
    url.hostname.endsWith(".sharepoint.com") ||
    url.hostname.endsWith(".live.com") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (event.request.method !== "GET") return;

  // Navigation requests (HTML page): network with fast timeout, fallback to cached shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkPromise = fetch(event.request);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Network timeout")), 1500),
          );
          const response = await Promise.race([networkPromise, timeoutPromise]);
          if (response.ok) {
            cache.put(event.request, response.clone());
            return response;
          }
        } catch {
          // Offline or slow network — immediately fall back to cached shell
        }
        const cached =
          (await cache.match(event.request)) ||
          (await cache.match("./")) ||
          (await cache.match("./index.html")) ||
          (await cache.match("index.html"));
        if (cached) return cached;
        return fetch(event.request);
      })(),
    );
    return;
  }

  // Immutable hashed assets (/assets/): Cache-First for instant launch
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // All other same-origin GET requests (icons, manifest, etc.): Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      return cached || fetchPromise;
    }),
  );
});
