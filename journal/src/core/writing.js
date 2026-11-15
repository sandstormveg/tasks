// Writing: your ongoing research pieces — a grant proposal, an essay, a post.
// Each has a status, your draft (the body — only ever your words), the sources
// it draws on, and its own corkboard, where its ideas, sources and Infodex cards
// get pinned and connected before they're written up.

import { newId } from "./ids.js";

export const PIECE_STATUSES = { idea: "Idea", drafting: "Drafting", review: "In review", done: "Done" };

export function makePiece(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("w", now),
    type: "piece",
    title: String(fields.title || "").trim() || "Untitled piece",
    status: PIECE_STATUSES[fields.status] ? fields.status : "idea",
    board: fields.board || undefined,
    task: fields.task || undefined,
    from: fields.from || undefined,
    sources: fields.sources?.length ? [...new Set(fields.sources)] : undefined,
    cards: fields.cards?.length ? [...new Set(fields.cards)] : undefined,
    author,
    created: now,
    updated: now,
    visibility: "private",
    body: String(fields.body || ""),
  };
}

// Copy a journal entry into Research › Writing. A one-way snapshot: the new piece starts as the
// entry's words and links back to it, and after that each lives its own life (no sync either way).
// Only an entry an AI may already read can go: Research is read by Claude's research tool, so a
// No-AI, sealed, or not-for-AI document entry stays in the journal. Photos stay there too; where
// one sat in the text, the copy says so.

/** Why this entry can't be copied into Research (a sentence for the user), or "" if it can. */
export function whyNotToResearch(entry) {
  if (!entry || entry.deleted) return "This entry isn't here.";
  if (entry.privacy === "sealed" || entry.sealed) return "Sealed entries stay sealed: Research keeps plain text.";
  if (entry.privacy === "no-ai") return "This entry is No AI, and Research is read by Claude's research tool. Change its privacy first if you want it there.";
  if (entry.kind === "document" && entry.document?.ai_allowed === false) return "This document is marked not for AI, and Research is read by Claude's research tool.";
  if (!String(entry.body || "").trim()) return "There's no text to copy yet.";
  return "";
}

/** The new piece for an entry (see above). `dayLabel` names the day in the default title. */
export function pieceFromEntry(entry, { now, dayLabel = entry.day } = {}) {
  const why = whyNotToResearch(entry);
  if (why) throw new Error(why);
  const body = String(entry.body).replace(/!\[([^\]]*)\]\(media:[a-zA-Z0-9._-]+\)/g, (_, alt) => `*(photo${alt ? `: ${alt}` : ""} — in the journal entry)*`);
  return makePiece({
    title: entry.title || `From the journal, ${dayLabel}`,
    status: "drafting",
    body,
    from: { app: "journal", entry: entry.id, day: entry.day, copied: now },
  }, { now });
}

export function wordCount(text) {
  return (String(text || "").match(/[\p{L}\p{N}'’-]+/gu) || []).length;
}
