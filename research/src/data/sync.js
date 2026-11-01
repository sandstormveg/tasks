// The sync engine: reconciles this device's store with a remote repository.
//
// Guarantees, in order of importance:
//  1. Never lose writing. A local edit is never overwritten by a remote one:
//     concurrent edits are merged field by field, and where both sides changed
//     the same field, this device's text wins in place and the other version
//     is kept as a "conflict" revision you can restore.
//  2. Never publish. Sync refuses to run against a public repository.
//  3. Be boring. One commit per sync; deterministic files; no spurious diffs.
//
// The remote is any object with GitHubRemote's interface (a fake one is used
// in tests to simulate two devices sharing a repo).

import { serialize, parse, pathFor, isRecordPath, isMediaPath, gitBlobSha, stripLocal } from "../core/format.js";
import { merge3 } from "../core/merge.js";
import { ConflictError, SyncError } from "./github.js";

const STATE_KEY = "sync-state";

export function syncStateKey(remote) { return `${STATE_KEY}:${remote.label}`; }

export class SyncEngine {
  constructor(store, remote, { seedFiles = [], maxBlobUploads = 25, deviceName = "device", onProgress } = {}) {
    this.store = store;
    this.remote = remote;
    this.seedFiles = seedFiles;
    this.maxBlobUploads = maxBlobUploads;
    this.deviceName = deviceName;
    this.onProgress = onProgress || (() => {});
    this.running = null;
  }

  state() {
    return this.store.getKv(syncStateKey(this.remote), { commit: null, index: {} });
  }

  /** Run one sync. Concurrent calls share the same run. */
  sync(opts = {}) {
    if (!this.running) this.running = this._sync(opts).finally(() => { this.running = null; });
    return this.running;
  }

  async _sync() {
    const result = { pulled: 0, pushed: 0, deleted: 0, conflicts: [], problems: [], uploadedMedia: 0, pendingMedia: 0, commit: null };
    const info = await this.remote.getRepoInfo();
    if (!info.private) {
      throw new SyncError(`${info.fullName || this.remote.label} is a public repository. The journal only syncs to private repositories — make it private on GitHub, or choose another.`, { code: "public-repo" });
    }
    if (info.canPush === false) throw new SyncError(`The token can read ${info.fullName || this.remote.label} but not write to it. Give it "Contents: Read and write" on that repository.`, { code: "forbidden" });

    for (let attempt = 0; attempt < 4; attempt++) {
      let head = await this.remote.getHead();
      if (!head) {
        this.onProgress({ phase: "initialising" });
        const readme = this.seedFiles.find((f) => f.path === "README.md") || { path: "README.md", content: "# Journal data\n" };
        await this.remote.initialize(readme.path, readme.content, "Start journal");
        head = await this.remote.getHead();
        const rest = this.seedFiles.filter((f) => f.path !== readme.path);
        if (rest.length) head = await this.remote.commit({ baseTree: head.tree, parent: head.commit, changes: rest, message: "Add journal format notes" });
      }
      const state = this.state();
      let index = state.index || {};
      if (!state.commit && this.seedFiles.length) {
        // First sync into a repo (or folder) that already has commits: if the journal
        // has never been set up there, add the format notes — never replacing a file.
        try { head = await this.seedIfFresh(head); } catch (err) {
          if (err instanceof ConflictError && attempt < 3) continue;
          throw err;
        }
      }
      if (head.commit !== state.commit) {
        this.onProgress({ phase: "pulling" });
        index = await this.pull(head, index, result);
        await this.store.setKv(syncStateKey(this.remote), { commit: head.commit, index });
      }
      try {
        this.onProgress({ phase: "pushing" });
        const pushed = await this.push(head, index, result);
        if (pushed) {
          await this.store.setKv(syncStateKey(this.remote), { commit: pushed.commit, index: pushed.index });
          result.commit = pushed.commit;
        } else {
          result.commit = head.commit;
        }
        result.pendingMedia = this.store.pendingBlobUploads().length;
        this.onProgress({ phase: "done" });
        return result;
      } catch (err) {
        if (err instanceof ConflictError && attempt < 3) continue; // someone else committed: pull again
        throw err;
      }
    }
    throw new SyncError("Couldn't finish syncing — the repository kept changing.", { code: "conflict" });
  }

  async seedIfFresh(head) {
    const present = new Set((await this.remote.listTree(head.tree)).map((f) => f.path));
    if (present.has("README.md")) return head;
    const missing = this.seedFiles.filter((f) => !present.has(f.path));
    if (!missing.length) return head;
    this.onProgress({ phase: "initialising" });
    return this.remote.commit({ baseTree: head.tree, parent: head.commit, changes: missing, message: "Start journal" });
  }

  async pull(head, oldIndex, result) {
    const tree = await this.remote.listTree(head.tree);
    const index = {};
    const changedText = [];
    for (const f of tree) {
      if (isRecordPath(f.path)) {
        index[f.path] = f.sha;
        if (oldIndex[f.path] !== f.sha) changedText.push(f);
      } else if (isMediaPath(f.path)) {
        index[f.path] = f.sha;
        if (oldIndex[f.path] !== f.sha) await this.store.noteRemoteBlob(f.path, f.sha);
      }
    }
    const texts = await this.remote.readTexts(changedText.map((f) => f.sha), (done, total) => this.onProgress({ phase: "pulling", done, total }));
    const byPath = this.localByPath();
    for (const f of changedText) {
      const text = texts.get(f.sha);
      if (text == null) { result.problems.push({ path: f.path, message: "Couldn't download this file" }); continue; }
      let remoteRec;
      try { remoteRec = parse(f.path, text); } catch (err) {
        result.problems.push({ path: f.path, message: `Couldn't read this file (${err.message}). It was left untouched on GitHub.` });
        continue;
      }
      await this.reconcile(f.path, f.sha, text, remoteRec, byPath, result);
    }
    // Files deleted remotely.
    for (const path of Object.keys(oldIndex)) {
      if (index[path] || !isRecordPath(path)) continue;
      const before = byPath.get(path);
      if (!before) continue;
      const local = this.store.raw(before.id);
      if (!local) continue;
      // The record may have moved (e.g. an entry re-dated): it now lives elsewhere.
      if (local._sync?.path && local._sync.path !== path) continue;
      if (local._sync?.dirty && !local.deleted) {
        await this.store.setSyncMeta(local.id, { sha: null, path: null, base: null });
        result.conflicts.push({ id: local.id, path, kind: "deleted-remotely-edited-here", message: "Deleted on another device but edited here — kept this version." });
      } else {
        if (!local.deleted && ["entry", "day", "claim", "question"].includes(local.type)) await this.store.saveRevision(local, "deleted-remotely");
        await this.store.purge(local.id);
        result.deleted++;
      }
    }
    for (const path of Object.keys(oldIndex)) {
      if (!index[path] && isMediaPath(path)) {
        const meta = this.store.blobMeta.get(path);
        if (meta && meta.uploaded) await this.store.forgetBlob(path);
      }
    }
    if (result.pulled || result.deleted) this.store.emit({ op: "synced", fromSync: true });
    return index;
  }

  localByPath() {
    const m = new Map();
    for (const r of this.store.records.values()) {
      const p = r._sync?.path || (!r.deleted ? pathFor(r) : null);
      if (p) m.set(p, r);
    }
    return m;
  }

  async reconcile(path, sha, text, remoteRec, byPath, result) {
    const local = this.store.raw(remoteRec.id) || byPath.get(path);
    const meta = { path, sha, base: text, dirty: false };
    if (!local) {
      await this.store.put(remoteRec, { fromSync: true, sync: meta, revision: false, silent: true });
      result.pulled++;
      return;
    }
    if (!local._sync?.dirty) {
      await this.store.put({ ...remoteRec, _local: local._local }, { fromSync: true, sync: meta, silent: true, reason: "synced-change" });
      result.pulled++;
      return;
    }
    if (local.deleted) {
      // Deleted here, changed there: keep the remote change (never lose writing).
      await this.store.put(remoteRec, { fromSync: true, sync: meta, silent: true });
      result.conflicts.push({ id: remoteRec.id, path, kind: "edited-remotely-deleted-here", message: "Changed on another device after you deleted it here — restored it." });
      result.pulled++;
      return;
    }
    // Both changed: three-way merge against the last synced version.
    if (local.sealed || remoteRec.sealed) {
      await this.store.saveRevision(remoteRec, "conflict");
      await this.store.setSyncMeta(local.id, { sha, path, base: text, dirty: true });
      result.conflicts.push({ id: local.id, path, kind: "sealed", message: "A sealed entry changed on two devices — kept this device's version; the other is in its history." });
      return;
    }
    let base = null;
    try { base = local._sync.base ? parse(path, local._sync.base) : null; } catch { base = null; }
    const view = stripLocal({ ...local }, false);
    if (local.body != null) view.body = local.body;
    const { merged, conflicts } = merge3(base, view, remoteRec);
    if (conflicts.length) {
      await this.store.saveRevision(remoteRec, "conflict");
      result.conflicts.push({ id: local.id, path, kind: "both-edited", fields: conflicts.map((c) => c.key), message: `Edited on two devices (${conflicts.map((c) => c.key).join(", ")}) — kept this device's version; the other is in its history.` });
    }
    await this.store.put({ ...merged, _local: local._local }, { fromSync: true, dirty: true, sync: { path, sha, base: text, dirty: true }, silent: true, reason: "merged" });
    result.pulled++;
  }

  async push(head, index, result) {
    const changes = [];
    const after = []; // bookkeeping once the commit lands
    const newIndex = { ...index };
    let budget = this.maxBlobUploads;

    // Media first (so entries never point at files that aren't there yet).
    const uploadedNow = new Set();
    for (const m of this.store.pendingBlobUploads()) {
      if (budget <= 0) break;
      const blob = await this.store.rawBlob(m.key);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const sha = await this.remote.createBlob(bytes);
      changes.push({ path: m.key, sha });
      after.push(() => this.store.markBlobUploaded(m.key, sha));
      newIndex[m.key] = sha;
      uploadedNow.add(m.key);
      budget--;
      result.uploadedMedia++;
    }
    for (const m of this.store.pendingBlobDeletes()) {
      if (index[m.key]) { changes.push({ path: m.key, delete: true }); delete newIndex[m.key]; }
      after.push(() => this.store.forgetBlob(m.key));
    }
    const stillPending = new Set(this.store.pendingBlobUploads().map((m) => m.key).filter((k) => !uploadedNow.has(k)));

    for (const rec of this.store.dirty()) {
      const oldPath = rec._sync?.path;
      if (rec.deleted) {
        if (oldPath && index[oldPath]) { changes.push({ path: oldPath, delete: true }); delete newIndex[oldPath]; }
        after.push(() => this.store.purge(rec.id, { silent: true }));
        result.deleted++;
        continue;
      }
      // Hold back an entry whose photos haven't uploaded yet (upload budget).
      if ((rec.media || []).some((m) => stillPending.has(m.path) || stillPending.has(m.thumb))) continue;
      const path = pathFor(rec);
      if (!path) { result.problems.push({ id: rec.id, message: "Can't place this record in the repository (bad id or date)." }); continue; }
      const content = serialize(rec);
      const sha = await gitBlobSha(content);
      const rev = rec._rev;
      if (index[path] !== sha) changes.push({ path, content });
      if (oldPath && oldPath !== path && index[oldPath]) { changes.push({ path: oldPath, delete: true }); delete newIndex[oldPath]; }
      newIndex[path] = sha;
      after.push(async () => {
        const cur = this.store.raw(rec.id);
        const stillSame = cur && cur._rev === rev;
        await this.store.setSyncMeta(rec.id, { path, sha, base: content, dirty: !stillSame });
      });
      if (index[path] !== sha) result.pushed++;
    }

    if (!changes.length) {
      for (const fn of after) await fn();
      return null;
    }
    const message = this.commitMessage(result);
    const res = await this.remote.commit({ baseTree: head.tree, parent: head.commit, changes, message });
    for (const fn of after) await fn();
    if (result.pushed || result.deleted || result.uploadedMedia) this.store.emit({ op: "synced" });
    return { commit: res.commit, index: newIndex };
  }

  commitMessage(r) {
    const bits = [];
    if (r.pushed) bits.push(`${r.pushed} record${r.pushed === 1 ? "" : "s"}`);
    if (r.uploadedMedia) bits.push(`${r.uploadedMedia} media`);
    if (r.deleted) bits.push(`${r.deleted} deletion${r.deleted === 1 ? "" : "s"}`);
    return `Journal sync from ${this.deviceName}: ${bits.join(", ") || "update"}`;
  }

  /** Download one media file on demand (for lazy loading on a new device). */
  fetchBlob = async (sha) => this.remote.readBinary(sha);
}
