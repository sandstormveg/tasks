// Full-screen photo viewer: swipe/arrow through photos, see the caption and
// the entry each belongs to, or delete a photo (with an Undo).

import { escapeHtml, plainExcerpt } from "../core/markdown.js";
import { formatDay } from "../core/dates.js";
import { icon } from "./icons.js";

export function openLightbox(ctx, photos, start = 0) {
  if (!photos.length) return;
  let i = Math.max(0, start);
  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Photo");
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  async function show() {
    const m = photos[i];
    const e = m.entry;
    el.innerHTML = `
      <div class="lb-top"><button class="btn icon" data-x aria-label="Close">${icon("close")}</button><span class="grow"></span>
        <span class="small">${i + 1} / ${photos.length}</span><span class="grow"></span>
        <button class="btn icon" data-prev aria-label="Previous" ${i === 0 ? "disabled" : ""}>${icon("back")}</button>
        <button class="btn icon" data-next aria-label="Next" ${i === photos.length - 1 ? "disabled" : ""}>${icon("chevron")}</button>
        ${e ? `<button class="btn icon" data-del aria-label="Delete this photo" title="Delete this photo">${icon("trash")}</button>` : ""}</div>
      <div class="lb-img"><img alt="${escapeHtml(m.caption || "")}"><p class="lb-missing hidden">This photo can't be shown — it was never fully saved. The original is still on your phone; you can delete this one.</p></div>
      <div class="lb-cap">${m.caption ? `<div class="c">${escapeHtml(m.caption)}</div>` : ""}
        ${e ? `<div class="m">${escapeHtml(formatDay(e.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${e.body ? ` · ${escapeHtml(plainExcerpt(e.body, 120))}` : ""} · <a href="#/entry/${encodeURIComponent(e.id)}" data-go>Open entry</a></div>` : ""}</div>`;
    const img = el.querySelector("img");
    const cant = () => { img.classList.add("hidden"); el.querySelector(".lb-missing").classList.remove("hidden"); };
    img.addEventListener("error", () => { if (photos[i] === m) cant(); });
    const thumb = await ctx.media.url(m.thumb);
    if (thumb) img.src = thumb;
    const full = await ctx.media.url(m.path);
    if (!thumb && !full && photos[i] === m) cant();
    if (full && photos[i] === m) img.src = full;
  }
  const close = () => {
    el.remove();
    document.body.style.overflow = "";
    removeEventListener("keydown", key);
    removeEventListener("hashchange", close);
  };
  const go = (d) => { const n = i + d; if (n >= 0 && n < photos.length) { i = n; show(); } };
  const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
  addEventListener("keydown", key);
  addEventListener("hashchange", close);
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-del]")) {
      const m = photos[i];
      const { deletePhotosWithUndo } = await import("../app/actions.js");
      await deletePhotosWithUndo(ctx, [{ entryId: m.entry.id, mediaId: m.id }]);
      photos.splice(i, 1);
      if (!photos.length) return close();
      i = Math.min(i, photos.length - 1);
      return show();
    }
    if (e.target.closest("[data-x]")) close();
    else if (e.target.closest("[data-prev]")) go(-1);
    else if (e.target.closest("[data-next]")) go(1);
  });
  let x0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    x0 = null;
  });
  show();
}
