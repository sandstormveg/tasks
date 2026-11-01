// Turns media paths into displayable URLs. Thumbnails and photos load lazily
// as they scroll into view; on a new device they download from the sync repo
// on first view and are then cached locally.

export class MediaService {
  constructor(ctx) {
    this.ctx = ctx;
    this.urls = new Map();
    this.pending = new Map();
    this.failed = new Set(); // paths that exist in an entry but can't be shown here
    this.io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((items) => {
        for (const it of items) if (it.isIntersecting) { this.io.unobserve(it.target); this.load(it.target); }
      }, { rootMargin: "300px" })
      : null;
    ctx.store.on((c) => { if (c.op === "lock" || c.op === "wipe") this.revokeAll(); });
  }

  async url(path) {
    if (!path) return null;
    if (this.urls.has(path)) return this.urls.get(path);
    if (this.pending.has(path)) return this.pending.get(path);
    const p = (async () => {
      const canFetch = this.ctx.sync.configured();
      const blob = await this.ctx.store.getBlob(path, { fetchRemote: canFetch ? (sha) => this.ctx.sync.fetchBlob(sha) : undefined });
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      this.urls.set(path, u);
      return u;
    })().catch((err) => { console.warn("media load failed", path, err); return null; }).finally(() => this.pending.delete(path));
    this.pending.set(path, p);
    return p;
  }

  async load(img) {
    const path = img.dataset.media;
    const fallback = img.dataset.fallback;
    let u = await this.url(path);
    if (!u && fallback) u = await this.url(fallback);
    const missing = () => {
      img.removeAttribute("src");
      // Saved on another device and not downloaded yet isn't broken: it'll arrive.
      const meta = this.ctx.store.blobMeta.get(path);
      if (meta && !meta.local && meta.remoteSha) {
        img.alt = "Not on this device yet — it downloads when you're online";
        img.classList.add("elsewhere");
        return;
      }
      img.alt = "This photo can't be shown — it was never fully saved";
      img.classList.add("missing");
      this.failed.add(path);
      img.dispatchEvent(new CustomEvent("media-missing", { bubbles: true, detail: { path } }));
    };
    if (!u) return missing();
    // A stored file that can't be decoded (e.g. it was never fully saved) fails here.
    img.addEventListener("error", missing, { once: true });
    img.src = u;
    img.classList.add("loaded");
  }

  /** Lazy-load every <img data-media="…"> inside root. */
  hydrate(root) {
    for (const img of root.querySelectorAll("img[data-media]:not([src])")) {
      if (this.io) this.io.observe(img); else this.load(img);
    }
  }

  revokeAll() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }

  forget(path) {
    const u = this.urls.get(path);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(path);
    this.failed.delete(path);
  }
}
