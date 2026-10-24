// Links from journal entries to your knowledge system. Writing @concept-id
// (the Atlas's own node-reference convention) links an experience to an idea.
// The journal can fetch the list of Atlas object ids and titles to resolve
// names; it never writes to the Atlas.

import { GitHubRemote } from "../data/github.js";
import { splitFrontmatter } from "../core/format.js";

export async function refreshAtlasIndex(ctx) {
  const cfg = ctx.settings().integrations.atlas;
  const token = ctx.secrets().githubToken;
  const [owner, repo] = String(cfg.repo || "").split("/");
  if (!token || !owner || !repo) throw new Error("Set the Atlas repository and a sync token first.");
  const gh = new GitHubRemote({ token, owner, repo });
  const info = await gh.getRepoInfo();
  const head = await gh.getHead();
  if (!head) throw new Error("The Atlas repository is empty.");
  const tree = await gh.listTree(head.tree);
  const dirs = new Set(cfg.paths || ["concepts"]);
  const files = tree.filter((f) => f.path.endsWith(".md") && dirs.has(f.path.split("/")[0]) && f.path.split("/").length === 2);
  const texts = await gh.readTexts(files.map((f) => f.sha));
  const items = [];
  for (const f of files) {
    const id = f.path.split("/")[1].replace(/\.md$/, "");
    let title = id, type = f.path.split("/")[0].replace(/s$/, "");
    try {
      const { data } = splitFrontmatter(texts.get(f.sha) || "");
      title = data.title || data.name || data.label || data.statement || id;
      type = data.type || type;
    } catch { /* keep defaults */ }
    items.push({ id, title: String(title).slice(0, 140), type });
  }
  await ctx.store.setKv("atlas-index", { at: new Date().toISOString(), repo: info.fullName, items });
  return items.length;
}

export function atlasItem(ctx, id) {
  const idx = ctx.store.getKv("atlas-index", { items: [] });
  return (idx.items || []).find((x) => x.id === id) || null;
}
