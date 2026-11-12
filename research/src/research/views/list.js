// The reading lists. The Deposit: anything you've dropped in — links, quotes,
// thoughts — newest first, each with where it might belong (a board or a piece
// of writing); file it there, or sort it into your reading. The Library is your
// reading in one place (it was two tabs, To read and Read): Unread shows what
// you're reading now, then the queue, oldest first; Read shows what you've
// finished, newest first; All shows both. ⭐ favourites, your tags and dropped
// ones are filters too. The old #/queue and #/read addresses open it filtered.

import { html, raw, on } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tagCounts } from "../../core/sources.js";
import { sourceCard, moveSource, addSheet, homesFor, fileTo, fileElsewhere } from "../ui.js";
import { mountDonut } from "../donut.js";
import { libraryState, marginaliaLines, seedOf } from "../../core/companions.js";
import { mountCompanion } from "../../ui/companion.js";

const TITLES = { inbox: "Deposit", library: "Library" };
const OLD = { queue: "unread", read: "read" }; // the two tabs the Library replaced
const by = (k, dir = -1) => (a, b) => dir * String(a[k] || a.added || "").localeCompare(String(b[k] || b.added || ""));

export async function mount(el, ctx, route, ui) {
  const mode = route.tab === "inbox" ? "inbox" : "library";
  ui.setTitle(TITLES[mode]);
  // The Deposit has the donut for adding; the other lists keep the Add button.
  ui.setActions(mode === "inbox" ? "" : html`<button class="btn small primary" data-act="add">${raw(icon("plus"))}Add</button>`);
  let filter = route.query.filter || OLD[route.path] || "unread"; // library: unread | read | all | fav | dropped | #tag
  ui.onAction((e, b) => { if (b.dataset.act === "add") addSheet(ctx, { status: mode === "inbox" ? "inbox" : filter === "read" ? "read" : "to-read" }); });
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
    } else {
      const reading = all.filter((s) => s.status === "reading").sort(by("started"));
      const next = all.filter((s) => s.status === "to-read").sort(by("added", 1));
      const read = all.filter((s) => s.status === "read").sort(by("finished"));
      const tags = tagCounts(all.filter((s) => ["to-read", "reading", "read"].includes(s.status))).slice(0, 12);
      const chip = (f, label, n) => html`<button class="chip ${filter === f ? "on" : ""}" data-filter="${f}" aria-pressed="${filter === f}">${label}${n != null ? html` <span class="faint">${n}</span>` : ""}</button>`;
      const chips = html`<div class="chips scroll lib-filters" style="margin:4px -16px 10px">
        ${chip("unread", "Unread", reading.length + next.length)}${chip("read", "Read", read.length)}${chip("all", "All")}
        ${chip("fav", html`${raw(icon("star"))}Favourites`)}${tags.map(([t, n]) => chip(`#${t}`, `#${t}`, n))}${chip("dropped", "Dropped")}</div>`;
      const unread = reading.length || next.length
        ? html`${reading.length ? html`<div class="section-title">Reading now</div>${reading.map((s) => sourceCard(s))}` : ""}
          ${next.length ? html`<div class="section-title">Up next <span class="faint">· oldest first</span></div>${next.map((s) => sourceCard(s))}` : ""}`
        : "";
      const readList = read.length ? html`<div class="section-title">Read <span class="faint">· newest first</span></div>${read.map((s) => sourceCard(s))}` : "";
      let content;
      if (filter === "unread") content = unread || empty("Nothing to read", "Move things here from your Deposit when you mean to read them.", "bookmark");
      else if (filter === "read") content = readList || empty("Nothing read yet", "Finished things land here.", "check");
      else if (filter === "all") content = unread || readList ? html`${unread}${readList}` : empty("Your library is empty", "Sort things here from your Deposit.", "library");
      else {
        const pool = all.filter((s) => (filter === "dropped" ? s.status === "dropped" : ["to-read", "reading", "read"].includes(s.status)));
        let list = filter === "fav" ? pool.filter((s) => s.favourite) : filter.startsWith("#") ? pool.filter((s) => (s.tags || []).includes(filter.slice(1))) : pool;
        list = list.sort(by("finished"));
        content = list.length ? list.map((s) => sourceCard(s)) : empty(filter === "fav" ? "No favourites yet" : "Nothing here", filter === "fav" ? "Tap ☆ on something that earned it." : "Nothing matches this filter.", filter === "fav" ? "star" : "check");
      }
      body = html`${chips}${content}`;
    }
    listEl.innerHTML = String(body);
    ctx.media.hydrate(listEl);
  }
  const empty = (title, text, ic = "inbox") => html`<div class="empty">${raw(icon(ic))}<h3>${title}</h3><p>${text}</p></div>`;

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
