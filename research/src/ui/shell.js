// Pieces of the app shell shared by the Journal (src/main.js) and Research
// (src/research/main.js): theme, icons, the sync pill, the way back to a host
// app, and the service worker.

import { icon } from "./icons.js";
import { $, $$, html, raw, toast, agoLabel } from "./dom.js";

export function applyTheme(ctx) {
  const s = ctx.settings();
  const root = document.documentElement;
  // data-app-theme, not data-theme: a host page may own data-theme (light/dark) for itself.
  if (s.theme && s.theme !== "auto") root.dataset.appTheme = s.theme; else delete root.dataset.appTheme;
  root.style.setProperty("--text-scale", String(s.textScale || 1));
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute("content", bg);
}

export function fillIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.dataset.iconDone) continue;
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    el.dataset.iconDone = "1";
  }
}

export function renderSyncPill(ctx) {
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

/** "‹ Tasks" when the app lives inside a host app: the way back to the rest of it. */
export function hostLink(ctx, cls) {
  const h = ctx.host;
  return h?.home ? html`<a class="${cls}" href="${h.home}" data-host-home>${raw(icon("back"))}<span>${h.name}</span></a>` : "";
}

/** Offline copy and updates. Only an update replaces a working copy: the first install
 *  (perhaps started by the host app, while the host's own worker controls this page)
 *  is not "a new version". */
export function registerServiceWorker(appName) {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && reg.active && reg.active !== w) {
          toast(`A new version of ${appName} is ready.`, { action: "Reload", onAction: () => location.reload(), timeout: 0 });
        }
      });
    });
  }).catch((err) => console.warn("service worker not registered", err));
}
