// Export and restore. An export is the same portable layout as the sync
// repository — Markdown files you can open anywhere — zipped. Sealed entries
// stay encrypted in the export (they're unreadable without your passphrase,
// which is the point).

import { createZip, openZip } from "../core/zip.js";
import { serialize, parse, pathFor, isRecordPath, isMediaPath } from "../core/format.js";
import { guessMime } from "./store.js";

const README = `# Living Journal export

This folder is your journal in a plain, portable format:

- \`entries/YYYY/MM/*.md\` — what you wrote (YAML frontmatter + Markdown body)
- \`days/YYYY/YYYY-MM-DD.md\` — optional day ratings, best/hardest moments, feelings
- \`events/\` — calendar events you imported (context, not your words)
- \`meta/claims\`, \`meta/proposals\`, \`meta/questions\` — your meta-record and its history
- \`interpretations/\` — AI readings, labelled with their author
- \`media/\` — photos, audio and documents (\`.enc\` files are sealed: encrypted with your passphrase)
- \`config/\` — preferences and chapters

Every file is readable in a text editor. Nothing here depends on the app.
`;

export async function exportZip(ctx, { includeMedia = true, onProgress } = {}) {
  const z = createZip();
  const store = ctx.store;
  await z.add("README.md", README);
  const recs = [...store.records.values()].filter((r) => !r.deleted);
  let i = 0;
  for (const r of recs) {
    const p = pathFor(r);
    if (p) await z.add(p, serialize(r), { compress: true });
    if (++i % 200 === 0) onProgress?.(i, recs.length);
  }
  let mediaCount = 0, missing = 0;
  if (includeMedia) {
    for (const meta of store.blobMeta.values()) {
      if (meta.deleted) continue;
      let blob = await store.rawBlob(meta.key);
      if (!blob && meta.remoteSha && ctx.sync.configured()) {
        try { blob = new Blob([await ctx.sync.fetchBlob(meta.remoteSha)]); } catch { blob = null; }
      }
      if (!blob) { missing++; continue; }
      await z.add(meta.key, new Uint8Array(await blob.arrayBuffer()));
      mediaCount++;
    }
  }
  await z.add("export.json", JSON.stringify({ format: "living-journal/1", exported: ctx.now(), device: ctx.deviceName(), records: recs.length, media: mediaCount, mediaMissing: missing, includeMedia }, null, 2));
  return { blob: new Blob(z.finish(), { type: "application/zip" }), records: recs.length, media: mediaCount, missing };
}

/** Restore records/media from an export zip. Existing records are kept, not overwritten. */
export async function restoreZip(ctx, file, { onProgress } = {}) {
  const zip = await openZip(file);
  const out = { added: 0, skipped: 0, media: 0, problems: [] };
  const entries = zip.entries.filter((e) => !e.dir);
  let i = 0;
  for (const e of entries) {
    i++;
    if (i % 100 === 0) onProgress?.(i, entries.length);
    try {
      if (isRecordPath(e.name)) {
        const rec = parse(e.name, await zip.readText(e));
        if (ctx.store.raw(rec.id) && !ctx.store.raw(rec.id).deleted) { out.skipped++; continue; }
        await ctx.store.put(rec, { keepUpdated: true, silent: true, revision: false });
        out.added++;
      } else if (isMediaPath(e.name)) {
        if (ctx.store.blobMeta.get(e.name)?.local) continue;
        const bytes = await zip.read(e);
        const sealed = e.name.endsWith(".enc");
        const mime = guessMime(e.name);
        await ctx.store.backend.put("blobs", { key: e.name, blob: new Blob([bytes], { type: mime }), mime, size: bytes.length, uploaded: false, sealed, local: true });
        ctx.store.blobMeta.set(e.name, { key: e.name, mime, size: bytes.length, uploaded: false, sealed, local: true });
        out.media++;
      }
    } catch (err) { out.problems.push({ path: e.name, message: err.message }); }
  }
  ctx.store.emit({ op: "put", ids: [], types: ["entry", "day"], bulk: true });
  return out;
}
