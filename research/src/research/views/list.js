// The reading lists. The Deposit: anything you've dropped in — links, quotes,
// thoughts — newest first, each with where it might belong (a board or a piece
// of writing); file it there, or sort it into your reading. To read: what you're reading now, then the queue,
// oldest first. Read: what you've finished, newest first — with ⭐ favourites,
// dropped ones and your tags as filters.

import { html, raw, on } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tagCounts } from "../../core/sources.js";
import { sourceCard, moveSource, addSheet, homesFor, fileTo, fileElsewhere } from "../ui.js";
import { mountDonut } from "../donut.js";
import { libraryState, marginaliaLines, seedOf } from "../../core/companions.js";
import { mountCompanion } from "../../ui/companion.js";

const TITLES = { inbox: "Deposit", queue: "To read", read: "Read" };
const by = (k, dir = -1) => (a, b) => dir * String(a[k] || a.added || "").localeCompare(String(b[k] || b.added || ""));

export async function mount(el, ctx, route, ui) {
  const mode = route.tab;
  ui.setTitle(TITLES[mode]);
  // The Deposit has the donut for adding; the other lists keep the Add button.
  ui.setActions(mode === "inbox" ? "" : html`<button class="btn small primary" data-act="add">${raw(icon("plus"))}Add</button>`);
  ui.onAction((e, b) => { if (b.dataset.act === "add") addSheet(ctx, { status: mode === "read" ? "read" : mode === "queue" ? "to-read" : "inbox" }); });
  let filter = route.query.filter || "all"; // read: all | fav | dropped | #tag
  // The Deposit opens on the everything donut; the list redraws beneath it without touching what you're typing.
  let listEl = el;
  if (mode === "inbox") {
    el.innerHTML = '<div data-companion-box></div><div data-donut-dock></div><div data-list></div>';
    mountDonut(el.querySelector("[data-donut-dock]"), ctx);
    listEl = el.querySelector("[data-list]");
  }

  // Marginalia, at the Deposit's door: the library's state from templates (no AI), redrawn only when it changes.
  let said = "";
  const companion = () => {
    const box = el.querySelector("[data-companion-box]");
    if (!box) return;
    const now = ctx.now();
    const lines = marginaliaLines(libraryState([...ctx.sources(), ...ctx.store.all("board"), ...ctx.store.all("string")], { now }),
      { chattiness: ctx.settings().companion?.chattiness, seed: seedOf(now.slice(0, 10)) });
    const key = JSON.stringify([lines, ctx.settings().companion || {}]);
    if (key === said) return;
    said = key;
    mountCompanion(box, ctx, "marginalia", lines, { day: now.slice(0, 10), cleanup: ui.cleanup });
  };

  function render() {
    if (mode === "inbox") companion();
    const all = ctx.sources();
    let body;
    if (mode === "inbox") {
      const list = all.filter((s) => s.status === "inbox").sort(by("added"));
      const anyHome = ctx.boards().length + ctx.pieces().length > 0;
      const homes = (s) => {
        const h = homesFor(ctx, s);
        if (!h.length && !anyHome) return "";
        return html`<div class="src-homes">${h.length ? html`<span class="faint">Could go:</span>` : ""}${h.map((x) => html`<button class="chip home" data-home="${x.id}" data-src="${s.id}" title="Shares: ${x.shared.join(", ")}">${raw(icon(x.kind === "board" ? "map" : "edit"))}${x.title}</button>`)}<button class="chip ghost" data-elsewhere="${s.id}">${h.length ? "Elsewhere…" : "File to…"}</button></div>`;
      };
      body = list.length ? html`<p class="small muted list-hint">Each shows where it might belong — file it there and it's pinned next to what it shares the most with, tied by red string. Or sort it into your reading.</p>${list.map((s) => sourceCard(s, { extra: homes(s) }))}`
        : html`<p class="small muted list-hint">Empty for now. Feed the donut, or share anything to <b>Tasks</b> from any app. On your computer, the bookmark button in <a href="#/settings">Settings</a> sends pages here.</p>`;
    } else if (mode === "queue") {
      const reading = all.filter((s) => s.status === "reading").sort(by("started"));
      const next = all.filter((s) => s.status === "to-read").sort(by("added", 1));
      body = reading.length || next.length
        ? html`${reading.length ? html`<div class="section-title">Reading now</div>${reading.map((s) => sourceCard(s))}` : ""}
          ${next.length ? html`<div class="section-title">Up next <span class="faint">· oldest first</span></div>${next.map((s) => sourceCard(s))}` : ""}`
        : empty("Nothing queued", "Move things here from your Inbox when you mean to read them.");
    } else {
      const tags = tagCounts(all.filter((s) => s.status === "read")).slice(0, 12);
      let list = all.filter((s) => (filter === "dropped" ? s.status === "dropped" : s.status === "read"));
      if (filter === "fav") list = list.filter((s) => s.favourite);
      if (filter.startsWith("#")) list = list.filter((s) => (s.tags || []).includes(filter.slice(1)));
      list.sort(by("finished"));
      const chip = (f, label) => html`<button class="chip ${filter === f ? "on" : ""}" data-filter="${f}">${label}</button>`;
      body = html`<div class="chips scroll" style="margin:4px -16px 10px">
          ${chip("all", "All")}${chip("fav", html`${raw(icon("star"))}Favourites`)}${tags.map(([t, n]) => chip(`#${t}`, `#${t} · ${n}`))}${chip("dropped", "Dropped")}</div>
        ${list.length ? list.map((s) => sourceCard(s)) : empty(filter === "fav" ? "No favourites yet" : "Nothing here yet", filter === "fav" ? "Tap ☆ on something you've read that earned it." : "Finished things land here.")}`;
    }
    listEl.innerHTML = String(body);
    ctx.media.hydrate(listEl);
  }
  const empty = (title, text) => html`<div class="empty">${raw(icon(mode === "inbox" ? "inbox" : mode === "queue" ? "bookmark" : "check"))}<h3>${title}</h3><p>${text}</p></div>`;

  render();
  ui.onStore(() => render());
  on(listEl, "click", "[data-act=move]", async (e, b) => { e.preventDefault(); await moveSource(ctx, b.dataset.id, b.dataset.to); });
  on(el, "click", "[data-filter]", (e, b) => { filter = b.dataset.filter; render(); });
  on(el, "click", "[data-home]", async (e, b) => {
    const s = ctx.store.get(b.dataset.src);
    const home = homesFor(ctx, s).find((h) => h.id === b.dataset.home);
    if (home) await fileTo(ctx, s.id, home);
  });
  on(el, "click", "[data-elsewhere]", (e, b) => fileElsewhere(ctx, b.dataset.elsewhere));
}
