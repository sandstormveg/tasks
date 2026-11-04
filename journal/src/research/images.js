// Images in Research: a photo of a sketch, a screenshot, a diagram, a page of a
// book. Each one becomes an "image" source in your library — in the Deposit, or
// filed straight onto a board — so it can be tagged, filed, tied by string and
// searched like anything else. The picture is shrunk to the journal's usual
// 1600px copy plus a thumbnail and synced the same way (media/ in Research's
// data folder), so Claude can open it with tools/research.mjs show.

import { newId } from "../core/ids.js";
import { mediaPath, MIME_EXT } from "../core/format.js";
import { makeSource } from "../core/sources.js";
import { processPhoto } from "../media/images.js";
import { toast } from "../ui/dom.js";

// Camera and screenshot file names say nothing; a date says more.
const GENERIC = /^(img|pxl|dsc|dcim|image|photo|screenshot|screen shot|signal|whatsapp image|mvimg)[\s_\-\d.:]*$/i;

function titleFrom(file, now) {
  const name = String(file.name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
  if (name && !GENERIC.test(name) && !/^\d[\d\s_-]*$/.test(name)) return name;
  const d = new Date(now);
  return `Image · ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** Store one picture (shrunk, with a thumbnail); a file that can't be shrunk is kept as it is. */
async function storeImage(ctx, file) {
  const now = ctx.now();
  const day = now.slice(0, 10);
  const id = newId("m", now);
  try {
    const p = await processPhoto(file);
    const path = mediaPath(day, id, "jpg");
    const thumb = mediaPath(day, id, "jpg", { thumb: true });
    await ctx.store.putBlob(path, p.blob, { mime: "image/jpeg" });
    await ctx.store.putBlob(thumb, p.thumb, { mime: "image/jpeg" });
    return { id, type: "photo", mime: "image/jpeg", path, thumb, width: p.width, height: p.height, taken: p.taken || undefined, original_name: file.name || undefined };
  } catch {
    const path = mediaPath(day, id, MIME_EXT[file.type] || "img");
    await ctx.store.putBlob(path, file, { mime: file.type });
    return { id, type: "photo", mime: file.type, path, original_name: file.name || undefined, note: "kept as original (couldn't be resized)" };
  }
}

/**
 * Save pictures as image sources. `fields` (status, title, why, tags) apply to
 * each; a typed title is numbered when there are several. Returns the sources.
 */
export async function saveImages(ctx, files, fields = {}, { via = "app" } = {}) {
  const images = [...files].filter((f) => f && String(f.type || "").startsWith("image/"));
  if (!images.length) { toast("That isn't an image.", { error: true }); return []; }
  const out = [];
  for (const [i, file] of images.entries()) {
    const media = await storeImage(ctx, file);
    const title = fields.title ? (images.length > 1 ? `${fields.title} (${i + 1})` : fields.title) : titleFrom(file, ctx.now());
    const rec = makeSource({ ...fields, kind: "image", title, media: [media] }, { now: ctx.now(), device: ctx.deviceName(), via });
    out.push(await ctx.store.put(rec));
  }
  return out;
}

/** The picture of an image source (or null). */
export const imageOf = (s) => (s?.kind === "image" && s.media?.find((m) => m.type === "photo")) || null;

/** A pin's size for an image: its own shape, about 260px across, with room for a caption. */
export function imagePinSize(s, width = 260) {
  const m = imageOf(s);
  const ratio = m?.width && m?.height ? m.height / m.width : 0.75;
  return { w: width, h: Math.round(Math.min(2.2, Math.max(0.35, ratio)) * width) + 34 };
}

/** Open a file picker for pictures; resolves with the chosen files (empty if none). */
export function pickImages({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files || [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

/** Pictures pasted or dropped (a clipboard or drag event's items). */
export function imagesFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
}

/**
 * Pictures shared to Research from another app (Android's share sheet). The
 * service worker (sw.js) keeps them in a cache under share/<stamp>/ and opens
 * Research with ?share=<stamp>; this takes them out and saves them to the Deposit.
 */
export async function takeSharedImages(ctx, stamp, fields = {}) {
  if (!stamp || typeof caches === "undefined") return [];
  const cache = await caches.open("research-share");
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.includes(`/share/${stamp}/`));
  const files = [];
  for (const k of keys) {
    const res = await cache.match(k);
    if (res) files.push(new File([await res.blob()], decodeURIComponent(res.headers.get("x-name") || "image"), { type: res.headers.get("content-type") || "image/jpeg" }));
    await cache.delete(k);
  }
  return files.length ? saveImages(ctx, files, fields, { via: "share" }) : [];
}
