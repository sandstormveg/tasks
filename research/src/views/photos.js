// Photos: revisit experiences through images. Grouped by month; tap to see a
// photo with its caption and the entry it belongs to. "Select" deletes several
// at once; photos that can't be shown (never fully saved) are marked, and
// "Can't load" gathers them so they can be cleared in one go.

import { html, raw, on, debounce } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { formatMonth, monthKey, compareDays } from "../core/dates.js";
import { photoDaysButton, addPhotosForDays } from "../ui/photo-days.js";
import { deletePhotosWithUndo } from "../app/actions.js";

const PAGE = 120;
const keyOf = (p) => `${p.entry.id}|${p.id}`;

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Photos");
  let chapterId = route.query.chapter || "";
  let uncaptioned = false;
  let brokenOnly = false;
  let selecting = false;
  const selected = new Set();
  let limit = PAGE;

  const isBroken = (p) => ctx.media.failed.has(p.thumb || p.path) || ctx.media.failed.has(p.path);

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

  function setActions() {
    ui.setActions(selecting
      ? html`<button class="btn small ghost" data-act="sel-done">Done</button>`
      : html`<button class="btn small ghost" data-act="select">Select</button>`);
  }
  ui.onAction((e, b) => {
    if (b.dataset.act === "select") { selecting = true; selected.clear(); setActions(); render(); }
    if (b.dataset.act === "sel-done") { selecting = false; selected.clear(); setActions(); render(); }
  });

  function render() {
    const all = collect();
    const brokenCount = all.filter(isBroken).length;
    if (brokenOnly && !brokenCount) brokenOnly = false;
    const photos = brokenOnly ? all.filter(isBroken) : all;
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
      ${selecting ? "" : html`<div class="row wrap" style="margin:4px 0 2px; gap:6px 10px"><span class="small muted" style="flex:1 1 220px">Catching up? Pick photos from several days and each lands on the day it was taken.</span>${photoDaysButton()}</div>`}
      <div class="chips scroll" style="margin:6px -16px 8px">
        <button class="chip ${!chapterId && !brokenOnly ? "on" : ""}" data-act="ch" data-id="">All</button>
        ${chapters.map((c) => html`<button class="chip ${c.id === chapterId ? "on" : ""}" data-act="ch" data-id="${c.id}">${c.name}</button>`)}
        <button class="chip ${uncaptioned ? "on" : ""}" data-act="uncap">Needs a caption</button>
        <span data-broken-chip>${brokenChip(brokenCount)}</span>
      </div>
      ${brokenOnly ? html`<div class="notice warn" style="margin-bottom:10px">${raw(icon("warn"))}<div class="grow small">These photos were never fully saved, so they can't be shown — the originals are still on your phone. Delete them here, and add them again with <b>Sort photos into days</b> if you like.</div></div>
        <div class="btn-row" style="margin-bottom:10px"><button class="btn danger" data-act="del-broken">${raw(icon("trash"))}Delete all ${brokenCount}</button></div>` : ""}
      ${!photos.length ? html`<div class="empty">${raw(icon("photos"))}<h3>No photos yet</h3><p>Add photos from Today — a photo and one sentence is a perfectly good entry.</p></div>` : ""}
      ${groups.map((g) => html`<div class="month-head"><span>${formatMonth(g.m)}</span><span class="faint">${g.items.length}</span></div>
        <div class="photo-grid ${selecting ? "selecting" : ""}">${g.items.map((p) => html`<button data-act="${selecting ? "pick" : "open"}" data-i="${idx++}" data-key="${keyOf(p)}" class="${selected.has(keyOf(p)) ? "selected" : ""}" aria-label="${p.caption || "Photo"}" aria-pressed="${selecting ? String(selected.has(keyOf(p))) : "false"}">
          <img alt="" data-media="${p.thumb || p.path}" data-fallback="${p.path}">
          ${p.caption ? html`<span class="cap-dot" title="Has a caption"></span>` : ""}
          ${selecting ? html`<span class="pick-mark">${raw(icon("check"))}</span>` : ""}</button>`)}</div>`)}
      ${photos.length > limit ? html`<div class="center" style="margin:16px 0"><button class="btn" data-act="more">Show more</button></div>` : ""}
      ${selecting ? html`<div class="select-bar"><span class="grow small" data-sel-count>${selectedLabel()}</span>
        <button class="btn small" data-act="sel-all">Select all</button>
        <button class="btn small danger" data-act="sel-delete" ${selected.size ? "" : "disabled"}>${raw(icon("trash"))}Delete</button></div>` : ""}
    `);
    el._photos = shown;
    ctx.media.hydrate(el);
  }
  const brokenChip = (n) => (n ? html`<button class="chip warn-chip ${brokenOnly ? "on" : ""}" data-act="broken">${raw(icon("warn"))}Can't load · ${n}</button>` : "");
  const selectedLabel = () => (selected.size ? `${selected.size} selected` : "Tap photos to select them");

  // As photos fail to show, keep the "Can't load" count up to date without re-rendering the grid.
  const refreshChip = debounce(() => {
    const box = el.querySelector("[data-broken-chip]");
    if (box) box.innerHTML = String(brokenChip(collect().filter(isBroken).length));
  }, 200);
  el.addEventListener("media-missing", refreshChip);

  setActions();
  render();
  ui.onStore(() => render());

  const refs = (photos) => photos.map((p) => ({ entryId: p.entry.id, mediaId: p.id }));
  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    if (act === "ch") { chapterId = b.dataset.id; brokenOnly = false; limit = PAGE; return render(); }
    if (act === "uncap") { uncaptioned = !uncaptioned; return render(); }
    if (act === "broken") { brokenOnly = !brokenOnly; limit = PAGE; return render(); }
    if (act === "more") { limit += PAGE; return render(); }
    if (act === "photo-days") return addPhotosForDays(ctx); // straight away: the file picker needs the tap
    if (act === "del-broken") {
      await deletePhotosWithUndo(ctx, refs(collect().filter(isBroken)));
      brokenOnly = false;
      return render();
    }
    if (act === "pick") {
      const k = b.dataset.key;
      if (selected.has(k)) selected.delete(k); else selected.add(k);
      b.classList.toggle("selected", selected.has(k));
      b.setAttribute("aria-pressed", String(selected.has(k)));
      el.querySelector("[data-sel-count]").textContent = selectedLabel();
      el.querySelector('[data-act="sel-delete"]').toggleAttribute("disabled", !selected.size);
      return;
    }
    if (act === "sel-all") {
      for (const p of el._photos) selected.add(keyOf(p));
      return render();
    }
    if (act === "sel-delete") {
      const chosen = collect().filter((p) => selected.has(keyOf(p)));
      selecting = false;
      selected.clear();
      setActions();
      await deletePhotosWithUndo(ctx, refs(chosen));
      return render();
    }
    if (act === "open") {
      const { openLightbox } = await import("../ui/lightbox.js");
      openLightbox(ctx, el._photos, Number(b.dataset.i));
    }
  });
}
