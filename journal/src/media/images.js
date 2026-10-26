// Photo intake: read when it was taken (EXIF), fix orientation, and store a
// right-sized copy plus a thumbnail. Originals stay in your phone's library;
// the journal keeps a 1600px copy (~200–400 KB) so years of photos fit
// comfortably in a git repository.

import { readExif, exifTakenIso, jpegSize } from "../core/exif.js";

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 420;

/**
 * Decode an image, already shrunk when we know its size. A phone photo is
 * 12–50 megapixels: decoding it at full size takes 50–200 MB, and a few in a
 * row can exhaust a phone browser's image memory (the decode then fails).
 * Asking for the target width up front keeps it small. `width` is the width
 * after EXIF rotation; only the width is given so the aspect ratio is always kept.
 */
async function decode(file, width) {
  if (typeof createImageBitmap === "function") {
    if (width) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: width, resizeQuality: "high" }); } catch { /* try full size */ }
    }
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasFor(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

async function toJpeg(canvas, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

async function resize(bitmap, edge, quality) {
  const w0 = bitmap.width, h0 = bitmap.height;
  const scale = Math.min(1, edge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
  const c = canvasFor(w, h);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, w, h);
  return { blob: await toJpeg(c, quality), width: w, height: h };
}

function localOffset(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * file -> {blob, thumb, width, height, taken, mime, originalName, originalBytes}
 * Throws a readable error for formats the browser can't decode (e.g. HEIC on
 * non-Safari browsers); the caller can then keep the original as a file.
 */
export async function processPhoto(file, { maxEdge = MAX_EDGE } = {}) {
  let taken = null;
  let width = 0;
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const exif = readExif(head);
    taken = exifTakenIso(exif, localOffset());
    const size = jpegSize(head);
    if (size) {
      const turned = (exif?.orientation || 1) >= 5; // 5–8: rotated a quarter turn
      const w = turned ? size.height : size.width;
      const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
      if (scale < 1) width = Math.max(1, Math.round(w * scale));
    }
  } catch { /* no EXIF or size: decode at full size */ }
  let bitmap;
  try { bitmap = await decode(file, width); } catch {
    throw new Error(`This browser can't open ${file.name || "this image"} (${file.type || "unknown format"}). Try exporting it as JPEG.`);
  }
  const full = await resize(bitmap, maxEdge, 0.84);
  const thumb = await resize(bitmap, THUMB_EDGE, 0.72);
  bitmap.close?.();
  // No EXIF date: leave `taken` empty. file.lastModified is when the file was
  // saved or shared, not when the photo was taken, so it isn't used.
  return { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height, taken, mime: "image/jpeg", originalName: file.name, originalBytes: file.size };
}
