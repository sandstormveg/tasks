// App-shell cache only, so the page opens with no signal. Network-first: whenever
// you're online you get the latest files, the cache is just the fallback. Data
// (data/*.json, images, GitHub API calls) is never cached here: stale task data
// would be worse than none; app.js keeps its own saved copy and labels it offline.
const SHELL_CACHE = "tasks-shell-v1";
const SHELL_FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (/\/(data|images|files)\//.test(path)) return false;
  return req.mode === "navigate" || /\.(html|js|css|json|svg|png)$/.test(path) || path.endsWith("/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!isShellRequest(req)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === "navigate" ? caches.match("index.html", { ignoreSearch: true }) : undefined) || Response.error()
        )
      )
  );
});
