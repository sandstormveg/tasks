// The curator: checks a corkboard's connections against the Atlas's rules, and
// finds the connections most worth your attention. It reports; it never decides.
//
// The rules come from the Atlas (atlas_infodex docs/connection-tiers.md and
// docs/mereotopology-sheaf-governance.md), applied to the board's own geometry:
//
// - Frames are regions, and what sits inside a frame is part of it. A frame's
//   address (domain, perspective, scale, time) is where its contents hold.
// - A connection across a boundary (its ends live in different domains) is a
//   bridge. Bridges are where insight lives, and also where meaning leaks: to
//   synthesise one you say what kind of connection it is (a tier), where it
//   holds and where it breaks.
// - Chains don't carry across boundaries: A–B holding in one domain and B–C in
//   another doesn't make A–C hold anywhere. A synthesised A–C that relies on
//   such a chain without its own bounds gets flagged.
// - A contradiction needs aligned addresses first; across frames it may only be
//   a difference of scope.
// - Surprise: a true connection between things that looked far apart (the
//   Atlas's surprise score — prediction error that turns out to be right).

import { TIERS, framesOf, addressOf, pinTokens } from "./boards.js";

const CONTRADICTS = /\b(contradict\w*|conflicts? with|refutes?|incompatible|versus|vs\.?)\b/i;

const sameDomain = (a, b) => !!(a?.domain && b?.domain && a.domain.toLowerCase() === b.domain.toLowerCase());
const differentDomain = (a, b) => !!(a?.domain && b?.domain && a.domain.toLowerCase() !== b.domain.toLowerCase());

function context(parts, cardsById = {}, sourcesById = {}) {
  const byId = Object.fromEntries(parts.pins.map((p) => [p.id, p]));
  const addr = {};
  for (const p of parts.pins) addr[p.id] = addressOf(p, parts.pins, cardsById);
  return { byId, addr, cardsById, sourcesById };
}

const name = (p) => (p ? p.title || p.body?.split("\n")[0]?.slice(0, 60) || p.kind : "?");

/**
 * What a string needs before it can be synthesised, as a list of problems
 * (empty = fine). `patch` is what you're about to save (synthesisPatch).
 */
export function checkSynthesis(parts, string, patch, { cards = {}, sources = {} } = {}) {
  const cx = context(parts, cards, sources);
  const problems = [];
  if (!String(patch.body || "").trim()) problems.push({ field: "text", text: "Write how these two connect — that's what synthesising is." });
  const a = cx.addr[string.from];
  const b = cx.addr[string.to];
  const bridge = differentDomain(a, b);
  const chain = bridge ? null : leakyChain(parts, string, cx);
  if (bridge && !patch.tier) problems.push({ field: "tier", text: `This crosses from ${a.domain} to ${b.domain}: say what kind of connection it is.` });
  if (chain && !(patch.holds_in && patch.breaks_at)) {
    problems.push({ field: "holds_in", text: `These are also linked through “${name(cx.byId[chain.mid])}”, but that chain holds in “${chain.h1}” on one side and “${chain.h2}” on the other — chains don't carry across. Say where this connection holds on its own, and where it breaks.` });
  } else {
    if ((patch.tier || bridge) && !patch.holds_in) problems.push({ field: "holds_in", text: "Say where this connection holds." });
    if ((patch.tier || bridge) && !patch.breaks_at) problems.push({ field: "breaks_at", text: "Say where it stops working — every connection breaks somewhere." });
  }
  if (CONTRADICTS.test(`${patch.label || string.label || ""} ${patch.body || ""}`) && bridge) {
    problems.push({ field: "address", soft: true, text: `Before calling this a contradiction: one side holds in ${a.domain}, the other in ${b.domain}. A difference of scope isn't a contradiction.` });
  }
  return problems;
}

/** Where a synthesised string holds: its own "holds in", else the domain both ends share. */
function holdsIn(s, cx) {
  if (s.holds_in) return s.holds_in;
  const a = cx.addr[s.from];
  const b = cx.addr[s.to];
  return sameDomain(a, b) ? a.domain : null;
}

/** A two-step chain from one end of `string` to the other whose legs hold in different places. */
function leakyChain(parts, string, cx) {
  const legs = parts.strings.filter((s) => s.state === "synthesised" && s.id !== string.id);
  const other = (s, x) => (s.from === x ? s.to : s.from);
  for (const s1 of legs.filter((s) => s.from === string.from || s.to === string.from)) {
    const mid = other(s1, string.from);
    const s2 = legs.find((s) => s !== s1 && (s.from === mid || s.to === mid) && other(s, mid) === string.to);
    if (!s2) continue;
    const h1 = holdsIn(s1, cx);
    const h2 = holdsIn(s2, cx);
    if (h1 && h2 && h1.toLowerCase() !== h2.toLowerCase()) return { mid, h1, h2, legs: [s1.id, s2.id] };
  }
  return null;
}

/** Strength of a connection on the Atlas ladder (untiered synthesised strings count as a heuristic analogy). */
export function strengthOf(s) {
  return (TIERS[s.tier] || TIERS.heuristic_analogy).strength;
}

function hopsWithout(parts, from, to, skipId) {
  const adj = {};
  for (const s of parts.strings) {
    if (s.id === skipId) continue;
    (adj[s.from] ||= []).push(s.to);
    (adj[s.to] ||= []).push(s.from);
  }
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; d <= 8 && frontier.length; d++) {
    const next = [];
    for (const x of frontier) for (const y of adj[x] || []) {
      if (y === to) return d;
      if (!seen.has(y)) { seen.add(y); next.push(y); }
    }
    frontier = next;
  }
  return Infinity;
}

/**
 * Surprise for a synthesised string: strength × (0.4 structural + 0.3 lexical + 0.3 domain).
 * Structural: how far apart the ends are without this string. Lexical: how little their text
 * shares. Domain: whether they live in different domains (0.5 when unknown).
 */
export function surpriseOf(parts, s, cx) {
  const hops = hopsWithout(parts, s.from, s.to, s.id);
  const structural = hops === Infinity ? 1 : Math.min(1, (hops - 1) / 4);
  const lookups = { cards: cx.cardsById, sources: cx.sourcesById };
  const ta = pinTokens(cx.byId[s.from], lookups);
  const tb = pinTokens(cx.byId[s.to], lookups);
  const union = new Set([...ta, ...tb]).size;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const lexical = union ? 1 - shared / union : 0.5;
  const a = cx.addr[s.from];
  const b = cx.addr[s.to];
  const domain = differentDomain(a, b) ? 1 : sameDomain(a, b) ? 0 : 0.5;
  const score = strengthOf(s) * (0.4 * structural + 0.3 * lexical + 0.3 * domain);
  return { score: Math.round(score * 100) / 100, structural, lexical: Math.round(lexical * 100) / 100, domain, hops };
}

function rel(f, g) {
  const ix = Math.max(0, Math.min(f.x + f.w, g.x + g.w) - Math.max(f.x, g.x));
  const iy = Math.max(0, Math.min(f.y + f.h, g.y + g.h) - Math.max(f.y, g.y));
  if (!ix || !iy) return "disjoint";
  const fin = g.x <= f.x && g.y <= f.y && f.x + f.w <= g.x + g.w && f.y + f.h <= g.y + g.h;
  const gin = f.x <= g.x && f.y <= g.y && g.x + g.w <= f.x + f.w && g.y + g.h <= f.y + f.h;
  if (fin) return "inside";
  if (gin) return "contains";
  return "overlap";
}

/**
 * Everything worth saying about a board: findings (checks, reminders) and its
 * most surprising synthesised connections. `cards`/`sources` are lookups by id.
 */
export function curate(parts, { cards = {}, sources = {} } = {}) {
  const cx = context(parts, cards, sources);
  const findings = [];
  const red = parts.strings.filter((s) => s.state !== "synthesised");
  const synth = parts.strings.filter((s) => s.state === "synthesised");
  const items = parts.pins.filter((p) => p.kind !== "frame");
  const frames = parts.pins.filter((p) => p.kind === "frame");

  if (red.length) {
    const byClaude = red.filter((s) => String(s.author || "").startsWith("ai:") || s.author === "claude" || s.author === "claude-code").length;
    findings.push({ kind: "red", level: "info", strings: red.map((s) => s.id),
      text: `${red.length} red string${red.length === 1 ? "" : "s"}: connections noticed but not synthesised yet${byClaude ? ` (${byClaude} proposed by Claude)` : ""}.` });
  }
  const linked = new Set(parts.strings.flatMap((s) => [s.from, s.to]));
  const loose = items.filter((p) => !linked.has(p.id));
  if (loose.length) findings.push({ kind: "loose", level: "info", pins: loose.map((p) => p.id), text: `${loose.length} pin${loose.length === 1 ? "" : "s"} not connected to anything yet.` });

  // Synthesised strings that don't meet the rules (written on another device, by an old version, or by hand).
  // A chain that leaks across a boundary gets its own explanation.
  for (const s of synth) {
    const chain = differentDomain(cx.addr[s.from], cx.addr[s.to]) ? null : leakyChain(parts, s, cx);
    if (chain && !(s.holds_in && s.breaks_at)) {
      findings.push({ kind: "leak", level: "warn", strings: [s.id, ...chain.legs], pins: [s.from, chain.mid, s.to],
        text: `“${name(cx.byId[s.from])}” – “${name(cx.byId[s.to])}” may lean on the chain through “${name(cx.byId[chain.mid])}”, which holds in “${chain.h1}” on one side and “${chain.h2}” on the other. Chains don't carry across boundaries: say where this connection holds on its own.` });
      continue;
    }
    const problems = checkSynthesis(parts, s, s, { cards, sources }).filter((p) => !p.soft);
    if (problems.length) findings.push({ kind: "unbounded", level: "check", strings: [s.id], pins: [s.from, s.to],
      text: `“${name(cx.byId[s.from])}” – “${name(cx.byId[s.to])}”: ${problems.map((p) => p.text).join(" ")}` });
  }

  // Contradictions across frames: align the addresses first.
  for (const s of parts.strings) {
    if (!CONTRADICTS.test(`${s.label || ""} ${s.state === "synthesised" ? s.body || "" : ""}`)) continue;
    const a = cx.addr[s.from];
    const b = cx.addr[s.to];
    if (differentDomain(a, b) || (a?.scale && b?.scale && a.scale !== b.scale) || (a?.time && b?.time && a.time !== b.time)) {
      findings.push({ kind: "scope", level: "check", strings: [s.id], pins: [s.from, s.to],
        text: `“${name(cx.byId[s.from])}” vs “${name(cx.byId[s.to])}”: these sit at different addresses (${[a?.domain, a?.scale, a?.time].filter(Boolean).join(", ")} / ${[b?.domain, b?.scale, b?.time].filter(Boolean).join(", ")}). Is it a contradiction, or a difference of scope?` });
    }
  }

  // Frames that partly overlap: whatever sits in the overlap belongs to both.
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    if (rel(frames[i], frames[j]) !== "overlap") continue;
    const both = items.filter((p) => framesOf(p, parts.pins).some((f) => f.id === frames[i].id) && framesOf(p, parts.pins).some((f) => f.id === frames[j].id));
    if (both.length) findings.push({ kind: "overlap", level: "info", pins: [frames[i].id, frames[j].id, ...both.map((p) => p.id)],
      text: `Frames “${name(frames[i])}” and “${name(frames[j])}” overlap: ${both.length} pin${both.length === 1 ? " sits" : "s sit"} in both. Is that what you mean?` });
  }

  const insights = synth.map((s) => ({ string: s.id, from: s.from, to: s.to, ...surpriseOf(parts, s, cx) }))
    .filter((x) => x.score >= 0.25)
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
  const bridges = parts.strings.filter((s) => differentDomain(cx.addr[s.from], cx.addr[s.to])).map((s) => s.id);
  return { findings, insights, bridges };
}
