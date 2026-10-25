// App-shell cache only, so the page opens with no signal. Network-first: whenever
// you're online you get the latest files, the cache is just the fallback. Data
// (data/*.json, images, GitHub API calls) is never cached here: stale task data
// would be worse than none; app.js keeps its own saved copy and labels it offline.
// journal/ is a separate app on this same site with its own service worker and
// cache: this one leaves its requests and its cache alone (Tasks registers that
// worker too, so the journal is saved for offline even before you first open it).
//
// One cache entry per file, keyed without its ?v= query, and every page under the
// shell shares one "index.html" entry. Keying by the full URL (v1) could keep an old
// page around under one address (from before the Journal tab, say) and serve it offline,
// next to a newer app.js. Fetches revalidate with the server ("no-cache") so the copy
// saved is never one GitHub Pages' ~10 minute HTTP cache was still holding.
const SHELL_CACHE = "tasks-shell-v2";
const SHELL_FILES = ["index.html", "style.css", "app.js", "manifest.json", "favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_FILES.map((f) =>
        fetch(scopeUrl(f), { cache: "no-cache" }).then((res) => res.ok && cache.put(scopeUrl(f), res)).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tasks-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(req, url) {
  if (req.method !== "GET" || url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (/\/(data|images|files|journal)\//.test(path)) return false;
  return req.mode === "navigate" || /\.(html|js|css|json|svg|png)$/.test(path) || path.endsWith("/");
}

// Only reached when the journal's own worker isn't installed yet (it handles journal/ once
// it is). Online that's just the network; offline it's this page instead of a dead end.
const JOURNAL_OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Journal offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070a;color:#dcffe1;
font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:24px;box-sizing:border-box;text-align:center}
a{color:#1de9b6}p{max-width:34em}</style></head><body><div>
<p>The Journal isn't saved on this device yet, so it can't open offline.</p>
<p>Open it once with a connection and it'll work offline from then on.</p>
<p><a href="../">‹ Back to Tasks</a></p></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === "GET" && req.mode === "navigate" && url.origin === self.location.origin && /\/journal\//.test(url.pathname)) {
    event.respondWith(fetch(req).catch(() => new Response(JOURNAL_OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  if (!isShellRequest(req, url)) return;
  const isNav = req.mode === "navigate";
  const isPage = isNav && /\/(index\.html)?$/.test(url.pathname);
  const key = isPage ? scopeUrl("index.html") : url.origin + url.pathname;
  event.respondWith(
    // A navigation request can't be re-made with options; its URL can.
    fetch(isNav ? req.url : req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => (await caches.match(key)) || (isNav && (await caches.match(scopeUrl("index.html")))) || Response.error())
  );
});
