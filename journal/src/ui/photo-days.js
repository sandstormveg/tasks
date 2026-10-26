// "Photos for several days": pick a batch of photos (say 12–22 October) and the
// journal adds the first one taken on each day to that day — after you've seen
// the list. Only the chosen photos are resized and stored; the rest are just
// read for their dates. Days that already have photos, and days whose only date
// is a guess from the file, start unticked.

import { html, raw, sheet, toast, errorToast, pickFiles, on } from "./dom.js";
import { icon } from "./icons.js";
import { readExif, exifTakenIso } from "../core/exif.js";
import { firstPhotoPerDay } from "../core/photo-days.js";
import { formatDay } from "../core/dates.js";
import { addDayPhoto } from "../app/actions.js";

async function takenOf(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    return exifTakenIso(readExif(head), "");
  } catch { return null; }
}

export async function addPhotosForDays(ctx) {
  const files = (await pickFiles({ accept: "image/*", multiple: true })).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|heic|png|webp)$/i.test(f.name));
  if (!files.length) return;
  const items = await Promise.all(files.map(async (f, key) => ({ key, taken: await takenOf(f), modified: f.lastModified })));
  const { days, undated } = firstPhotoPerDay(items, { tz: ctx.tz(), rolloverHour: ctx.prefs().rollover_hour ?? 4 });
  if (!days.length) return toast("None of those photos says when it was taken, so they can't be placed on days.", { timeout: 7000 });

  const withPhotos = new Set(ctx.store.all("entry").filter((e) => !e.deleted && (e.media || []).some((m) => m.type === "photo")).map((e) => e.day));
  const today = ctx.today();
  const rows = days.filter((d) => d.day <= today).map((d) => ({ ...d, has: withPhotos.has(d.day), url: URL.createObjectURL(files[d.key]) }));
  const chosen = new Set(rows.filter((r) => !r.has && !r.guessed).map((r) => r.day));
  const label = () => `Add ${chosen.size} photo${chosen.size === 1 ? "" : "s"}`;

  const ok = await sheet({
    title: "First photo of each day",
    wide: true,
    body: html`<p class="small muted" style="margin-top:0">${files.length} photo${files.length === 1 ? "" : "s"} across ${rows.length} day${rows.length === 1 ? "" : "s"}. Each day gets the first photo you took that day; untick any you don't want.${undated.length ? ` ${undated.length} had no date and ${undated.length === 1 ? "isn't" : "aren't"} used.` : ""}</p>
      <div class="photo-days">${rows.map((r) => html`<label class="photo-day">
        <input type="checkbox" data-day="${r.day}" ${chosen.has(r.day) ? "checked" : ""}>
        <img alt="" src="${r.url}">
        <span class="grow"><b>${formatDay(r.day, { weekday: "short", day: "numeric", month: "short" })}</b>
          <span class="small muted">${r.time} · ${r.count === 1 ? "the only photo" : `first of ${r.count}`}</span>
          ${r.has ? html`<span class="small faint">Already has photos</span>` : ""}
          ${r.guessed ? html`<span class="small faint">Date guessed from the file, not the photo</span>` : ""}</span>
      </label>`)}</div>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${label()}</button>`,
    setup: (d, close) => {
      on(d, "change", "[data-day]", (e, box) => {
        if (box.checked) chosen.add(box.dataset.day); else chosen.delete(box.dataset.day);
        const b = d.querySelector("[data-ok]");
        b.textContent = label();
        b.toggleAttribute("disabled", !chosen.size);
      });
      d.querySelector("[data-ok]").toggleAttribute("disabled", !chosen.size);
      d.querySelector("[data-ok]").addEventListener("click", () => close(true));
    },
  });
  for (const r of rows) URL.revokeObjectURL(r.url);
  if (!ok) return;

  let added = 0;
  const todo = rows.filter((r) => chosen.has(r.day));
  try {
    for (const r of todo) {
      toast(`Adding photos… ${added + 1} of ${todo.length}`, { timeout: 1500 });
      if (await addDayPhoto(ctx, r.day, files[r.key])) added++;
    }
  } catch (err) { errorToast(err); }
  toast(`Added ${added} photo${added === 1 ? "" : "s"}, one per day.`, { action: "See them", onAction: () => ctx.navigate("#/photos"), timeout: 6000 });
}

/** The button that starts it, for the Photos page and a catch-up day. */
export const photoDaysButton = (cls = "btn small") => html`<button class="${cls}" data-act="photo-days">${raw(icon("camera"))}Photos for several days</button>`;
