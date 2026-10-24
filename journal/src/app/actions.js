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

/** Process photo files and store them under the given entry id/day. */
export async function storePhotos(ctx, { entryId, day, sealed = false }, files, onProgress) {
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
      out.push({ id: mid, type: "photo", mime: "image/jpeg", path, thumb, taken: p.taken || undefined, width: p.width, height: p.height, bytes: p.blob.size, original_name: p.originalName || undefined, entry: entryId });
    } catch (err) {
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
