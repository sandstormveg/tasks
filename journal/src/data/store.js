// The local-first store. Everything you write lands here first — on this
// device, immediately, offline — and sync is a separate, later concern.
//
// Records are kept in two forms:
//   persisted: exactly what's stored in IndexedDB and synced (sealed entries
//              are ciphertext here);
//   view:      what the UI reads (sealed entries decrypted in memory while
//              you've unlocked them; never written back in plaintext).
//
// Edits to entries, days and claims keep the previous version as a revision,
// so "the original entry is the record" holds even after you change it.

import { sealRecord, openRecord, sealBytes, openBytes } from "../core/crypto.js";
import { nowIso } from "../core/model.js";
import { compareDays } from "../core/dates.js";

const REVISIONED = new Set(["entry", "day", "claim", "question"]);
const CONTENT_KEYS = ["body", "title", "best", "hardest", "rating", "statement", "text", "media", "tags", "emotions", "privacy", "document", "day"];

function contentChanged(a, b) {
  return CONTENT_KEYS.some((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

function stripUnderscore(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

export class Store {
  constructor(backend, { now = nowIso } = {}) {
    this.backend = backend;
    this.now = now;
    this.records = new Map();
    this.opened = new Map();
    this.kv = new Map();
    this.blobMeta = new Map();
    this.key = null;
    this.listeners = new Set();
    this.version = 0;
  }

  async load() {
    const [recs, kv, blobs] = await Promise.all([
      this.backend.getAll("records"), this.backend.getAll("kv"), this.backend.getAll("blobs"),
    ]);
    for (const r of recs) this.records.set(r.id, r);
    for (const row of kv) this.kv.set(row.key, row.value);
    for (const b of blobs) { const { blob, ...meta } = b; this.blobMeta.set(b.key, meta); }
    return this;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(change) {
    this.version++;
    for (const fn of this.listeners) {
      try { fn(change); } catch (err) { console.error("store listener failed", err); }
    }
  }

  // ---------- reading ----------

  get(id) {
    const r = this.opened.get(id) || this.records.get(id);
    return r && !r.deleted ? r : undefined;
  }

  raw(id) { return this.records.get(id); }

  all(type) {
    const out = [];
    for (const [id, r] of this.records) {
      if (r.deleted || (type && r.type !== type)) continue;
      out.push(this.opened.get(id) || r);
    }
    return out;
  }

  entries() {
    return this.all("entry").sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  entriesForDay(day) {
    return this.all("entry").filter((e) => e.day === day).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  }

  entriesBetween(from, to) {
    return this.all("entry").filter((e) => (!from || compareDays(e.day, from) >= 0) && (!to || compareDays(e.day, to) <= 0));
  }

  day(date) { return this.get(date); }

  dirty() { return [...this.records.values()].filter((r) => r._sync?.dirty); }

  isLocked() { return !this.key; }

  sealedLockedCount() {
    let n = 0;
    for (const [id, r] of this.records) if (!r.deleted && r.sealed && !this.opened.has(id)) n++;
    return n;
  }

  // ---------- writing ----------

  /**
   * Save a record. opts:
   *   fromSync: came from the remote (not dirty unless opts.dirty)
   *   sync: explicit _sync metadata (sync engine)
   *   keepUpdated: don't bump `updated`
   *   reason: revision reason ("edit", "conflict", …); revision: false to skip
   *   silent: don't emit
   */
  async put(rec, opts = {}) {
    if (!rec || !rec.id || !rec.type) throw new Error("Record needs an id and a type");
    const prev = this.records.get(rec.id);
    const prevView = prev ? (this.opened.get(rec.id) || prev) : null;
    let view = { ...rec };
    if (!opts.fromSync && !opts.keepUpdated) view.updated = this.now();
    view._rev = (prev?._rev || 0) + 1;
    view._sync = opts.sync ? { ...opts.sync } : { ...(prev?._sync || {}), dirty: opts.fromSync ? !!opts.dirty : true };
    delete view.deleted;

    let persisted = view;
    if (view.type === "entry" && view.privacy === "sealed") {
      if (view.sealed) {
        // Already ciphertext (from sync, or untouched).
        persisted = view;
        if (this.key) {
          try { this.opened.set(view.id, { ...(await openRecord(this.key, view)), _sync: view._sync, _rev: view._rev }); } catch { this.opened.delete(view.id); }
        }
      } else {
        if (!this.key) throw new Error("Unlock sealed entries before saving one.");
        persisted = await sealRecord(this.key, view);
        persisted._rev = view._rev;
        persisted._sync = view._sync;
        this.opened.set(view.id, view);
      }
    } else {
      this.opened.delete(view.id);
    }

    if (prevView && !prev.deleted && opts.revision !== false && REVISIONED.has(view.type) && contentChanged(prevView, view)) {
      await this.saveRevision(prev, opts.reason || (opts.fromSync ? "synced-change" : "edit"));
    }
    this.records.set(view.id, persisted);
    await this.backend.put("records", persisted);
    if (!opts.silent) this.emit({ op: "put", ids: [view.id], types: [view.type], fromSync: !!opts.fromSync });
    return this.opened.get(view.id) || persisted;
  }

  /** Bulk save (imports). Plain records only; one emit at the end. */
  async putMany(recs, opts = {}) {
    const out = [];
    for (const r of recs) out.push(await this.put(r, { ...opts, silent: true }));
    this.emit({ op: "put", ids: recs.map((r) => r.id), types: [...new Set(recs.map((r) => r.type))], fromSync: !!opts.fromSync, bulk: true });
    return out;
  }

  /** Delete: keeps a revision, leaves a tombstone until sync removes the file. */
  async remove(id, { reason = "deleted" } = {}) {
    const prev = this.records.get(id);
    if (!prev || prev.deleted) return;
    if (REVISIONED.has(prev.type)) await this.saveRevision(prev, reason);
    const synced = !!prev._sync?.path && prev._sync?.sha;
    if (!synced) {
      // Never reached the remote: nothing to delete there.
      this.records.delete(id);
      this.opened.delete(id);
      await this.backend.delete("records", id);
    } else {
      const tomb = { id, type: prev.type, deleted: true, _rev: (prev._rev || 0) + 1, _sync: { ...prev._sync, dirty: true } };
      this.records.set(id, tomb);
      this.opened.delete(id);
      await this.backend.put("records", tomb);
    }
    for (const m of prev.media || []) {
      for (const p of [m.path, m.thumb]) if (p) await this.removeBlob(p);
    }
    this.emit({ op: "remove", ids: [id], types: [prev.type] });
  }

  /** Hard-delete (after the deletion has synced, or for remote deletions). */
  async purge(id, { silent = false } = {}) {
    const prev = this.records.get(id);
    this.records.delete(id);
    this.opened.delete(id);
    await this.backend.delete("records", id);
    if (!silent && prev) this.emit({ op: "remove", ids: [id], types: [prev.type], fromSync: true });
  }

  /** Sync bookkeeping without bumping revisions or timestamps. */
  async setSyncMeta(id, meta) {
    const r = this.records.get(id);
    if (!r) return;
    const next = { ...r, _sync: { ...(r._sync || {}), ...meta } };
    this.records.set(id, next);
    const o = this.opened.get(id);
    if (o) this.opened.set(id, { ...o, _sync: next._sync });
    await this.backend.put("records", next);
  }

  // ---------- revisions ----------

  async saveRevision(rec, reason) {
    const at = this.now();
    const clean = stripUnderscore(rec);
    await this.backend.put("revisions", { rid: `${rec.id}@${at}@${Math.random().toString(36).slice(2, 6)}`, recordId: rec.id, at, reason, record: clean });
  }

  async revisions(id) {
    const list = await this.backend.byIndex("revisions", "recordId", id);
    return list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  async conflicts() {
    const all = await this.backend.getAll("revisions");
    return all.filter((r) => r.reason === "conflict").sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  // ---------- device-local key/value ----------

  getKv(key, fallback = undefined) {
    return this.kv.has(key) ? this.kv.get(key) : fallback;
  }

  async setKv(key, value) {
    this.kv.set(key, value);
    await this.backend.put("kv", { key, value });
    this.emit({ op: "kv", key });
  }

  async deleteKv(key) {
    this.kv.delete(key);
    await this.backend.delete("kv", key);
    this.emit({ op: "kv", key });
  }

  // ---------- synced config ----------

  config(name, fallback = {}) {
    const r = this.get(`config:${name}`);
    if (!r) return structuredClone(fallback);
    const { id, type, _sync, _rev, updated, ...data } = r;
    return data;
  }

  async setConfig(name, data) {
    return this.put({ ...data, id: `config:${name}`, type: "config" });
  }

  // ---------- media blobs (keyed by repo path) ----------

  async putBlob(path, blob, { mime, uploaded = false, remoteSha, sealed = false } = {}) {
    let stored = blob;
    if (sealed) {
      if (!this.key) throw new Error("Unlock sealed entries first.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      stored = new Blob([await sealBytes(this.key, bytes)], { type: "application/octet-stream" });
    }
    const meta = { key: path, mime: mime || blob.type, size: stored.size, uploaded, remoteSha, sealed, local: true };
    this.blobMeta.set(path, meta);
    await this.backend.put("blobs", { ...meta, blob: stored });
    return meta;
  }

  /** Bytes for a media path, decrypted if sealed. Downloads lazily via `fetchRemote`. */
  async getBlob(path, { fetchRemote } = {}) {
    let row = await this.backend.get("blobs", path);
    if ((!row || !row.blob) && fetchRemote) {
      const meta = this.blobMeta.get(path);
      if (meta?.remoteSha) {
        const bytes = await fetchRemote(meta.remoteSha, path);
        const blob = new Blob([bytes], { type: meta.sealed ? "application/octet-stream" : meta.mime || "" });
        row = { ...meta, blob, uploaded: true, local: true };
        this.blobMeta.set(path, { ...meta, uploaded: true, local: true });
        await this.backend.put("blobs", row);
      }
    }
    if (!row || !row.blob) return null;
    if (row.sealed || path.endsWith(".enc")) {
      if (!this.key) return null;
      const bytes = await openBytes(this.key, new Uint8Array(await row.blob.arrayBuffer()));
      return new Blob([bytes], { type: row.mime && row.mime !== "application/octet-stream" ? row.mime : "" });
    }
    return row.blob;
  }

  async rawBlob(path) {
    const row = await this.backend.get("blobs", path);
    return row?.blob || null;
  }

  /** The remote has this media file (sha); remember it for lazy download. */
  async noteRemoteBlob(path, sha) {
    const meta = this.blobMeta.get(path);
    if (meta && meta.remoteSha === sha && meta.uploaded) return;
    const next = { ...(meta || { key: path, local: false, sealed: path.endsWith(".enc") }), key: path, remoteSha: sha, uploaded: true };
    if (!next.mime) next.mime = guessMime(path);
    this.blobMeta.set(path, next);
    const row = await this.backend.get("blobs", path);
    await this.backend.put("blobs", { ...(row || {}), ...next });
  }

  async markBlobUploaded(path, sha) {
    const meta = this.blobMeta.get(path);
    if (!meta) return;
    const next = { ...meta, uploaded: true, remoteSha: sha };
    this.blobMeta.set(path, next);
    const row = await this.backend.get("blobs", path);
    await this.backend.put("blobs", { ...(row || {}), ...next });
  }

  async removeBlob(path) {
    const meta = this.blobMeta.get(path);
    if (!meta) return;
    if (meta.remoteSha) {
      const next = { key: path, deleted: true, remoteSha: meta.remoteSha };
      this.blobMeta.set(path, next);
      await this.backend.put("blobs", next);
    } else {
      this.blobMeta.delete(path);
      await this.backend.delete("blobs", path);
    }
  }

  async forgetBlob(path) {
    this.blobMeta.delete(path);
    await this.backend.delete("blobs", path);
  }

  pendingBlobUploads() {
    return [...this.blobMeta.values()].filter((m) => m.local && !m.uploaded && !m.deleted);
  }

  pendingBlobDeletes() {
    return [...this.blobMeta.values()].filter((m) => m.deleted);
  }

  // ---------- sealing ----------

  async unlock(key) {
    this.key = key;
    let failed = 0;
    for (const [id, r] of this.records) {
      if (r.deleted || !r.sealed) continue;
      try { this.opened.set(id, { ...(await openRecord(key, r)), _sync: r._sync, _rev: r._rev }); } catch { failed++; }
    }
    this.emit({ op: "unlock" });
    return { failed };
  }

  lock() {
    this.key = null;
    for (const [id, r] of this.records) if (r.sealed) this.opened.delete(id);
    this.emit({ op: "lock" });
  }

  /** Wipe this device's copy (does not touch the remote). */
  async wipe() {
    for (const s of ["records", "blobs", "kv", "revisions"]) await this.backend.clear(s);
    this.records.clear(); this.opened.clear(); this.kv.clear(); this.blobMeta.clear();
    this.emit({ op: "wipe" });
  }
}

export function guessMime(path) {
  const ext = path.split(".").pop().toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", webm: "audio/webm", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain", enc: "application/octet-stream" }[ext] || "application/octet-stream";
}
