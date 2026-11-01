// The three reading lists. Inbox: everything you've just saved, newest first,
// one tap to sort each. To read: what you're reading now, then the queue,
// oldest first. Read: what you've finished, newest first — with ⭐ favourites,
// dropped ones and your tags as filters.

import { html, raw, on } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tagCounts } from "../../core/sources.js";
import { sourceCard, moveSource, addSheet } from "../ui.js";

const TITLES = { inbox: "Inbox", queue: "To read", read: "Read" };
const by = (k, dir = -1) => (a, b) => dir * String(a[k] || a.added || "").localeCompare(String(b[k] || b.added || ""));

export async function mount(el, ctx, route, ui) {
  const mode = route.tab;
  ui.setTitle(TITLES[mode]);
  ui.setActions(html`<button class="btn small primary" data-act="add">${raw(icon("plus"))}Add</button>`);
  ui.onAction((e, b) => { if (b.dataset.act === "add") addSheet(ctx, { status: mode === "read" ? "read" : mode === "queue" ? "to-read" : "inbox" }); });
  let filter = route.query.filter || "all"; // read: all | fav | dropped | #tag

  function render() {
    const all = ctx.sources();
    let body;
    if (mode === "inbox") {
      const list = all.filter((s) => s.status === "inbox").sort(by("added"));
      body = list.length ? html`<p class="small muted list-hint">Sort each one: to read, already read, or drop it.</p>${list.map((s) => sourceCard(s))}`
        : empty("Nothing waiting", html`Share a link from any app to <b>Tasks</b> to save it here, or tap <b>Add</b>. On your computer, use the bookmark button in <a href="#/settings">Settings</a>.`);
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
    el.innerHTML = String(body);
  }
  const empty = (title, text) => html`<div class="empty">${raw(icon(mode === "inbox" ? "inbox" : mode === "queue" ? "bookmark" : "check"))}<h3>${title}</h3><p>${text}</p></div>`;

  render();
  ui.onStore(() => render());
  on(el, "click", "[data-act=move]", async (e, b) => { e.preventDefault(); await moveSource(ctx, b.dataset.id, b.dataset.to); });
  on(el, "click", "[data-filter]", (e, b) => { filter = b.dataset.filter; render(); });
}
