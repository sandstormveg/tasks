// Boot: open the local store, apply settings, start the router and sync.
// Views are loaded on demand; each one gets a `ui` object to set the top bar
// and to react to store changes, and is cleaned up on navigation.

import { createContext } from "./app/context.js";
import { loadHost } from "./app/host.js";
import { icon } from "./ui/icons.js";
import { $, $$, html, raw, sheet, toast, agoLabel } from "./ui/dom.js";

const ROUTES = [
  [/^today$/, "today", "today"],
  [/^day\/(\d{4}-\d{2}-\d{2})$/, "day", "timeline"],
  [/^entry\/([^/]+)$/, "entry", null],
  [/^timeline$/, "timeline", "timeline"],
  [/^photos$/, "photos", "photos"],
  [/^search$/, "search", "search"],
  [/^reflect(?:\/([a-z-]+))?$/, "reflect", "reflect"],
  [/^claim\/([^/]+)$/, "claim", "reflect"],
  [/^library$/, "library", "library"],
  [/^document\/new$/, "document-new", "library"],
  [/^talk$/, "talk", "talk"],
  [/^import(?:\/([a-z-]+))?$/, "import", "settings"],
  [/^settings(?:\/([a-z-]+))?$/, "settings", "settings"],
  [/^concept\/([^/]+)$/, "concept", null],
  [/^tag\/([^/]+)$/, "search", "search"],
];

function parseHash() {
  const h = decodeURIComponent((location.hash || "#/today").replace(/^#\/?/, ""));
  const [path, query = ""] = h.split("?");
  const qs = Object.fromEntries(new URLSearchParams(query));
  for (const [re, view, tab] of ROUTES) {
    const m = re.exec(path);
    if (m) return { view, tab, params: m.slice(1), query: qs, path };
  }
  return { view: "today", tab: "today", params: [], query: qs, path: "today" };
}

function applyTheme(ctx) {
  const s = ctx.settings();
  const root = document.documentElement;
  // data-app-theme, not data-theme: a host page may own data-theme (light/dark) for itself.
  if (s.theme && s.theme !== "auto") root.dataset.appTheme = s.theme; else delete root.dataset.appTheme;
  root.style.setProperty("--text-scale", String(s.textScale || 1));
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute("content", bg);
}

function fillIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.dataset.iconDone) continue;
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    el.dataset.iconDone = "1";
  }
}

function renderSyncPill(ctx) {
  const pill = $("#sync-pill");
  const line = $("#sync-line");
  const st = ctx.sync.status;
  const pending = ctx.sync.pendingCount();
  let label, ic, cls = "";
  if (!ctx.sync.configured()) { label = ctx.volatile ? "Not saving!" : "On this device"; ic = "cloudOff"; cls = ctx.volatile ? "error" : ""; }
  else if (st.state === "syncing") { label = "Syncing…"; ic = "sync"; }
  else if (st.state === "error") { label = "Sync problem"; ic = "warn"; cls = "error"; }
  else if (st.state === "offline") { label = pending ? `Offline · ${pending} waiting` : "Offline"; ic = "cloudOff"; cls = pending ? "pending" : ""; }
  else if (pending) { label = `${pending} to sync`; ic = "cloud"; cls = "pending"; }
  else { label = st.lastSync ? `Synced ${agoLabel(st.lastSync)}` : "Synced"; ic = "cloud"; }
  pill.className = `sync-pill ${cls}`;
  pill.innerHTML = `${icon(ic)}<span class="only-desktop">${label}</span>`;
  pill.title = st.error || label;
  if (line) line.textContent = st.error ? `Sync: ${st.error}` : label;
}

/** "‹ Tasks" when the journal lives inside a host app: the way back to the rest of it. */
function hostLink(ctx, cls) {
  const h = ctx.host;
  return h?.home ? html`<a class="${cls}" href="${h.home}" data-host-home>${raw(icon("back"))}<span>${h.name}</span></a>` : "";
}

async function moreMenu(ctx) {
  const items = [
    ...(ctx.host?.home ? [[ctx.host.home, "back", ctx.host.name, `Back to ${ctx.host.name}`]] : []),
    ["#/talk", "chat", "Talk it through", "A gentle conversation that becomes an entry"],
    ["#/library", "library", "Library", "Documents, notes from others, imported conversations"],
    ["#/import", "upload", "Import", "Notion journal, calendar, pasted text"],
    ["#/settings", "settings", "Settings", "Sync, AI, voice, privacy, prompts, data"],
  ];
  await sheet({
    title: "More",
    body: html`<div class="stack-sm">${items.map(([href, ic, t, d]) => html`<a class="entry-card row" href="${href}" data-close>${raw(icon(ic))}<div class="grow"><div class="title">${t}</div><div class="small muted">${d}</div></div></a>`)}</div>`,
    setup: (d, close) => d.addEventListener("click", (e) => { if (e.target.closest("a")) close(); }),
  });
}
async function boot() {
  let ctx;
  try {
    ctx = await createContext({ host: await loadHost() });
  } catch (err) {
    $("#content").innerHTML = `<div class="empty"><h3>The journal couldn't open its storage</h3><p>${String(err.message || err)}</p></div>`;
    return;
  }
  window.__journal = ctx; // handy for debugging from the console
  applyTheme(ctx);
  if (ctx.host?.home) $(".sidebar .brand").insertAdjacentHTML("beforebegin", String(hostLink(ctx, "host-home")));
  fillIcons();
  ctx.store.on((c) => { if (c.op === "kv" && c.key === "settings") applyTheme(ctx); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(ctx));

  // Topbar shadow on scroll.
  const topbar = $("#topbar");
  addEventListener("scroll", () => topbar.classList.toggle("scrolled", scrollY > 4), { passive: true });

  ctx.sync.on(() => renderSyncPill(ctx));
  ctx.store.on(() => renderSyncPill(ctx));
  setInterval(() => renderSyncPill(ctx), 30_000);
  renderSyncPill(ctx);
  $("#sync-pill").addEventListener("click", () => {
    if (!ctx.sync.configured()) ctx.navigate("#/settings/sync");
    else ctx.sync.syncNow();
  });
  $("#more-btn").addEventListener("click", () => moreMenu(ctx));

  let current = null;
  let token = 0;
  let actionHandler = null;
  const content = $("#content");
  // Top-bar buttons belong to the active view: one delegated listener routes them.
  $("#topbar-actions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && actionHandler) actionHandler(e, b);
  });

  async function route() {
    const r = parseHash();
    const my = ++token;
    if (current?.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
    const cleanups = [];
    actionHandler = null;
    // Each view gets a fresh element, so its listeners die with it.
    const viewEl = document.createElement("div");
    viewEl.className = "view";
    const ui = {
      el: viewEl,
      route: r,
      setTitle(title, { back } = {}) {
        $("#topbar-title").textContent = title || "";
        document.title = title ? `${title} · Journal` : "Living Journal";
        const b = $("#topbar-back");
        // Detail pages have a back button and their own menu; hide the global one there.
        $("#more-btn").classList.toggle("hidden", !!back);
        // Top-level pages inside a host app get the way back to it instead.
        b.innerHTML = back ? `<a class="btn icon ghost back" href="${back}" aria-label="Back">${icon("back")}</a>` : String(hostLink(ctx, "btn ghost small host-home only-mobile"));
        if (back === "history") b.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); history.back(); });
      },
      setActions(markup) { $("#topbar-actions").innerHTML = markup ? String(markup) : ""; fillIcons($("#topbar-actions")); },
      onStore(fn) { const off = ctx.store.on(fn); cleanups.push(off); return off; },
      onAction(fn) { actionHandler = fn; },
      wide(on = true) { content.classList.toggle("wide", on); },
      cleanup(fn) { cleanups.push(fn); },
      alive: () => my === token,
    };
    ui.setActions("");
    ui.setTitle("");
    for (const a of $$("[data-tab]")) a.classList.toggle("active", a.dataset.tab === r.tab);
    content.classList.remove("wide");
    try {
      const mod = await import(`./views/${r.view}.js`);
      if (my !== token) return;
      content.innerHTML = "";
      content.appendChild(viewEl);
      window.scrollTo(0, 0);
      current = { cleanup: () => cleanups.forEach((f) => f()) };
      const ret = await mod.mount(viewEl, ctx, r, ui);
      if (typeof ret === "function") cleanups.push(ret);
      fillIcons(content);
    } catch (err) {
      console.error(err);
      content.innerHTML = `<div class="empty"><h3>Couldn't open this page</h3><p class="muted">${String(err.message || err).replace(/</g, "&lt;")}</p><p><a href="#/today">Back to Today</a></p></div>`;
    }
  }
  addEventListener("hashchange", route);
  await route();

  ctx.sync.start();
  if (ctx.volatile) toast("Private browsing or storage is blocked: entries won't be kept after you close this tab.", { timeout: 12000, error: true });
  else if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            toast("A new version of the journal is ready.", { action: "Reload", onAction: () => location.reload(), timeout: 0 });
          }
        });
      });
    }).catch((err) => console.warn("service worker not registered", err));
  }

  // Auto-lock sealed entries after inactivity.
  let lastActive = Date.now();
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
  setInterval(() => {
    const mins = ctx.settings().sealing?.autoLockMinutes || 15;
    if (!ctx.store.isLocked() && Date.now() - lastActive > mins * 60_000) { ctx.store.lock(); toast("Sealed entries locked."); }
  }, 30_000);
}

boot();
