// "Sort photos into days": pick a batch of photos (say two weeks of your camera
// roll) and each lands on the day it was taken, in order, after a preview — or
// just the first photo of each day, for a lighter journal. Until you confirm,
// photos are only read for their dates and the small thumbnails cameras embed,
// so the preview stays light. Then each one is shrunk to the journal's usual
// size, one at a time, with the screen kept awake: phones run out of image
// memory decoding many big photos at once. Photos already in the journal, and
// photos whose only date is a guess from the file, aren't added unless you ask.

import { html, raw, sheet, toast, pickFiles, on } from "./dom.js";
import { icon } from "./icons.js";
import { readExif, exifTakenIso, exifThumbnail } from "../core/exif.js";
import { photosByDay } from "../core/photo-days.js";
import { formatDay } from "../core/dates.js";
import { addPhotosToDay, journalPhotoKeys, photoKey, shrinkKeptOriginals } from "../app/actions.js";

const READERS = 6; // photos read at once for their dates (a quarter MB each)

async function readHeads(files) {
  const out = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const f = files[i];
      let taken = null;
      let thumb = null;
      try {
        const head = new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer());
        const exif = readExif(head);
        taken = exifTakenIso(exif, "");
        const t = exifThumbnail(head, exif);
        if (t) thumb = new Blob([t.slice()], { type: "image/jpeg" });
      } catch { /* no date: maybe placed by its file date */ }
      out[i] = { key: i, taken, modified: f.lastModified, thumb, id: photoKey(f.name, taken, f.size) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(READERS, files.length) }, worker));
  return out;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function addPhotosForDays(ctx) {
  const files = (await pickFiles({ accept: "image/*", multiple: true })).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|heic|png|webp)$/i.test(f.name));
  if (!files.length) return;
  toast(`Reading ${plural(files.length, "photo")}…`, { timeout: 1500 });
  const heads = await readHeads(files);
  const { days, undated } = photosByDay(heads, { tz: ctx.tz(), rolloverHour: ctx.prefs().rollover_hour ?? 4 });
  const today = ctx.today();
  const known = journalPhotoKeys(ctx);
  const dayHasPhotos = new Set(ctx.store.all("entry").filter((e) => !e.deleted && (e.media || []).some((m) => m.type === "photo")).map((e) => e.day));
  const rows = days.filter((d) => d.day <= today).map((d) => {
    const photos = d.photos.map((p) => ({ ...p, dup: known.has(heads[p.key].id) }));
    return { day: d.day, photos, thumbs: photos.filter((p) => heads[p.key].thumb).slice(0, 4).map((p) => URL.createObjectURL(heads[p.key].thumb)) };
  });
  if (!rows.length) return toast("None of those photos says when it was taken, so they can't be sorted into days.", { timeout: 7000 });

  let firstOnly = false;
  let guesses = false;
  const off = new Set(); // days you unticked
  // The photos a day would get, given the choices so far.
  const pick = (r) => {
    const ok = r.photos.filter((p) => !p.dup && (guesses || !p.guessed));
    if (!firstOnly) return ok;
    if (dayHasPhotos.has(r.day)) return []; // first-only: a day with photos already has its photo
    return ok.slice(0, 1);
  };
  const total = () => rows.reduce((n, r) => n + (off.has(r.day) ? 0 : pick(r).length), 0);
  const guessCount = rows.reduce((n, r) => n + r.photos.filter((p) => p.guessed && !p.dup).length, 0);

  const rowHtml = (r) => {
    const take = pick(r);
    const all = r.photos.filter((p) => !p.guessed || guesses);
    const dups = r.photos.filter((p) => p.dup).length;
    const span = all.length > 1 ? `${all[0].time}–${all[all.length - 1].time}` : all[0]?.time || r.photos[0].time;
    const note = !take.length
      ? (dups === r.photos.length ? "Already in the journal" : firstOnly && dayHasPhotos.has(r.day) ? "Already has photos" : "Only dates guessed from the files")
      : dups ? `${dups} already in the journal` : "";
    return html`<label class="photo-day">
      <input type="checkbox" data-day="${r.day}" ${take.length && !off.has(r.day) ? "checked" : ""} ${take.length ? "" : "disabled"}>
      <span class="thumbs">${r.thumbs.length ? r.thumbs.slice(0, firstOnly ? 1 : 3).map((u) => html`<img alt="" src="${u}">`) : html`<span class="no-thumb">${raw(icon("photos"))}</span>`}</span>
      <span class="grow"><b>${formatDay(r.day, { weekday: "short", day: "numeric", month: "short" })}</b>
        <span class="small muted">${firstOnly ? `${take[0]?.time || span} · first of ${r.photos.length}` : plural(take.length, "photo")}</span>
        ${firstOnly ? "" : html`<span class="small faint">${span}</span>`}
        ${note ? html`<span class="small faint">${note}</span>` : ""}</span>
    </label>`;
  };

  const ok = await sheet({
    title: "Sort photos into days",
    wide: true,
    body: html`<p class="small muted" style="margin-top:0">${plural(files.length, "photo")} across ${plural(rows.length, "day")}, each placed by when it was taken.${undated.length ? ` ${plural(undated.length, "photo")} had no date at all and ${undated.length === 1 ? "isn't" : "aren't"} used.` : ""}</p>
      <div class="chips" style="margin-bottom:10px">
        <button type="button" class="chip on" data-mode="all">Every photo</button>
        <button type="button" class="chip" data-mode="first">Just the first of each day</button>
      </div>
      ${guessCount ? html`<label class="switch" style="margin-bottom:8px"><input type="checkbox" data-guesses><span><span class="t">Also add ${plural(guessCount, "photo")} with no date inside</span><br><span class="d">Placed by the file's date, which is often when it was saved or shared — not taken</span></span></label>` : ""}
      <div class="photo-days" data-rows></div>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok></button>`,
    setup: (d, close) => {
      const render = () => {
        d.querySelector("[data-rows]").innerHTML = String(html`${rows.map(rowHtml)}`);
        const n = total();
        const b = d.querySelector("[data-ok]");
        b.textContent = n ? `Add ${plural(n, "photo")}` : "Nothing new to add";
        b.toggleAttribute("disabled", !n);
        for (const c of d.querySelectorAll("[data-mode]")) c.classList.toggle("on", (c.dataset.mode === "first") === firstOnly);
      };
      on(d, "click", "[data-mode]", (e, c) => { firstOnly = c.dataset.mode === "first"; render(); });
      on(d, "change", "[data-guesses]", (e, c) => { guesses = c.checked; render(); });
      on(d, "change", "[data-day]", (e, box) => { if (box.checked) off.delete(box.dataset.day); else off.add(box.dataset.day); render(); });
      d.querySelector("[data-ok]").addEventListener("click", () => close(true));
      render();
    },
  });
  for (const r of rows) for (const u of r.thumbs) URL.revokeObjectURL(u);
  if (!ok) return;

  // Add them, day by day, one photo at a time.
  const plan = rows.filter((r) => !off.has(r.day)).map((r) => ({ day: r.day, files: pick(r).map((p) => files[p.key]) })).filter((p) => p.files.length);
  const count = plan.reduce((n, p) => n + p.files.length, 0);
  let done = 0;
  let stopped = false;
  let progress = null;
  const finished = sheet({
    title: "Sorting photos into days",
    dismissable: false,
    body: html`<p class="small" data-status style="margin-top:0">Starting…</p><div class="progress"><span data-bar></span></div>
      <p class="tiny faint">Keep the journal open — the screen stays on until it's done.</p>`,
    foot: html`<button class="btn" data-stop>Stop</button>`,
    setup: (d, close) => {
      progress = { d, close };
      d.querySelector("[data-stop]").addEventListener("click", (e) => { stopped = true; e.currentTarget.textContent = "Stopping…"; e.currentTarget.disabled = true; });
    },
  });
  const show = (day) => {
    progress.d.querySelector("[data-status]").textContent = `${done} of ${count} · ${formatDay(day, { weekday: "short", day: "numeric", month: "short" })}`;
    progress.d.querySelector("[data-bar]").style.width = `${Math.round((done / count) * 100)}%`;
  };
  let lock = null;
  try { lock = await navigator.wakeLock?.request("screen"); } catch { /* not available: fine */ }
  const failed = [];
  let added = 0;
  let daysAdded = 0;
  try {
    for (const p of plan) {
      if (stopped) break;
      show(p.day);
      const r = await addPhotosToDay(ctx, p.day, p.files, { stopped: () => stopped, onPhoto: () => { done++; show(p.day); } });
      added += r.added;
      if (r.added) daysAdded++;
      failed.push(...r.failed);
    }
  } finally {
    lock?.release?.().catch(() => {});
    progress.close();
    await finished;
  }
  const msg = `Added ${plural(added, "photo")} to ${plural(daysAdded, "day")}${stopped ? " (stopped early — run it again to add the rest)" : ""}.`;
  if (failed.length) {
    await sheet({
      title: msg,
      body: html`<p style="margin-top:0">${plural(failed.length, "photo")} couldn't be opened and ${failed.length === 1 ? "was" : "were"} skipped — nothing was saved for ${failed.length === 1 ? "it" : "them"}. Try ${failed.length === 1 ? "it" : "them"} again on ${failed.length === 1 ? "its" : "their"} own, or in a smaller batch.</p>
        <p class="small muted">${failed.join(", ")}</p>`,
      foot: html`<button class="btn primary" data-close>OK</button>`,
    });
  } else {
    toast(msg, { action: "See them", onAction: () => ctx.navigate("#/photos"), timeout: 6000 });
  }
  shrinkKeptOriginals(ctx).catch(() => {});
}

/** The button that starts it, for the Photos page. */
export const photoDaysButton = (cls = "btn small") => html`<button class="${cls}" data-act="photo-days">${raw(icon("camera"))}Sort photos into days</button>`;
