// Service worker: makes Adventurer open and work offline. Same design as the
// Living Journal's (sandstormveg/Journal_system sw.js): app files precached
// from asset-manifest.json, same-origin GETs network-first with the cache as
// fallback, everything cross-origin (GitHub, Wikipedia, the pose model) left
// alone, and only this app's own cache — named after its scope — ever replaced.
// The pose bundle isn't precached (1 MB); it's cached the first time it's used.

const PREFIX = "adventurer-shell";
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
