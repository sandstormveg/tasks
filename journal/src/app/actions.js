// Domain operations shared by views: creating entries from the composer,
// attaching photos, changing privacy (including sealing), deleting with undo,
// and editing day fields. Views stay thin; the rules live here.

import { makeEntry, makeDay } from "../core/model.js";
import { newId } from "../core/ids.js";
import { mediaPath, MIME_EXT } from "../core/format.js";
import { extractTags } from "../core/markdown.js";
import { processPhoto } from "../media/images.js";
import { toast } from "../ui/dom.js";

const DRAFT_KEY = "draft:composer";
// Today's unfinished entry lives under one key; each past day you're catching
// up on keeps its own, so switching days never mixes them up.
const draftKey = (day) => (day ? `draft:day:${day}` : DRAFT_KEY);

/** The unfinished entry for today (no day) or for a past day you're catching up on. */
export function loadDraft(ctx, day = null) {
  const d = ctx.store.getKv(draftKey(day), null);
  return d && d.id ? d : null;
}

export function blankDraft(ctx, extra = {}) {
  const created = ctx.now();
  return { id: newId("e", created), body: "", media: [], privacy: "normal", day: null, question: null, startedAt: created, ...extra };
}

export async function saveDraft(ctx, draft) {
  await ctx.store.setKv(draftKey(draft.day), draft);
}

export async function clearDraft(ctx, day = null) {
  await ctx.store.deleteKv(draftKey(day));
}

/** Does this draft hold anything worth keeping? */
export const draftHasContent = (d) => !!(d && (String(d.body || "").trim() || (d.media || []).length));

/**
 * Process photo files and store them under the given entry id/day. A photo that
 * can't be resized is kept as the original file, unless keepOriginal is false
 * (batch imports): then it's skipped and its name added to `failed`.
 */
export async function storePhotos(ctx, { entryId, day, sealed = false }, files, onProgress, { keepOriginal = true, failed = null } = {}) {
  const out = [];
  let i = 0;
  for (const file of files) {
    i++;
    onProgress?.(i, files.length);
    const mid = newId("m", ctx.now());
    try {
      if (!file.type.startsWith("image/")) throw new Error("not an image");
      const p = await processPhoto(file);
      const path = mediaPath(day, mid, "jpg", { sealed });
      const thumb = mediaPath(day, mid, "jpg", { thumb: true, sealed });
      await ctx.store.putBlob(path, p.blob, { mime: "image/jpeg", sealed });
      await ctx.store.putBlob(thumb, p.thumb, { mime: "image/jpeg", sealed });
      out.push({ id: mid, type: "photo", mime: "image/jpeg", path, thumb, taken: p.taken || undefined, width: p.width, height: p.height, bytes: p.blob.size, original_name: p.originalName || undefined, original_bytes: p.originalBytes || undefined, entry: entryId });
    } catch (err) {
      if (!keepOriginal) { failed?.push(file.name || "a photo"); continue; }
      // Keep the original file rather than losing it.
      const ext = MIME_EXT[file.type] || (file.name.split(".").pop() || "bin").toLowerCase();
      const path = mediaPath(day, mid, ext, { sealed });
      await ctx.store.putBlob(path, file, { mime: file.type || "application/octet-stream", sealed });
      out.push({ id: mid, type: file.type.startsWith("image/") ? "photo" : "file", mime: file.type || "application/octet-stream", path, bytes: file.size, original_name: file.name, note: "kept as original (couldn't be resized)" });
      toast(`${file.name}: ${err.message}. Kept the original file.`, { timeout: 7000 });
    }
  }
  return out;
}

/** "Is this photo already in the journal?": its file name and when it was taken (or its size). */
export function photoKey(name, taken, bytes) {
  return `${name || ""}|${String(taken || "").slice(0, 19) || `size:${bytes || ""}`}`;
}

export function journalPhotoKeys(ctx) {
  const keys = new Set();
  for (const e of ctx.store.all("entry")) {
    if (e.deleted) continue;
    for (const m of e.media || []) if (m.type === "photo" && m.original_name) keys.add(photoKey(m.original_name, m.taken, m.original_bytes));
  }
  return keys;
}

const IMPORTED = new Set(["photo-import", "first-photo-of-day"]);

/**
 * Add photos to a day — into that day's imported-photos entry (made if needed),
 * in the order they were taken. One at a time, pausing between them so a phone
 * can free each photo's memory. Photos that can't be opened are skipped and
 * reported, never stored full-size. Returns { added, failed: [name] }.
 */
export async function addPhotosToDay(ctx, day, files, { onPhoto, stopped = () => false } = {}) {
  const media = [];
  const failed = [];
  for (const f of files) {
    if (stopped()) break;
    const [m] = await storePhotos(ctx, { entryId: null, day }, [f], null, { keepOriginal: false, failed });
    if (m) { const { entry, ...rest } = m; media.push(rest); }
    onPhoto?.(f);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!media.length) return { added: 0, failed };
  const byTaken = (a, b) => String(a.taken || "").localeCompare(String(b.taken || ""));
  const existing = ctx.store.entriesForDay(day).find((e) => IMPORTED.has(e.source?.via) && !e.sealed);
  if (existing) {
    await ctx.store.put({ ...existing, media: [...(existing.media || []), ...media].sort(byTaken) }, { reason: "photos-added" });
  } else {
    await ctx.store.put(makeEntry({
      id: newId("e", ctx.now()), kind: "photo", day, created: ctx.now(), body: "", media: media.sort(byTaken), privacy: "normal",
      source: { system: "living-journal", device: ctx.deviceName(), via: "photo-import" },
    }, { tz: ctx.tz() }));
  }
  return { added: media.length, failed };
}

const keptFullSize = (m) => m.type === "photo" && /^image\/(jpeg|png|webp)$/.test(m.mime || "") && /kept as original/.test(m.note || "");

/**
 * Photos that couldn't be resized when they were added were kept full-size
 * (several MB each, synced as such). Where this device has them and can now
 * open them, replace each with the usual 1600px copy and a thumbnail.
 * Returns how many were shrunk.
 */
export async function shrinkKeptOriginals(ctx) {
  let fixed = 0;
  for (const e of ctx.store.all("entry")) {
    if (e.deleted || e.sealed || !(e.media || []).some(keptFullSize)) continue;
    let changed = false;
    const media = [];
    for (const m of e.media) {
      if (!keptFullSize(m)) { media.push(m); continue; }
      try {
        const blob = await ctx.store.getBlob(m.path);
        if (!blob) { media.push(m); continue; }
        const p = await processPhoto(blob);
        const path = mediaPath(e.day, m.id, "jpg");
        const thumb = mediaPath(e.day, m.id, "jpg", { thumb: true });
        await ctx.store.putBlob(path, p.blob, { mime: "image/jpeg" });
        await ctx.store.putBlob(thumb, p.thumb, { mime: "image/jpeg" });
        if (path !== m.path) await ctx.store.removeBlob(m.path);
        const { note, ...rest } = m;
        media.push({ ...rest, mime: "image/jpeg", path, thumb, taken: m.taken || p.taken || undefined, width: p.width, height: p.height, bytes: p.blob.size, original_bytes: m.original_bytes || m.bytes });
        changed = true;
        fixed++;
      } catch { media.push(m); }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (changed) await ctx.store.put({ ...e, media }, { reason: "photos-shrunk" });
  }
  return fixed;
}

/** Store an audio recording for an entry. */
export async function storeAudio(ctx, { day, sealed = false }, blob, { duration } = {}) {
  const mid = newId("m", ctx.now());
  const mime = (blob.type || "audio/webm").split(";")[0];
  const ext = MIME_EXT[mime] || (mime.includes("mp4") ? "m4a" : "webm");
  const path = mediaPath(day, mid, ext, { sealed });
  await ctx.store.putBlob(path, blob, { mime, sealed });
  return { id: mid, type: "audio", mime, path, bytes: blob.size, duration: duration ? Math.round(duration) : undefined };
}

/** Turn the composer draft into an entry. */
export async function saveDraftAsEntry(ctx, draft) {
  const body = (draft.body || "").trim();
  if (!body && !(draft.media || []).length) return null;
  const media = (draft.media || []).map(({ entry, ...m }) => m);
  const kind = !body && media.length ? "photo" : draft.kind || "text";
  const day = draft.day || ctx.today();
  const created = ctx.now();
  const entry = makeEntry({
    id: draft.id,
    kind,
    day,
    created,
    body,
    media,
    tags: extractTags(body),
    privacy: draft.privacy || "normal",
    question: draft.questionId || undefined,
    title: draft.title || undefined,
    prompt: draft.questionText && !draft.questionId ? draft.questionText : undefined,
    source: { system: "living-journal", device: ctx.deviceName() },
  }, { tz: ctx.tz() });
  const saved = await ctx.store.put(entry);
  if (draft.questionId) await markQuestionAnswered(ctx, draft.questionId, saved.id);
  return saved;
}

export async function markQuestionAnswered(ctx, qid, entryId) {
  const q = ctx.store.get(qid);
  if (!q) return;
  await ctx.store.put({ ...q, answers: [...new Set([...(q.answers || []), entryId])], status: "answered", updated: ctx.now() });
}

/** Update text of an entry you wrote (keeps tags in sync with #hashtags). */
export async function updateEntry(ctx, entry, patch) {
  const next = { ...entry, ...patch };
  if (patch.body != null) {
    const fromText = extractTags(next.body);
    const manual = (entry.tags || []).filter((t) => !extractTags(entry.body || "").includes(t));
    next.tags = [...new Set([...manual, ...fromText])];
  }
  return ctx.store.put(next);
}

export async function setDayFields(ctx, date, patch) {
  const cur = ctx.store.get(date) || makeDay(date);
  const next = { ...cur, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === "" || (Array.isArray(patch[k]) && !patch[k].length)) delete next[k];
  if (next.rating != null && !next.rating_scale) next.rating_scale = ctx.prefs().rating_scale || 10;
  if (next.rating == null) delete next.rating_scale;
  return ctx.store.put(next);
}

/** Delete with an undo window: keeps the record and its media bytes in memory briefly. */
export async function deleteEntryWithUndo(ctx, entry) {
  const copy = structuredClone({ ...entry, _sync: undefined, _rev: undefined });
  const blobs = [];
  for (const m of entry.media || []) {
    for (const p of [m.path, m.thumb]) {
      if (!p) continue;
      const b = await ctx.store.rawBlob(p);
      if (b) blobs.push({ p, b, meta: ctx.store.blobMeta.get(p) });
    }
  }
  await ctx.store.remove(entry.id);
  toast("Entry deleted", {
    action: "Undo",
    timeout: 8000,
    onAction: async () => {
      for (const { p, b, meta } of blobs) {
        await ctx.store.backend.put("blobs", { ...(meta || {}), key: p, blob: b, deleted: undefined, local: true });
        ctx.store.blobMeta.set(p, { ...(meta || {}), key: p, local: true, deleted: undefined });
      }
      const tomb = ctx.store.raw(entry.id);
      await ctx.store.put({ ...copy, _sync: tomb?._sync ? { ...tomb._sync, dirty: true } : undefined }, { reason: "undo-delete" });
      toast("Restored");
    },
  });
}

/**
 * Change an entry's privacy. Moving into or out of "sealed" re-encrypts or
 * decrypts its media too, and replaces the files (old paths are deleted).
 */
export async function setPrivacy(ctx, entry, level) {
  if (entry.privacy === level) return entry;
  const toSealed = level === "sealed";
  const fromSealed = entry.privacy === "sealed";
  if ((toSealed || fromSealed) && ctx.store.isLocked()) throw new Error("Unlock sealed entries first (Settings → Privacy).");
  let media = entry.media || [];
  if (toSealed !== fromSealed) {
    const moved = [];
    for (const m of media) {
      const next = { ...m };
      for (const field of ["path", "thumb"]) {
        const p = m[field];
        if (!p) continue;
        const blob = await ctx.store.getBlob(p, { fetchRemote: ctx.sync.configured() ? (sha) => ctx.sync.fetchBlob(sha) : undefined });
        if (!blob) throw new Error("A photo for this entry isn't available on this device yet — sync first, then try again.");
        const ext = (MIME_EXT[m.mime] || "bin");
        const np = mediaPath(entry.day, m.id, ext, { thumb: field === "thumb", sealed: toSealed });
        await ctx.store.putBlob(np, blob, { mime: m.mime, sealed: toSealed });
        await ctx.store.removeBlob(p);
        ctx.media.forget(p);
        next[field] = np;
      }
      moved.push(next);
    }
    media = moved;
  }
  const next = { ...entry, privacy: level, media };
  if (fromSealed && !toSealed) delete next.sealed;
  return ctx.store.put(next, { reason: "privacy" });
}

export function questionFor(ctx, id) {
  return id ? ctx.store.get(id) : null;
}
