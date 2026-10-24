// Service worker: makes the journal open and work offline.
//
// - App files are precached from asset-manifest.json at install, so every
//   view works offline from the first visit.
// - Same-origin GETs are network-first (a deploy shows up on the next load)
//   with the cache as fallback. They revalidate with the server ("no-cache")
//   so a deploy never mixes fresh and HTTP-cached modules (Pages caches ~10 min).
// - Nothing else is touched: GitHub, Anthropic and transcription requests go
//   straight to the network, and journal data lives in IndexedDB, not here.
// - Other apps on this origin (e.g. Tasks, when the journal lives at
//   tasks/journal/ on github.io) keep their own caches: only this journal's
//   cache is ever replaced, and it's named after its own scope.

const PREFIX = "living-journal-shell";
const CACHE = `${PREFIX} ${self.registration.scope}`;

async function precache() {
  const res = await fetch("asset-manifest.json", { cache: "no-store" });
  if (!res.ok) return;
  const { files } = await res.json();
  const cache = await caches.open(CACHE);
  await Promise.all(files.map((f) => fetch(f, { cache: "no-cache" }).then((r) => (r.ok ? cache.put(f, r) : null)).catch(() => null)));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k === PREFIX || k.endsWith(` ${self.registration.scope}`))).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data === "precache") e.waitUntil?.(precache().catch(() => {}));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === "navigate";
  e.respondWith((async () => {
    try {
      // A navigation request can't be re-made with options; its URL can.
      const res = await fetch(isNav ? req.url : req, { cache: "no-cache" });
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(isNav ? "index.html" : req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(isNav ? "index.html" : req, { ignoreSearch: true });
      if (hit) return hit;
      if (isNav) return (await cache.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});
