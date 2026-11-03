// Adventurer: boot, routes and the shell. Four tabs — the quest Board, Stats,
// the 🗓️ Log of turned-in quests, and Settings — each a module in ./views with
// mount(el, ctx, route, ui). The ui object's listeners die with the view.

import { createContext, loadHost } from "./app.js";
import { $, $$, html, toast } from "./ui/dom.js";

const VIEWS = {
  board: () => import("./views/board.js"),
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
  if (host?.home) $("#host-home").innerHTML = String(html`<a class="host-home" href="${host.home}">‹ ${host.name}</a>`);

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
    const el = $("#content");
    el.innerHTML = "";
    try { await mod.mount(el, ctx, r, ui); } catch (err) {
      console.error(err);
      el.innerHTML = String(html`<div class="empty"><h3>That view broke</h3><p>${err.message}</p></div>`);
    }
  }
  addEventListener("hashchange", show);
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

boot();
