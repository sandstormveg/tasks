// The Corkboard: boards you pin things to, and the strings between them.
//
// A board is a record; each pin and each string is its own small file under
// boards/<board>/ — so moving one card, or Claude pinning a new item from a
// routine, never conflicts with what you're doing elsewhere on the board.
//
// A string starts **red**: a connection you've noticed but not yet worked out,
// like red string on a detective's corkboard. It becomes **synthesised** only
// when you write how the two connect (the string's body). Claude may pin things
// and propose red strings; only you synthesise. Frames are regions on the board,
// and what sits inside a frame is part of it — the board's own geometry is the
// mereotopology the curator (curator.js) checks connections against.
//
// Pure functions, shared by the app and the command-line tool (tools/research.mjs).

import { newId } from "./ids.js";
import { tokenize } from "./search.js";
import { PIN_FONTS } from "./textformat.js";

export const PIN_KINDS = {
  note: "Note",
  card: "Infodex card",
  source: "Source",
  quote: "Quote",
  link: "Link",
  frame: "Frame",
};

export const STRING_STATES = { red: "Red string — not synthesised yet", synthesised: "Synthesised" };

// How red string looks and when it says what it means. The board is a picture first:
// a label that covered a pin would hide the thing the string is about, so the default
// is to say nothing until you pick the string up.
export const STRING_TEXT = { always: "Always", selected: "Selected", never: "Never" };
export const STRING_COLOURS = [["red", "Red"], ["ink", "Ink"], ["blue", "Blue"], ["green", "Green"], ["purple", "Purple"]];
export const STRING_WIDTHS = [["thin", "Thin"], ["normal", "Normal"], ["thick", "Thick"]];
export const STRING_SAGS = [["straight", "Straight"], ["slight", "Slight sag"], ["droopy", "Droopy"]];
export const STRING_TEXT_SIZES = [["small", "Small"], ["normal", "Normal"], ["large", "Large"]];
// The label's fonts are the pin fonts, so a label reads as part of the board.
export const STRING_FONTS = PIN_FONTS;
export const STRING_DEFAULTS = { text: "selected", colour: "red", width: "normal", sag: "slight", size: "normal", font: "sans" };

const STRING_WIDTH_PX = { thin: 1.6, normal: 2.6, thick: 4 };
const STRING_SAG_SCALE = { straight: 0, slight: 0.55, droopy: 1.5 };
const STRING_TEXT_PX = { small: 11, normal: 13, large: 16 };

const hasKey = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

// The Atlas's connection ladder (atlas_infodex docs/connection-tiers.md): what kind of
// connection this is, and how much weight it can bear. Any tiered connection must
// say where it holds and where it breaks.
export const TIERS = {
  formal_isomorphism: { name: "Formal isomorphism", hint: "the same mathematics — an actual mapping", strength: 0.93 },
  shared_mechanism: { name: "Shared mechanism", hint: "the same process on different substrates", strength: 0.85 },
  empirical_regularity: { name: "Empirical regularity", hint: "the same measured pattern; mechanism may be disputed", strength: 0.75 },
  heuristic_analogy: { name: "Heuristic analogy", hint: "a useful comparison, not a derivation", strength: 0.5 },
  resonance: { name: "Resonance", hint: "it feels connected; no mapping offered", strength: 0.3 },
};

export const PIN_COLORS = ["paper", "yellow", "pink", "blue", "green", "lilac"];

const SIZES = {
  note: [220, 150],
  card: [200, 280],
  source: [240, 130],
  quote: [260, 140],
  link: [220, 100],
  frame: [640, 420],
};

export function defaultSize(kind) {
  const [w, h] = SIZES[kind] || SIZES.note;
  return { w, h };
}

const round = (n) => Math.round(Number(n) || 0);
const clean = (s) => String(s ?? "").trim();

export function makeBoard(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("b", now),
    type: "board",
    title: clean(fields.title) || "Untitled board",
    about: clean(fields.about) || undefined,
    piece: fields.piece || undefined,
    experiment: fields.experiment || undefined,
    tags: fields.tags?.length ? fields.tags : undefined,
    author,
    created: now,
    updated: now,
    visibility: "private",
    body: "",
  };
}

export function makePin(fields = {}, { now, author = "self" } = {}) {
  const kind = PIN_KINDS[fields.kind] ? fields.kind : "note";
  const size = defaultSize(kind);
  return {
    id: fields.id || newId("p", now),
    type: "pin",
    board: fields.board,
    kind,
    title: clean(fields.title) || undefined,
    x: round(fields.x),
    y: round(fields.y),
    w: round(fields.w || size.w),
    h: round(fields.h || size.h),
    color: PIN_COLORS.includes(fields.color) ? fields.color : undefined,
    card: fields.card || undefined,
    source: fields.source || undefined,
    url: fields.url || undefined,
    address: cleanAddress(fields.address),
    author,
    created: now,
    updated: now,
    body: String(fields.text ?? fields.body ?? "").replace(/\s+$/, ""),
  };
}

/** A frame's address, as the Atlas uses it: the domain, perspective, scale and time a region of the board holds in. */
export function cleanAddress(a) {
  if (!a || typeof a !== "object") return undefined;
  const out = {};
  for (const k of ["domain", "perspective", "scale", "time"]) if (clean(a[k])) out[k] = clean(a[k]);
  return Object.keys(out).length ? out : undefined;
}

/** A new string is always red. `author` says who noticed the connection. */
export function makeString(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("r", now),
    type: "string",
    board: fields.board,
    from: fields.from,
    to: fields.to,
    label: clean(fields.label) || undefined,
    state: "red",
    author,
    created: now,
    updated: now,
    body: "",
  };
}

/**
 * The changes that synthesise a string: your words for how they connect, and
 * optionally its tier and where it holds and breaks. Check it with
 * curator.checkSynthesis first — this doesn't decide whether it's allowed.
 */
export function synthesisPatch({ text, tier, holds_in, breaks_at, label } = {}, { now, by = "self" } = {}) {
  return {
    state: "synthesised",
    body: clean(text),
    tier: TIERS[tier] ? tier : undefined,
    holds_in: clean(holds_in) || undefined,
    breaks_at: clean(breaks_at) || undefined,
    ...(label !== undefined ? { label: clean(label) || undefined } : {}),
    synthesised: now,
    synthesised_by: by,
    updated: now,
  };
}

/** Back to red: the connection stays, your earlier synthesis text is kept in the record's history by sync. */
export function unsynthesisePatch({ now }) {
  return { state: "red", synthesised: undefined, synthesised_by: undefined, updated: now };
}

/** Everything on one board, from a flat list of records. */
export function boardParts(records, boardId) {
  const pins = [];
  const strings = [];
  for (const r of records) {
    if (r.deleted || r.board !== boardId) continue;
    if (r.type === "pin") pins.push(r);
    else if (r.type === "string") strings.push(r);
  }
  const ids = new Set(pins.map((p) => p.id));
  // A string whose pin was removed on another device just isn't drawn; it isn't deleted.
  return { pins, strings: strings.filter((s) => ids.has(s.from) && ids.has(s.to)) };
}

export function boardSummary(parts) {
  const items = parts.pins.filter((p) => p.kind !== "frame");
  const linked = new Set(parts.strings.flatMap((s) => [s.from, s.to]));
  return {
    pins: items.length,
    frames: parts.pins.length - items.length,
    red: parts.strings.filter((s) => s.state !== "synthesised").length,
    synthesised: parts.strings.filter((s) => s.state === "synthesised").length,
    loose: items.filter((p) => !linked.has(p.id)).length,
  };
}

const center = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
const inside = (pt, f) => pt.x >= f.x && pt.x <= f.x + f.w && pt.y >= f.y && pt.y <= f.y + f.h;

/** The frames a pin sits inside, innermost (smallest) first. */
export function framesOf(pin, pins) {
  const c = center(pin);
  return pins.filter((f) => f.kind === "frame" && f.id !== pin.id && inside(c, f)).sort((a, b) => a.w * a.h - b.w * b.h);
}

/**
 * Where a pin "lives": the address of its innermost frame that declares a domain,
 * else an Infodex card's type, else unknown. A frame without an address is just a
 * grouping ("People", "To do"): it holds things, but sets no boundary.
 */
export function addressOf(pin, pins, cardsById = {}) {
  if (pin.kind === "frame" && pin.address) return { ...pin.address, frame: pin.id };
  for (const f of framesOf(pin, pins)) {
    if (f.address?.domain) return { ...f.address, frame: f.id };
  }
  const card = pin.kind === "card" ? cardsById[pin.card] : null;
  // An Atlas entry brings its own address; a Wikidata card falls back to its Infodex type.
  if (card?.source === "atlas") return card.address?.domain ? { ...card.address, from: "Atlas" } : null;
  if (card?.kind && card.kind !== "WILD") return { domain: card.kind.charAt(0) + card.kind.slice(1).toLowerCase(), from: "card type" };
  return null;
}

/** Text a pin carries, for matching and for the curator's lexical distance. */
export function pinText(pin, { cards = {}, sources = {} } = {}) {
  const c = pin.kind === "card" ? cards[pin.card] : null;
  const s = pin.kind === "source" ? sources[pin.source] : null;
  return [pin.title, pin.body, c?.label, c?.desc, c?.subtitle, c?.address?.domain?.replace(/_/g, " "), ...(c?.lineage || []),
    s?.title, s?.why, ...(s?.tags || [])].filter(Boolean).join(" ");
}

export function pinTokens(pin, lookups) {
  return new Set(tokenize(pinText(pin, lookups), { minLen: 3 }).filter((t) => !STOP.has(t)));
}

export const STOP = new Set(("the and for with that this from into about what when where which while there their they them then than "
  + "have has had are was were been being not but can could should would will just like more most some such very also only "
  + "how why who its it's your you our out over under after before because between through does did doing done one two "
  + "new use used using make made many much other into onto any all each per via vs etc http https www com org html").split(" "));

/**
 * A free spot for a new pin: near `anchor` (another pin) if given, else to the
 * right of everything — searched in a widening ring so nothing lands on top of
 * something else.
 */
export function placeNear(pins, { anchor = null, w = 220, h = 150, gap = 28 } = {}) {
  const solid = pins.filter((p) => p.kind !== "frame");
  const hits = (x, y) => solid.some((p) => x < p.x + p.w + gap && x + w + gap > p.x && y < p.y + p.h + gap && y + h + gap > p.y);
  let cx;
  let cy;
  if (anchor) { cx = anchor.x + anchor.w / 2 - w / 2; cy = anchor.y + anchor.h / 2 - h / 2; }
  else if (solid.length) { cx = Math.max(...solid.map((p) => p.x + p.w)) + gap * 2; cy = Math.min(...solid.map((p) => p.y)); }
  else { cx = 0; cy = 0; }
  if (!hits(cx, cy)) return { x: round(cx), y: round(cy) };
  for (let ring = 1; ring < 40; ring++) {
    const r = ring * (Math.max(w, h) * 0.6 + gap);
    const steps = 8 + ring * 4;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (!hits(x, y)) return { x: round(x), y: round(y) };
    }
  }
  return { x: round(cx), y: round(cy + 400) };
}

/** A pin's slight, stable tilt (degrees) — real cards are never pinned perfectly straight. */
export function tiltOf(id, max = 2.2) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.round((((h >>> 0) % 1000) / 1000 * 2 - 1) * max * 10) / 10;
}

/** The bounds of everything on a board (for "fit to screen"). */
export function boundsOf(pins) {
  if (!pins.length) return { x: -300, y: -200, w: 600, h: 400 };
  const x0 = Math.min(...pins.map((p) => p.x));
  const y0 = Math.min(...pins.map((p) => p.y));
  const x1 = Math.max(...pins.map((p) => p.x + p.w));
  const y1 = Math.max(...pins.map((p) => p.y + p.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * How strings should look on this device, from the saved settings: a label mode,
 * a colour, a thickness, a curve, and the label's size and font. Unknown or
 * missing values fall back to the defaults (so an old settings file is fine).
 */
export function stringLook(custom = {}) {
  const c = custom || {};
  const text = hasKey(STRING_TEXT, c.text) ? c.text : STRING_DEFAULTS.text;
  const colour = STRING_COLOURS.some(([k]) => k === c.colour) ? c.colour : STRING_DEFAULTS.colour;
  const width = hasKey(STRING_WIDTH_PX, c.width) ? c.width : STRING_DEFAULTS.width;
  const sag = hasKey(STRING_SAG_SCALE, c.sag) ? c.sag : STRING_DEFAULTS.sag;
  const size = hasKey(STRING_TEXT_PX, c.size) ? c.size : STRING_DEFAULTS.size;
  const font = PIN_FONTS.some(([k]) => k === c.font) ? c.font : STRING_DEFAULTS.font;
  return {
    text, colour, width, sag, size, font,
    widthPx: STRING_WIDTH_PX[width],
    sagScale: STRING_SAG_SCALE[sag],
    textPx: STRING_TEXT_PX[size],
  };
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const frac3 = (n) => Math.round(clamp01(n) * 1000) / 1000;

// Where a string met its pin before string ends could move: centred on the pin's
// top edge, ten pixels down, level with the pushpin's head.
export const PUSHPIN_INSET = 10;

/**
 * Where one end of a string attaches to its pin. An offset is a fraction of the
 * pin's width and height, so the end stays in the same place on the card when the
 * card is resized (and on another screen). No offset — every string written
 * before ends could move — keeps the old spot.
 */
export function stringAnchor(pin, offset) {
  if (!offset || !Number.isFinite(Number(offset.x)) || !Number.isFinite(Number(offset.y))) {
    return { x: pin.x + pin.w / 2, y: pin.y + PUSHPIN_INSET };
  }
  return { x: pin.x + clamp01(offset.x) * pin.w, y: pin.y + clamp01(offset.y) * pin.h };
}

/** A point on the board, as an offset in fractions of its pin's width and height. */
export function offsetFromPoint(pin, point) {
  return { x: frac3((point.x - pin.x) / Math.max(1, pin.w)), y: frac3((point.y - pin.y) / Math.max(1, pin.h)) };
}

/** A saved string-end offset: fractions only, or undefined if it isn't one. */
export function cleanStringOffset(offset) {
  if (!offset || typeof offset !== "object") return undefined;
  if (!Number.isFinite(Number(offset.x)) || !Number.isFinite(Number(offset.y))) return undefined;
  return { x: frac3(offset.x), y: frac3(offset.y) };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * How a string hangs between two pushpins — the physics from the Chalkboard prototype
 * (src/utils/connectorPhysics.ts): longer strings pull tighter, so sag grows more slowly
 * than distance (12–95 units); a string being dragged bellies away from the motion; a
 * synthesised string is drawn taut. The droop is 4t(1−t)·offset, which is exactly a
 * quadratic Bézier with its control point at twice the offset from the midpoint.
 *
 * `sag` scales the droop (0 is a straight line, 1 the physical sag, more is droopier).
 */
export function stringCurve(p0, p1, { state = "red", vx = 0, vy = 0, sag: sagScale = 1 } = {}) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy);
  const tension = clamp((dist - 80) / 520, 0, 1);
  let sag = clamp(dist * 0.13 + (1 - tension) * 18, 12, 95);
  if (state === "synthesised") sag = Math.min(16, sag * 0.22);
  sag *= clamp(Number.isFinite(sagScale) ? sagScale : 1, 0, 4);
  const swayX = clamp(-vx * 0.18, -35, 35);
  const swayY = clamp(-vy * 0.12, -20, 30);
  const ox = swayX;
  const oy = sag + swayY;
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const r = (n) => Math.round(n * 10) / 10;
  return {
    d: `M${r(p0.x)},${r(p0.y)} Q${r(mx + 2 * ox)},${r(my + 2 * oy)} ${r(p1.x)},${r(p1.y)}`,
    mid: { x: mx + ox, y: my + oy },
    ctrl: { x: mx + 2 * ox, y: my + 2 * oy },
    p0: { x: p0.x, y: p0.y },
    p1: { x: p1.x, y: p1.y },
    sag,
    tension,
  };
}

/** A point on a string's curve: t 0 at one pushpin, 1 at the other. */
export function stringPointAt(curve, t) {
  const u = 1 - t;
  return {
    x: u * u * curve.p0.x + 2 * u * t * curve.ctrl.x + t * t * curve.p1.x,
    y: u * u * curve.p0.y + 2 * u * t * curve.ctrl.y + t * t * curve.p1.y,
  };
}

/**
 * A spot for a string's label: its midpoint if the word fits there, else the nearest
 * point along the string whose box covers no pin. Null when the whole string is
 * covered — the caller then only shows the label while the string is selected.
 * Frames aren't pins here: their inside is the board, not a card sitting on it.
 */
export function stringLabelSpot(curve, pins, { w = 0, h = 0, pad = 6 } = {}) {
  const half = { w: Math.max(0, w) / 2, h: Math.max(0, h) / 2 };
  const boxes = (pins || []).filter((p) => p && p.kind !== "frame").map((p) => ({ x: p.x - pad, y: p.y - pad, w: p.w + pad * 2, h: p.h + pad * 2 }));
  const covers = (box) => boxes.some((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y);
  // Start at the midpoint and slide both ways, so the word stays as close to the
  // middle of the string as the pins allow.
  const ts = [0.5];
  for (let i = 1; i <= 12; i++) {
    const d = i / 13 * 0.44;
    for (const t of [0.5 - d, 0.5 + d]) if (t > 0.06 && t < 0.94) ts.push(t);
  }
  for (const t of ts) {
    const c = stringPointAt(curve, t);
    const box = { x: c.x - half.w, y: c.y - half.h, w: half.w * 2, h: half.h * 2 };
    if (!covers(box)) return { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
  }
  return null;
}

