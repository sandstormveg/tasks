// Primer notes: a per-note opt-in that lets Another World (a game in the Adventurer app) draw on a
// note's abstract themes ("starting things", "asking for help"), never its words.
//
// Why it's built this way:
// - The toggle is yours, on the entry (`primer: { id, on, at }`), off unless you turn it on. Its id
//   is random, not the entry's, so the feed can't be joined back to a note by anyone outside the
//   journal.
// - Themes come only from PRIMER_THEMES, a fixed list of abstract themes. A steward (Claude, via
//   `journal.mjs primer`) picks 1–3 per note, reading the note through the privacy gate below;
//   anything not on the list is refused. So the feed can never carry a name, a place, a person,
//   a quote or any of your words, however the choosing goes.
// - The themes are an interpretation record (`kind: primer`, authored), never an edit to the entry
//   (invariant 1).
// - The feed (tasks-data `primer/themes.jsonl`) is the only thing the game reads. Turning a note
//   off, here or in Adventurer (which may set `untoggledAt` on its line), sticks: the line keeps
//   its `untoggledAt` and has no themes until you turn the note on again here, later than that.
//
// Pure: runs in Node (the steward tool) and the browser (the toggle).

import { aiReadable, entryText } from "./model.js";

export const PRIMER_THEMES = [
  // beginnings and endings
  "starting things", "finishing things", "letting go", "new beginnings", "endings", "returning", "waiting",
  // effort and work
  "persistence", "hard work", "craft", "practice", "learning", "mastery", "making things", "planning",
  "getting unstuck", "momentum", "overwhelm", "focus", "distraction", "procrastination", "routine",
  // others
  "asking for help", "offering help", "friendship", "belonging", "loneliness", "trust", "conflict",
  "repair", "forgiveness", "gratitude", "generosity", "being seen", "solitude", "family", "community",
  "teaching", "being taught", "rivalry", "loyalty",
  // inner weather
  "courage", "fear", "doubt", "hope", "curiosity", "wonder", "joy", "grief", "anger", "calm",
  "restlessness", "shame", "pride", "relief", "longing", "nostalgia", "contentment", "frustration",
  "patience", "vulnerability", "resilience", "self-kindness", "self-doubt", "acceptance",
  // change and choice
  "change", "choosing", "uncertainty", "risk", "freedom", "responsibility", "limits", "boundaries",
  "balance", "rest", "recovery", "health", "growth", "transformation", "identity", "values", "meaning",
  "purpose", "ambition", "play", "exploration", "discovery", "home", "journeys", "time passing",
  "small victories", "setbacks", "surprise", "simplicity", "care", "nature", "seasons",
];
const VOCAB = new Set(PRIMER_THEMES);
export const MAX_THEMES = 3;

/** A new opaque id for a note's primer line: random, unrelated to the entry's id. */
export function newPrimerId() {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  return `pm-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** The entry's primer toggle after you flip it (keeps its opaque id across flips). */
export function togglePrimer(entry, on, now) {
  const prev = entry?.primer && typeof entry.primer === "object" ? entry.primer : null;
  return { id: prev?.id && /^pm-[0-9a-f]{8,}$/.test(prev.id) ? prev.id : newPrimerId(), on: !!on, at: now };
}

/** Why a note can't be a Primer note right now, or "" if it can. */
export function whyNotPrimer(entry) {
  if (!entry || entry.type !== "entry") return "Only journal notes can be Primer notes.";
  if (!aiReadable(entry)) return "No-AI, sealed and uncleared notes never go to an AI, so they can't be Primer notes.";
  return "";
}

const isOn = (e) => !!(e?.primer && e.primer.on === true && e.primer.id);
const t = (iso) => { const n = Date.parse(iso || ""); return Number.isFinite(n) ? n : NaN; };

/** Only themes from the list, at most three, in a stable order. Returns { themes, refused }. */
export function cleanThemes(list) {
  const themes = [];
  const refused = [];
  for (const raw of Array.isArray(list) ? list : String(list || "").split(",")) {
    const x = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!x) continue;
    if (!VOCAB.has(x)) refused.push(x);
    else if (!themes.includes(x)) themes.push(x);
  }
  return { themes: themes.slice(0, MAX_THEMES), refused };
}

/** The newest primer interpretation for each entry: entryId → record. */
function latestThemes(interpretations) {
  const out = new Map();
  for (const i of interpretations || []) {
    if (i.type !== "interpretation" || i.kind !== "primer" || i.deleted || i.status === "rejected") continue;
    const id = Array.isArray(i.of) ? i.of[0] : i.of;
    const prev = out.get(id);
    if (!prev || t(i.created) >= t(prev.created)) out.set(id, i);
  }
  return out;
}

/** Themes saved for this toggling of the note (made after it was last turned on), or null. */
function currentThemes(entry, latest) {
  const i = latest.get(entry.id);
  if (!i || !(t(i.created) >= t(entry.primer.at))) return null;
  const { themes } = cleanThemes(i.themes);
  return themes.length ? themes : null;
}

/**
 * The privacy gate for Primer: the notes a steward may read to choose themes. Only notes that are
 * on, AI-readable (not No-AI, sealed or uncleared) and still waiting for themes; their text only.
 */
export function primerPending(entries, interpretations) {
  const latest = latestThemes(interpretations);
  return (entries || [])
    .filter((e) => e.type === "entry" && isOn(e) && aiReadable(e) && !currentThemes(e, latest))
    .map((e) => ({ entry: e.id, text: entryText(e) }));
}

/** A primer interpretation: the themes a steward chose for one note. */
export function primerInterpretation(entry, list, { now, author = "claude-code", id }) {
  const why = whyNotPrimer(entry);
  if (why) throw new Error(why);
  if (!isOn(entry)) throw new Error("That note isn't a Primer note (its owner hasn't turned Primer on).");
  const { themes, refused } = cleanThemes(list);
  if (refused.length) throw new Error(`Not on the theme list: ${refused.join(", ")}. Choose from PRIMER_THEMES (journal primer pending lists them).`);
  if (!themes.length) throw new Error("Choose 1–3 themes.");
  return { id, type: "interpretation", kind: "primer", of: [entry.id], author, status: "kept", created: now, themes, body: "" };
}

/** Read a themes.jsonl file into lines (skipping anything malformed). */
export function parseFeed(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const x = JSON.parse(line);
      if (x && typeof x.id === "string") out.push(x);
    } catch { /* a broken line is dropped, never guessed at */ }
  }
  return out;
}

/**
 * The feed: one line per Primer note, themes only. Lines already in the file are merged so an
 * un-toggle from either side sticks. Returns { lines, text, count } (count: notes with themes).
 */
export function buildFeed(entries, interpretations, existing = [], { now }) {
  const latest = latestThemes(interpretations);
  const old = new Map(existing.map((l) => [l.id, l]));
  const lines = new Map();
  const off = (id, prev, at) => ({ id, toggledAt: prev?.toggledAt || at || now, themes: [], untoggledAt: prev?.untoggledAt || at || now });
  for (const e of entries || []) {
    const p = e.type === "entry" && e.primer && typeof e.primer === "object" ? e.primer : null;
    if (!p?.id || !/^pm-[0-9a-f]{8,}$/.test(p.id)) continue;
    const prev = old.get(p.id);
    if (!isOn(e) || !aiReadable(e)) {
      // Turned off here, or the note became No-AI, sealed or deleted: off, and stays off.
      if (prev || p.on === false) lines.set(p.id, off(p.id, prev, p.on === false ? p.at : now));
      continue;
    }
    // Turned off in Adventurer after this toggling: that sticks until turned on again here.
    if (prev?.untoggledAt && !(t(p.at) > t(prev.untoggledAt))) { lines.set(p.id, off(p.id, prev)); continue; }
    const themes = currentThemes(e, latest);
    if (themes) lines.set(p.id, { id: p.id, toggledAt: p.at, themes, untoggledAt: null });
    // Turned on again and waiting for this toggling's themes: the old ones aren't shown meanwhile.
    else if (prev) lines.set(p.id, { id: p.id, toggledAt: prev.toggledAt, themes: [], untoggledAt: prev.untoggledAt ?? null });
  }
  // Lines for notes that are gone from the journal: off.
  for (const [id, prev] of old) if (!lines.has(id)) lines.set(id, off(id, prev));
  const sorted = [...lines.values()].sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => ({ id: l.id, toggledAt: l.toggledAt, themes: l.themes, untoggledAt: l.untoggledAt ?? null }));
  return { lines: sorted, text: sorted.map((l) => JSON.stringify(l)).join("\n") + (sorted.length ? "\n" : ""), count: sorted.filter((l) => l.themes.length).length };
}
