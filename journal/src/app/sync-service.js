// Runs the sync engine at sensible moments: on open, when the app comes back
// to the foreground, when the network returns, a little while after you stop
// typing, and every few minutes while open. Never while offline; never noisy.

import { GitHubRemote, SyncError } from "../data/github.js";
import { FolderRemote } from "../data/folder-remote.js";
import { SyncEngine } from "../data/sync.js";

export const DATA_TEMPLATE = ["README.md", "CLAUDE.md", ".gitattributes", ".claude/skills/journal-steward/SKILL.md", "tools/journal.mjs"];

export class SyncService {
  constructor(ctx) {
    this.ctx = ctx;
    this.status = { state: "off", lastSync: ctx.store.getKv("last-sync", null), error: null, problems: [], conflicts: [] };
    this.listeners = new Set();
    this._engine = null;
    this._key = "";
    this._timer = null;
    this._seed = null;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }

  configured() {
    const s = this.ctx.settings().github;
    return !!(this.ctx.secrets().githubToken && s.owner && s.repo);
  }

  pendingCount() { return this.ctx.store.dirty().length + this.ctx.store.pendingBlobUploads().length; }

  async seedFiles() {
    if (this._seed) return this._seed;
    const files = [];
    for (const p of DATA_TEMPLATE) {
      try {
        const res = await fetch(`data-template/${p}`, { cache: "no-store" });
        if (res.ok) files.push({ path: p, content: await res.text() });
      } catch { /* offline: seed later */ }
    }
    this._seed = files;
    return files;
  }

  /** The configured repository (and folder in it), or null if sync isn't set up. Throws on a bad folder name. */
  remote() {
    const s = this.ctx.settings().github;
    const token = this.ctx.secrets().githubToken;
    if (!token || !s.owner || !s.repo) return null;
    const gh = new GitHubRemote({ token, owner: s.owner.trim(), repo: s.repo.trim(), branch: s.branch?.trim() || null });
    return new FolderRemote(gh, s.folder);
  }

  engine() {
    const s = this.ctx.settings().github;
    const token = this.ctx.secrets().githubToken;
    if (!token || !s.owner || !s.repo) return null;
    const key = `${s.owner}/${s.repo}@${s.branch}:${s.folder || ""}|${token.slice(-6)}`;
    if (this._engine && this._key === key) return this._engine;
    const remote = this.remote();
    this._engine = new SyncEngine(this.ctx.store, remote, {
      deviceName: this.ctx.deviceName(),
      onProgress: (p) => this.set({ progress: p }),
    });
    this._key = key;
    return this._engine;
  }

  /** Commit the latest README, CLAUDE.md, steward skill and tool into the data repo. */
  async pushTemplate() {
    const engine = this.engine();
    if (!engine) throw new Error("Set up sync first.");
    this._seed = null;
    const files = await this.seedFiles();
    if (!files.length) throw new Error("Couldn't load the template files (offline?).");
    const head = await engine.remote.getHead();
    if (!head) return this.syncNow();
    await engine.remote.commit({ baseTree: head.tree, parent: head.commit, changes: files, message: "Update journal format notes and steward tools" });
    return this.syncNow({ quiet: true });
  }

  async fetchBlob(sha) {
    const e = this.engine();
    if (!e) throw new Error("Sync isn't set up on this device, so this media can't be downloaded.");
    return e.remote.readBinary(sha);
  }

  async syncNow({ quiet = false } = {}) {
    let engine;
    try { engine = this.engine(); } catch (err) {
      this.set({ state: "error", error: err.message, progress: null });
      return null;
    }
    if (!engine) { this.set({ state: "off" }); return null; }
    if (globalThis.navigator && navigator.onLine === false) { this.set({ state: "offline" }); return null; }
    engine.seedFiles = await this.seedFiles();
    this.set({ state: "syncing", error: null });
    try {
      const res = await engine.sync();
      const lastSync = new Date().toISOString();
      await this.ctx.store.setKv("last-sync", lastSync);
      this.set({ state: "idle", lastSync, problems: res.problems, conflicts: res.conflicts, result: res, progress: null });
      if (!quiet && res.conflicts.length) {
        const { toast } = await import("../ui/dom.js");
        toast(res.conflicts[0].message + (res.conflicts.length > 1 ? ` (+${res.conflicts.length - 1} more)` : ""), { timeout: 9000 });
      }
      if (res.pendingMedia) this.later(30_000);
      return res;
    } catch (err) {
      const offline = err instanceof SyncError && err.code === "offline";
      this.set({ state: offline ? "offline" : "error", error: offline ? null : err.message, errorCode: err.code, progress: null });
      if (err.code === "rate-limit") this.later((err.retryAfter || 300) * 1000);
      if (!quiet && !offline) {
        const { errorToast } = await import("../ui/dom.js");
        errorToast(err);
      }
      return null;
    }
  }

  later(ms) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.syncNow({ quiet: true }), ms);
  }

  start() {
    if (!this.configured()) { this.set({ state: "off" }); }
    const auto = () => this.ctx.settings().autoSync && this.configured();
    this.ctx.store.on((change) => {
      if (change.fromSync || change.op === "kv" || change.op === "synced" || change.op === "lock" || change.op === "unlock") return;
      this.set({ pending: this.pendingCount() });
      if (auto()) this.later(15_000);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && auto()) this.later(800);
      if (document.visibilityState === "hidden" && auto() && this.pendingCount()) this.syncNow({ quiet: true });
    });
    window.addEventListener("online", () => { if (auto()) this.later(1000); });
    window.addEventListener("offline", () => this.set({ state: "offline" }));
    setInterval(() => { if (auto() && document.visibilityState === "visible") this.syncNow({ quiet: true }); }, 5 * 60_000);
    this.set({ pending: this.pendingCount() });
    if (auto()) this.later(1500);
  }
}
