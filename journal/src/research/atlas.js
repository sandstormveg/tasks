// Reading the Atlas from Research, cheaply. The Atlas repo is private, so this
// uses your GitHub token (it needs read access to the Atlas repo too). It fetches
// only the Atlas's small index, at most every few hours and only if it changed
// (an ETag check that GitHub answers "not modified" without sending it again),
// and an entry's full file only when you zoom into that card. Both are cached
// on this device, so cards and pages work offline once seen.

import { yamlLoad } from "../core/format.js";

export const ATLAS_DEFAULTS = { owner: "sandstormveg", repo: "atlas_infodex", branch: "main", index: "generated/infodex-index.json" };
const STALE_MS = 6 * 3600 * 1000;
const entries = new Map(); // path → parsed entry, for this session

export function atlasConfig(ctx) {
  return { ...ATLAS_DEFAULTS, ...(ctx.settings().atlas || {}) };
}

async function get(ctx, path, { etag } = {}) {
  const c = atlasConfig(ctx);
  const token = ctx.secrets().githubToken;
  const headers = { Accept: "application/vnd.github.raw" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers["If-None-Match"] = etag;
  const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}${c.branch ? `?ref=${encodeURIComponent(c.branch)}` : ""}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 304) return { notModified: true };
  if (res.status === 404 || res.status === 403 || res.status === 401) {
    const why = !token ? "There's no GitHub token on this device yet."
      : res.status === 404 ? `Your token can't see ${c.owner}/${c.repo} (or it has no ${c.index} yet — run \`npm run build\` there).`
        : "GitHub refused the token for the Atlas.";
    throw Object.assign(new Error(why), { status: res.status });
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return { text: await res.text(), etag: res.headers.get("ETag") || undefined };
}

/** The Atlas index ({ version, count, entries }), from this device's cache or GitHub. */
export async function loadAtlasIndex(ctx, { refresh = false } = {}) {
  const cached = ctx.store.getKv("atlas-index", null);
  const fresh = cached && Date.now() - (cached.checked || 0) < STALE_MS;
  if (cached?.index && fresh && !refresh) return { index: cached.index, cached: true };
  try {
    const r = await get(ctx, atlasConfig(ctx).index, { etag: cached?.index ? cached.etag : undefined });
    if (r.notModified) {
      await ctx.store.setKv("atlas-index", { ...cached, checked: Date.now() });
      return { index: cached.index, cached: true };
    }
    const index = JSON.parse(r.text);
    if (!Array.isArray(index.entries)) throw new Error("That file isn't an Atlas index.");
    await ctx.store.setKv("atlas-index", { index, etag: r.etag, checked: Date.now() });
    return { index };
  } catch (err) {
    // Offline or not allowed: whatever this device already has still works.
    return { index: cached?.index || null, error: err.message };
  }
}

/** One entry's full file (frontmatter + notes), fetched when you open its card. */
export async function loadAtlasEntry(ctx, path) {
  if (!path) return null;
  if (entries.has(path)) return entries.get(path);
  const kept = ctx.store.getKv(`atlas-entry:${path}`, null);
  try {
    const { text } = await get(ctx, path);
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
    const entry = { data: m ? yamlLoad(m[1]) || {} : {}, notes: (m ? m[2] : text).trim() };
    entries.set(path, entry);
    await ctx.store.setKv(`atlas-entry:${path}`, entry);
    return entry;
  } catch {
    if (kept) entries.set(path, kept);
    return kept;
  }
}

export const atlasFileUrl = (ctx, path) => {
  const c = atlasConfig(ctx);
  return `https://github.com/${c.owner}/${c.repo}/blob/${c.branch || "main"}/${path}`;
};
