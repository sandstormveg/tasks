// Photos: revisit experiences through images. Grouped by month; tap to see a
// photo with its caption and the entry it belongs to.

import { html, raw, on } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { formatMonth, monthKey, compareDays } from "../core/dates.js";
import { photoDaysButton, addPhotosForDays } from "../ui/photo-days.js";

const PAGE = 120;

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Photos");
  let chapterId = route.query.chapter || "";
  let uncaptioned = false;
  let limit = PAGE;

  function collect() {
    const chapter = ctx.chapters().find((c) => c.id === chapterId);
    const out = [];
    for (const e of ctx.store.all("entry")) {
      if (e.sealed && e.body == null) continue;
      if (chapter && (compareDays(e.day, chapter.from) < 0 || compareDays(e.day, chapter.to) > 0)) continue;
      for (const m of e.media || []) {
        if (m.type !== "photo" || m.role === "original") continue; // a document's original isn't a memory photo
        if (uncaptioned && m.caption) continue;
        out.push({ ...m, entry: e, sort: m.taken || e.created });
      }
    }
    return out.sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
  }

  function render() {
    const photos = collect();
    const chapters = ctx.chapters();
    const shown = photos.slice(0, limit);
    const groups = [];
    for (const p of shown) {
      const m = monthKey(p.entry.day);
      if (!groups.length || groups[groups.length - 1].m !== m) groups.push({ m, items: [] });
      groups[groups.length - 1].items.push(p);
    }
    let idx = 0;
    el.innerHTML = String(html`
      <div class="row wrap" style="margin:4px 0 2px; gap:6px 10px"><span class="small muted" style="flex:1 1 220px">Catching up? Add the first photo you took on each day.</span>${photoDaysButton()}</div>
      <div class="chips scroll" style="margin:6px -16px 8px">
        <button class="chip ${!chapterId ? "on" : ""}" data-act="ch" data-id="">All</button>
        ${chapters.map((c) => html`<button class="chip ${c.id === chapterId ? "on" : ""}" data-act="ch" data-id="${c.id}">${c.name}</button>`)}
        <button class="chip ${uncaptioned ? "on" : ""}" data-act="uncap">Needs a caption</button>
      </div>
      ${!photos.length ? html`<div class="empty">${raw(icon("photos"))}<h3>No photos yet</h3><p>Add photos from Today — a photo and one sentence is a perfectly good entry.</p></div>` : ""}
      ${groups.map((g) => html`<div class="month-head"><span>${formatMonth(g.m)}</span><span class="faint">${g.items.length}</span></div>
        <div class="photo-grid">${g.items.map((p) => html`<button data-act="open" data-i="${idx++}" aria-label="${p.caption || "Photo"}"><img alt="" data-media="${p.thumb || p.path}" data-fallback="${p.path}">${p.caption ? html`<span class="cap-dot" title="Has a caption"></span>` : ""}</button>`)}</div>`)}
      ${photos.length > limit ? html`<div class="center" style="margin:16px 0"><button class="btn" data-act="more">Show more</button></div>` : ""}
    `);
    el._photos = shown;
    ctx.media.hydrate(el);
  }
  render();
  ui.onStore(() => render());
  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    if (act === "ch") { chapterId = b.dataset.id; limit = PAGE; return render(); }
    if (act === "uncap") { uncaptioned = !uncaptioned; return render(); }
    if (act === "more") { limit += PAGE; return render(); }
    if (act === "photo-days") return addPhotosForDays(ctx); // straight away: the file picker needs the tap
    if (act === "open") {
      const { openLightbox } = await import("../ui/lightbox.js");
      openLightbox(ctx, el._photos, Number(b.dataset.i));
    }
  });
}
