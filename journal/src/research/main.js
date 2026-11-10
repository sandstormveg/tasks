// Research: boot, routes and capture. Anything shared from your phone (the Tasks
// app's share target), or sent by the bookmarklet on your computer, arrives as
// ?url=…&title=…&text=… — it's saved to the Deposit straight away (a link, or a
// thought if there's no link) and opened so you can add why. Views live in ./views and get the same `ui` object as the
// journal's: a title, top-bar actions, store listeners that die with the view.

import { createResearchContext } from "./context.js";
import { loadHost } from "../app/host.js";
import { icon } from "../ui/icons.js";
import { $, $$, toast } from "../ui/dom.js";
import { applyTheme, fillIcons, renderSyncPill, hostLink, registerServiceWorker } from "../ui/shell.js";
import { enableSwipe } from "../ui/swipe.js";
import { capture } from "./ui.js";
import { takeSharedImages } from "./images.js";

const TABS = ["inbox", "queue", "read", "writing", "boards", "videos"];
const ROUTES = [
  [/^inbox$/, "list", "inbox"],
  [/^queue$/, "list", "queue"],
  [/^read$/, "list", "read"],
  [/^search$/, "search", "search"],
  [/^writing$/, "writing", "writing"],
  [/^piece\/([^/]+)$/, "piece", "writing"],
  [/^boards$/, "boards", "boards"],
  [/^videos$/, "videos", "videos"],
  [/^board\/([^/]+)$/, "board", "boards"],
  [/^tag\/([^/]+)$/, "search", "search"],
  [/^source\/([^/]+)$/, "source", null],
  [/^settings$/, "settings", "settings"],
];

function parseHash() {
  const h = decodeURIComponent((location.hash || "#/inbox").replace(/^#\/?/, ""));
  const [path, query = ""] = h.split("?");
  const qs = Object.fromEntries(new URLSearchParams(query));
  for (const [re, view, tab] of ROUTES) {
    const m = re.exec(path);
    if (m) return { view, tab, params: m.slice(1), query: qs, path };
  }
  return { view: "list", tab: "inbox", params: [], query: qs, path: "inbox" };
}

/** A link shared or sent here: save it, tidy the address, open it. */
async function takeShared(ctx) {
  const q = new URLSearchParams(location.search);
  const stamp = q.get("share");
  if (!["url", "text", "title"].some((k) => q.get(k)) && !stamp) return null;
  const via = q.get("via") === "bookmarklet" ? "bookmarklet" : "share";
  history.replaceState(null, "", location.pathname + (location.hash || "#/inbox"));
  if (stamp) {
    // Pictures shared from another app: any words that came with them become the title.
    const words = [q.get("title"), q.get("text")].map((t) => String(t || "").trim()).filter(Boolean).join(" — ");
    const saved = await takeSharedImages(ctx, stamp, { title: words ? words.slice(0, 120) : undefined, url: q.get("url") || undefined });
    if (saved.length) { toast(`${saved.length === 1 ? "Picture" : `${saved.length} pictures`} saved to your Deposit`, { timeout: 5000 }); return saved[0]; }
    if (!["url", "text", "title"].some((k) => q.get(k))) { toast("The picture didn't come through — try sharing it again.", { error: true }); return null; }
  }
  const { source, existing } = await capture(ctx, { url: q.get("url") || "", text: q.get("text") || "", title: q.get("title") || "", via });
  if (!source) { toast("Nothing to save — the share was empty.", { error: true }); return null; }
  toast(existing ? "Already in your library" : source.kind === "thought" ? "Saved to your Deposit as a thought" : "Saved to your Deposit — add why, or a tag", { timeout: 5000 });
  return source;
}

async function boot() {
  let ctx;
  try {
    ctx = await createResearchContext({ host: await loadHost() });
  } catch (err) {
    $("#content").innerHTML = `<div class="empty"><h3>Research couldn't open its storage</h3><p>${String(err.message || err).replace(/</g, "&lt;")}</p></div>`;
    return;
  }
  window.__research = ctx; // handy for debugging from the console
  applyTheme(ctx);
  if (ctx.host?.home) $(".sidebar .brand").insertAdjacentHTML("beforebegin", String(hostLink(ctx, "host-home")));
  fillIcons();
  ctx.store.on((c) => { if (c.op === "kv" && c.key === "settings") applyTheme(ctx); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(ctx));
  const topbar = $("#topbar");
  addEventListener("scroll", () => topbar.classList.toggle("scrolled", scrollY > 4), { passive: true });

  ctx.sync.on(() => renderSyncPill(ctx));
  ctx.store.on(() => renderSyncPill(ctx));
  setInterval(() => renderSyncPill(ctx), 30_000);
  renderSyncPill(ctx);
  $("#sync-pill").addEventListener("click", () => {
    if (!ctx.sync.configured() || ctx.sync.status.state === "error") ctx.navigate("#/settings");
    else ctx.sync.syncNow();
  });

  let current = null;
  let token = 0;
  let actionHandler = null;
  let routesSeen = 0;
  let enterFrom = null;
  const content = $("#content");
  $("#topbar-actions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && actionHandler) actionHandler(e, b);
  });
  enableSwipe({
    content,
    neighbours: () => {
      const i = TABS.indexOf(parseHash().path);
      return i < 0 ? {} : { prev: i > 0 ? `#/${TABS[i - 1]}` : null, next: i < TABS.length - 1 ? `#/${TABS[i + 1]}` : null };
    },
    go: (target, dir) => { enterFrom = dir === "next" ? "right" : "left"; location.hash = target; },
  });

  async function route() {
    routesSeen++;
    const r = parseHash();
    const my = ++token;
    if (current?.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
    const cleanups = [];
    actionHandler = null;
    const viewEl = document.createElement("div");
    viewEl.className = "view";
    const ui = {
      el: viewEl,
      route: r,
      setTitle(title, { back } = {}) {
        $("#topbar-title").textContent = title || "";
        document.title = title ? `${title} · Research` : "Research";
        const b = $("#topbar-back");
        b.innerHTML = back ? `<a class="btn icon ghost back" href="${back}" aria-label="Back">${icon("back")}</a>` : String(hostLink(ctx, "btn ghost small host-home only-mobile"));
        if (back === "history") b.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); if (routesSeen > 1) history.back(); else ctx.navigate("#/inbox"); });
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
      if (enterFrom) {
        const cls = `enter-${enterFrom}`;
        viewEl.classList.add(cls);
        viewEl.addEventListener("animationend", () => viewEl.classList.remove(cls), { once: true });
        enterFrom = null;
      }
      content.appendChild(viewEl);
      window.scrollTo(0, 0);
      current = { cleanup: () => cleanups.forEach((f) => f()) };
      const ret = await mod.mount(viewEl, ctx, r, ui);
      if (typeof ret === "function") cleanups.push(ret);
      fillIcons(content);
    } catch (err) {
      console.error(err);
      content.innerHTML = `<div class="empty"><h3>Couldn't open this page</h3><p class="muted">${String(err.message || err).replace(/</g, "&lt;")}</p><p><a href="#/inbox">Back to the Deposit</a></p></div>`;
    }
  }
  addEventListener("hashchange", route);
  const shared = await takeShared(ctx);
  if (shared) history.replaceState(null, "", `#/source/${shared.id}`);
  await route();

  ctx.sync.start();
  if (ctx.volatile) toast("Private browsing or storage is blocked: nothing will be kept after you close this tab.", { timeout: 12000, error: true });
  else if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  registerServiceWorker("Research");
}

boot();
