/** Minimal service worker for the web app's PWA install — see
 * docs/design/webapp-roadmap.md's "PWA / offline install" section.
 *
 * Network-first, falling back to cache when offline: every successful GET
 * is cached under its own URL and re-fetched fresh on the next request,
 * so an online visitor always gets whatever's currently deployed (no
 * install criteria met at the cost of the same staleness risk a long
 * Cache-Control max-age would introduce — see the CLAUDE.local.md note
 * on the website-live browser-cache incident this project already hit
 * once). Offline, whatever was last successfully fetched still loads.
 *
 * Deliberately not a build-time precache list: the bundle's hashed asset
 * filenames change every rebuild, and this app's real data lives in
 * IndexedDB, not anything the service worker needs to manage — caching
 * whatever's actually requested, whenever it's requested, is enough.
 */
const CACHE_NAME = "chrononote-webapp-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
