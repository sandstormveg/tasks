// The Deposit: drop anything in — a link, a quote, a half-thought — and it
// suggests where it could go: which boards and pieces of writing it seems to
// belong with, and which pins on that board it might connect to. Filing it
// there pins it with red strings to those pins: noticed, not yet synthesised.
//
// The suggestion is plain word overlap, weighted so that rare shared words
// count for more than common ones (TF-IDF over your boards and pieces), with the
// shared words shown as the reason. It's a starting point you can see through,
// not a judgement; Claude can do deeper work with the same data (tools/research.mjs).

import { tokenize } from "./search.js";
import { STOP, pinText } from "./boards.js";

export function words(text) {
  return tokenize(String(text || "").replace(/https?:\/\/\S+/g, (u) => u.replace(/[/.?=&_-]+/g, " ")), { minLen: 3 }).filter((t) => !STOP.has(t) && !/^\d+$/.test(t));
}

/** The words of something dropped in the Deposit. */
export function depositText(item) {
  return [item.title, item.why, item.body, item.site, ...(item.tags || []), ...(item.tags || []).map((t) => t.replace(/-/g, " "))].filter(Boolean).join(" ");
}

function bag(text) {
  const m = new Map();
  for (const w of words(text)) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

/**
 * Where something could go. `homes` is [{ kind: "board"|"piece", id, title, text, pins? }]
 * where pins is [{ id, text }] for a board. Returns the best few, each with the shared
 * words that explain it and (for boards) the pins it might connect to.
 */
export function suggestHomes(item, homes, { limit = 3 } = {}) {
  const q = bag(depositText(item));
  if (!q.size || !homes.length) return [];
  const df = new Map();
  const bags = homes.map((h) => bag(`${h.title} ${h.title} ${h.text || ""} ${(h.pins || []).map((p) => p.text).join(" ")}`));
  for (const b of bags) for (const w of b.keys()) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + homes.length / (df.get(w) || 1));
  const out = [];
  homes.forEach((h, i) => {
    let score = 0;
    const shared = [];
    for (const [w] of q) {
      const n = bags[i].get(w);
      if (!n) continue;
      score += idf(w) * (1 + Math.log(n));
      shared.push(w);
    }
    if (!shared.length) return;
    const norm = score / Math.sqrt(q.size);
    const near = (h.pins || []).map((p) => {
      const pb = bag(p.text);
      const s = [...q.keys()].filter((w) => pb.has(w));
      return { id: p.id, score: s.reduce((a, w) => a + idf(w), 0), shared: s };
    }).filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
    out.push({ kind: h.kind, id: h.id, title: h.title, score: Math.round(norm * 100) / 100, shared: shared.sort((a, b) => idf(b) - idf(a)).slice(0, 5), near });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Boards and pieces in the shape suggestHomes wants, from the stored records. */
export function homesFrom(records, { cards = {}, sources = {} } = {}) {
  const homes = [];
  const pinsBy = {};
  for (const r of records) if (r.type === "pin" && !r.deleted && r.kind !== "frame") (pinsBy[r.board] ||= []).push({ id: r.id, text: pinText(r, { cards, sources }) });
  for (const r of records) {
    if (r.deleted) continue;
    if (r.type === "board") homes.push({ kind: "board", id: r.id, title: r.title, text: `${r.about || ""} ${(r.tags || []).join(" ")}`, pins: pinsBy[r.id] || [] });
    if (r.type === "piece") homes.push({ kind: "piece", id: r.id, title: r.title, text: String(r.body || "").slice(0, 4000) });
  }
  return homes;
}
