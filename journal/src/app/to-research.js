// "Copy to Research › Writing", from an entry's menu: a new writing piece in Research, seeded
// with the entry's words and a link back to it. A one-way snapshot — nothing syncs between the
// two afterwards; the piece then syncs with the rest of Research, into Research's own data.
//
// Both apps live on the same site (side by side standalone; tasks/journal/ and tasks/research/
// in Tasks), so the journal opens Research's own database on this device and adds the piece
// there, as if it had been made in Research. Nothing leaves the device from here. The user
// chooses this, sees what will move, and confirms; the rules for what may go are in
// src/core/writing.js (whyNotToResearch).

import { openIdbBackend } from "../data/backend.js";
import { Store } from "../data/store.js";
import { pieceFromEntry } from "../core/writing.js";
import { formatDay } from "../core/dates.js";

export const RESEARCH_DB = "living-research";

/** Where Research is from the journal's page (and back), standalone or installed in a host. */
export function appHref(host, key) {
  const app = (host?.apps || []).find((a) => a.key === key);
  if (app) return app.href;
  return key === "research" ? "research.html" : "index.html";
}

/** Add the piece to Research's database. Resolves to the piece. */
export async function copyToResearch(ctx, entry, { open = () => openIdbBackend(RESEARCH_DB) } = {}) {
  const now = ctx.now();
  const piece = pieceFromEntry(entry, { now, dayLabel: formatDay(entry.day, { day: "numeric", month: "short", year: "numeric" }) });
  const be = await open();
  try {
    const research = await new Store(be).load();
    await research.put(piece);
  } finally { be.close?.(); }
  // The entry remembers where its copy went (as with "To tasks"), so you can find it again.
  const latest = ctx.store.get(entry.id) || entry;
  await ctx.store.put({ ...latest, links: { ...(latest.links || {}), research: [...(latest.links?.research || []), { piece: piece.id, title: piece.title }] } }, { reason: "link" });
  return piece;
}
