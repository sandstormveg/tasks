// Adventurer: boot, routes and the shell. Five tabs — the quest Board, Train
// (grades and the trainer), Stats, the 🗓️ Log of turned-in quests, and
// Settings — each a module in ./views with mount(el, ctx, route, ui). The ui
// object's listeners die with the view.

import { createContext, loadHost } from "./app.js";
import { $, $$, html, toast } from "./ui/dom.js";

const VIEWS = {
  board: () => import("./views/board.js"),
  train: () => import("./views/train.js"),
  stats: () => import("./views/stats.js"),
  log: () => import("./views/log.js"),
  settings: () => import("./views/settings.js"),
};

function route() {
  const [name, ...params] = (location.hash || "#/board").replace(/^#\/?/, "").split("/");
  return VIEWS[name] ? { name, params } : { name: "board", params: [] };
}

function renderSync(ctx) {
  const pill = $("#sync-pill");
  const s = ctx.store.status;
  const pending = ctx.store.pending();
  let label = "Synced", cls = "";
  if (!ctx.token().token) { label = "On this device"; }
  else if (ctx.syncing) label = "Syncing…";
  else if (s.error) { label = "Sync problem"; cls = "error"; }
  else if (!navigator.onLine) { label = pending ? `Offline · ${pending}` : "Offline"; cls = pending ? "pending" : ""; }
  else if (pending) { label = `${pending} to sync`; cls = "pending"; }
  pill.className = `sync-pill ${cls}`;
  pill.textContent = label;
  pill.title = s.error || (s.lastSync ? `Last sync ${new Date(s.lastSync).toLocaleString()}` : label);
}

async function boot() {
  const host = await loadHost();
  const ctx = createContext(host);
  window.__adventurer = ctx;
  if (host?.home) $("#host-home").innerHTML = String(html`<a class="host-home" href="${host.home}">‹ ${host.name}</a>${(host.apps || []).map((a) => html`<a class="host-home host-app" href="${a.href}">${a.name}</a>`)}`);

  ctx.store.on(() => renderSync(ctx));
  renderSync(ctx);
  $("#sync-pill").addEventListener("click", () => (ctx.token().token ? ctx.syncNow() : (location.hash = "#/settings")));

  let cleanup = [];
  let seq = 0;
  async function show() {
    const r = route();
    const mine = ++seq;
    for (const fn of cleanup) try { fn(); } catch {}
    cleanup = [];
    for (const a of $$("[data-tab]")) a.classList.toggle("active", a.dataset.tab === r.name);
    const ui = {
      onStore(fn) { cleanup.push(ctx.store.on(fn)); },
      cleanup(fn) { cleanup.push(fn); },
    };
    const mod = await VIEWS[r.name]();
    if (mine !== seq) return;
    // A fresh element per view: reusing one piled up each visit's click handlers, so a
    // quest tapped after a few tab switches opened several stacked pop-ups (Close took two taps).
    const old = $("#content"), el = old.cloneNode(false);
    old.replaceWith(el);
    if (swipeIn) { el.classList.add(swipeIn); swipeIn = ""; }
    try { await mod.mount(el, ctx, r, ui); } catch (err) {
      console.error(err);
      el.innerHTML = String(html`<div class="empty"><h3>That view broke</h3><p>${err.message}</p></div>`);
    }
  }
  addEventListener("hashchange", show);
  swipeTabs();
  await show();

  if (ctx.settings().autoSync) {
    ctx.syncNow();
    setInterval(() => ctx.store.pending() && ctx.syncNow(), 60_000);
    addEventListener("online", () => ctx.syncNow());
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && ctx.syncNow());
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").then((reg) => reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && reg.active && reg.active !== w) toast("A new version of Adventurer is ready.", { action: "Reload", onAction: () => location.reload(), timeout: 0 });
      });
    })).catch(() => {});
  }
}

// Swipe left or right on a view to go to the next or previous tab. Ignores sheets, maps,
// sliders and anything that scrolls sideways, and gestures that are mostly vertical.
let swipeIn = "";
function swipeTabs() {
  let x0 = null, y0 = 0, t0 = 0;
  const order = () => $("[data-tab]").map((a) => a.dataset.tab);
  addEventListener("touchstart", (e) => {
    const t = e.touches[0], el = e.target;
    x0 = e.touches.length === 1 && el.closest("#content") && !el.closest("input, textarea, select, canvas, .questmap, .leaflet-container, .sheet, [data-noswipe]") && !scrollsSideways(el) ? t.clientX : null;
    y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (x0 == null || document.querySelector("dialog[open]")) return (x0 = null);
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - t0 > 600) return;
    const tabs = order(), i = tabs.indexOf(route().name), j = i + (dx < 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= tabs.length) return;
    swipeIn = dx < 0 ? "swipe-in-right" : "swipe-in-left";
    location.hash = `#/${tabs[j]}`;
  }, { passive: true });
}
const scrollsSideways = (el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  return false;
};

boot();
