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
    sources: fields.sources?.length ? [...new Set(fields.sources)] : undefined,
    cards: fields.cards?.length ? [...new Set(fields.cards)] : undefined,
    author,
    created: now,
    updated: now,
    visibility: "private",
    body: String(fields.body || ""),
  };
}

export function wordCount(text) {
  return (String(text || "").match(/[\p{L}\p{N}'’-]+/gu) || []).length;
}
