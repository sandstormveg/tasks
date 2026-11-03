// The Atlas (sandstormveg/atlas_infodex) on the corkboard: its entries pinned as
// cards. Research never reads the Atlas repo whole — it reads the Atlas's small
// index (generated/infodex-index.json, built by its tools/build-index.js): one
// line of data per entry, ~70 KB. An entry's full file is fetched only when you
// zoom into its card.
//
// A card keeps a snapshot of the entry (name, type, summary, address, epistemic
// status, edges) so the board still reads offline; your own entries about it are
// the card's body, as for any card. The entry's address comes with it: an Atlas
// card brings its own domain, so the curator knows a string between a psychology
// entry and a machine-learning entry is a bridge without you framing either.
//
// The sprite is the Atlas's own: its hand-drawn 16×16 matrix if it has one, else
// a pattern from the entry id's hash in its type's colour — the same pixels as
// the Atlas draws (index.html, generatePixelSpriteDataUrl). Pure; no DOM.

import { fold } from "./search.js";

export const ATLAS_SWATCH = { claim: "#2a78d6", model: "#eb6834", evidence: "#1baf7a", prediction: "#4a3aa7" };
export const swatchFor = (type) => ATLAS_SWATCH[type] || "#8a8875";
export const atlasCardId = (id) => `card-atlas-${id}`;

/** The Atlas's string hash (Java-style), so a sprite matches the Atlas pixel for pixel. */
export function spriteHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) { h = (h << 5) - h + id.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const mix = (c, w, other) => { const a = hex(c); const b = hex(other); return toHex(a.map((v, i) => v * w + b[i] * (1 - w))); };

/** 16 rows × 16 colours (null = transparent). */
export function spritePixels({ id, type, sprite } = {}) {
  const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  if (sprite?.pixels && sprite.palette) {
    for (let r = 0; r < 16; r++) {
      const line = sprite.pixels[r] || "";
      for (let c = 0; c < 16; c++) { const ch = line[c]; if (ch && ch !== "." && sprite.palette[ch]) grid[r][c] = sprite.palette[ch]; }
    }
    return grid;
  }
  const base = swatchFor(type);
  const light = mix(base, 0.6, "#ffffff");
  const dark = mix(base, 0.7, "#000000");
  const h = spriteHash(String(id || ""));
  for (let r = 3; r <= 12; r++) for (let c = 3; c <= 12; c++) grid[r][c] = "#1a202c";
  for (let y = 4; y <= 11; y++) for (let x = 4; x <= 7; x++) {
    const on = (h >> ((y * 4 + x) % 24)) & 1;
    const colour = on ? ((x + y) % 2 === 0 ? base : light) : dark;
    grid[y][x] = colour;
    grid[y][15 - x] = colour;
  }
  return grid;
}

/** The sprite as an SVG string (crisp at any zoom; no canvas needed). */
export function spriteSvg(entry) {
  const g = spritePixels(entry);
  let rects = "";
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) if (g[r][c]) rects += `<rect x="${c}" y="${r}" width="1.02" height="1.02" fill="${g[r][c]}"/>`;
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** Entries matching what you typed, best first: exact id/name, then name words, then summary and domain. */
export function searchAtlas(index, query, { limit = 12 } = {}) {
  const entries = index?.entries || [];
  const q = fold(String(query || "").trim()).replace(/[-_]+/g, " ");
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of entries) {
    const name = fold(e.name).replace(/[-_]+/g, " ");
    const id = fold(e.id).replace(/[-_]+/g, " ");
    const rest = fold([e.summary, e.address?.domain, e.type].join(" ")).replace(/[-_]+/g, " ");
    let s = 0;
    if (name === q || id === q) s += 100;
    else if (name.startsWith(q)) s += 40;
    for (const w of words) {
      if (name.split(" ").some((t) => t.startsWith(w))) s += 10;
      else if (id.includes(w)) s += 6;
      else if (rest.includes(w)) s += 2;
      else { s = 0; break; } // every word has to be somewhere
    }
    if (s > 0) scored.push([s, e]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, e]) => e);
}

/** An index entry → a card record (a snapshot; your entries about it go in the body). */
export function cardFromAtlas(e, { now, version } = {}) {
  return {
    id: atlasCardId(e.id),
    type: "card",
    source: "atlas",
    atlas: e.id,
    label: e.name,
    desc: e.summary || undefined,
    kind: e.type,
    address: e.address && Object.keys(e.address).length ? { ...e.address } : undefined,
    status: e.status || undefined,
    standing: e.standing || undefined,
    credence: typeof e.credence === "number" ? e.credence : undefined,
    review: e.review || undefined,
    path: e.path || undefined,
    edges: e.links?.length ? e.links.map((l) => [...l]) : undefined,
    sprite: e.sprite || undefined,
    atlas_version: version || undefined,
    added: now,
    updated: now,
    body: "",
  };
}

/** Bring a card up to date with a newer index entry, keeping your entries (the body) and when it was added. */
export function refreshAtlasCard(existing, e, { now, version } = {}) {
  const fresh = cardFromAtlas(e, { now, version });
  if (!existing) return fresh;
  return { ...fresh, body: existing.body, added: existing.added || fresh.added };
}

/** What the Atlas already says relates two entries (either direction): [{ relation, tier, from, to }]. */
export function atlasRelations(a, b) {
  const out = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    for (const [target, relation, tier] of x?.edges || []) if (target === y?.atlas) out.push({ from: x.atlas, to: y.atlas, relation, tier });
  }
  return out;
}

export const readable = (s) => String(s || "").replace(/_/g, " ");
