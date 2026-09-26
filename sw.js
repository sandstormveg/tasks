// Minimal service worker: no caching (this app is GitHub-API-driven and
// stale cached data would be worse than no service worker at all). It
// exists purely to satisfy install-eligibility checks on Chrome/Android.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
