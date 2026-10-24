// The journal's data model. Every record is a plain object; fields starting
// with "_" are device-local (sync bookkeeping, caches) and never leave the
// device. See docs/DATA-FORMAT.md for the on-disk format these map to.
//
// The central rule (design doc §21): original material and interpretations are
// different record types. Entries and days are yours. Interpretations, claims,
// proposals and questions are layers *about* them, each carrying who authored it.

import { isoLocal, dayKey, deviceTimeZone, DEFAULT_ROLLOVER_HOUR } from "./dates.js";
import { newId } from "./ids.js";

export const RECORD_TYPES = ["entry", "day", "event", "claim", "proposal", "question", "interpretation", "config", "report"];

export const ENTRY_KINDS = {
  text: "Writing",
  voice: "Voice note",
  photo: "Photos",
  conversation: "Conversation",
  document: "Document",
  import: "Imported",
};

// normal: synced, searchable, AI may read it when you ask for AI help.
// no-ai:  synced and searchable, but never sent to any AI (in-app or steward).
// sealed: encrypted on this device with your passphrase before it is stored or
//         synced. Nothing — GitHub, the steward, the app while locked — can read it.
export const PRIVACY_LEVELS = {
  normal: { label: "Normal", hint: "Synced and searchable. AI reads it only when you ask for AI help." },
  "no-ai": { label: "No AI", hint: "Synced and searchable, never sent to any AI — in the app or by a steward session." },
  sealed: { label: "Sealed", hint: "Encrypted with your passphrase before it is saved or synced. Unreadable without it." },
};

export const CLAIM_SECTIONS = [
  { id: "orientation", label: "Current orientation", hint: "What occupies your attention, what you care about now, what you are trying to understand." },
  { id: "emotional", label: "Emotional landscape", hint: "Recurring feelings, possible triggers, sources of relief, what has helped." },
  { id: "ideas", label: "Ideas and evolving beliefs", hint: "Concepts you are developing, assumptions you are questioning." },
  { id: "changes", label: "Changes over time", hint: "How priorities, habits and interpretations differ from earlier periods." },
  { id: "open", label: "Open questions and possible blind spots", hint: "Unresolved questions, tensions between values, alternative explanations." },
  { id: "growth", label: "Growth and experiments", hint: "Things you want to change, experiments tried, what you learned." },
];
export const SECTION_IDS = CLAIM_SECTIONS.map((s) => s.id);

// Verbal confidence on purpose: a number would pretend to a precision we don't have.
export const CONFIDENCE_LEVELS = {
  tentative: "A first guess from little evidence",
  moderate: "Several consistent entries, few counterexamples",
  strong: "Consistent across time and contexts",
};

export const STANCES = { supports: "supports", complicates: "complicates", contradicts: "contradicts" };

export const PROPOSAL_OPS = {
  "add-claim": "New pattern",
  "revise-claim": "Revision",
  "retire-claim": "Retire",
  "add-question": "Question",
  "link-entries": "Connection",
};

export const REJECT_REASONS = [
  { id: "inaccurate", label: "Not accurate" },
  { id: "presumptuous", label: "Too presumptuous" },
  { id: "not-useful", label: "True but not useful" },
  { id: "already-known", label: "Already know this" },
  { id: "sensitive", label: "Don't raise this kind of thing" },
];

export const QUESTION_KINDS = {
  revisit: "Worth revisiting",
  tension: "A possible tension",
  gap: "Something unexplored",
  connection: "A connection",
  surprise: "A surprise",
  "follow-up": "Follow-up",
  document: "From a document",
  custom: "Your question",
};

export const EMOTION_SUGGESTIONS = [
  "calm", "joyful", "grateful", "curious", "amused", "connected", "proud", "relieved", "energised", "peaceful",
  "surprised", "conflicted", "tired", "anxious", "frustrated", "sad", "lonely", "overwhelmed", "restless", "homesick",
];

export function nowIso(tz = deviceTimeZone()) {
  return isoLocal(new Date(), tz);
}

// Defaults first, then every defined field the caller passed (an explicit
// undefined never erases a default), then the fixed type.
function build(defaults, fields, type) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(fields || {})) if (v !== undefined) out[k] = v;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  out.type = type;
  return out;
}

export function makeEntry(fields = {}, { tz = deviceTimeZone(), rolloverHour = DEFAULT_ROLLOVER_HOUR, now = new Date() } = {}) {
  const created = fields.created || isoLocal(now, tz);
  return build({
    id: newId("e", created),
    kind: "text",
    day: dayKey(now, tz, rolloverHour),
    created,
    updated: created,
    tz,
    author: "self",
    privacy: "normal",
    tags: [],
    media: [],
    body: "",
  }, fields, "entry");
}

export function makeDay(date, fields = {}) {
  return build({ date }, { ...fields, id: date, date }, "day");
}

export function makeClaim(fields, { now = nowIso() } = {}) {
  const origin = fields.origin || "self";
  return build({
    id: newId("c", now),
    section: "orientation",
    statement: "",
    status: "active",
    origin,
    confidence: "tentative",
    evidence: [],
    alternatives: [],
    created: now,
    updated: now,
    history: [{ at: now, action: "created", by: origin === "self" ? "self" : (fields.by || "ai"), statement: fields.statement || "" }],
  }, fields, "claim");
}

export function makeProposal(fields, { now = nowIso() } = {}) {
  return build({
    id: newId("p", now),
    op: "add-claim",
    status: "pending",
    created: now,
    author: "ai",
    evidence: [],
    alternatives: [],
  }, fields, "proposal");
}

export function makeQuestion(fields, { now = nowIso() } = {}) {
  return build({
    id: newId("q", now),
    text: "",
    kind: "custom",
    origin: "self",
    sensitivity: "low",
    status: "open",
    created: now,
    updated: now,
    evidence: [],
    answers: [],
  }, fields, "question");
}

export function makeInterpretation(fields, { now = nowIso() } = {}) {
  return build({
    id: newId("i", now),
    kind: "summary",
    of: [],
    author: "ai",
    status: "kept",
    created: now,
    body: "",
  }, fields, "interpretation");
}

export function makeEvent(fields) {
  return build({ id: newId("v", fields.start) }, fields, "event");
}

/** Is this entry allowed to be read by any AI (in-app or steward)? */
export function aiReadable(rec) {
  if (!rec || rec.deleted) return false;
  if (rec.privacy === "no-ai" || rec.privacy === "sealed" || rec.sealed) return false;
  if (rec.kind === "document" && rec.document && rec.document.ai_allowed === false) return false;
  return true;
}

/** Plain text of an entry for search, AI context and evidence checks. */
export function entryText(e) {
  if (!e) return "";
  const parts = [];
  if (e.title) parts.push(e.title);
  if (e.body) parts.push(e.body);
  for (const m of e.media || []) if (m.caption) parts.push(m.caption);
  if (e.document) {
    if (e.document.title) parts.push(e.document.title);
    if (e.document.text) parts.push(e.document.text);
  }
  return parts.join("\n\n");
}

export function dayText(d) {
  if (!d) return "";
  return [d.best && `Best: ${d.best}`, d.hardest && `Hardest: ${d.hardest}`, d.body].filter(Boolean).join("\n");
}

/** Normalised 0..1 rating, or null when missing. Missing is never zero. */
export function normRating(day) {
  if (!day || day.rating == null || day.rating === "") return null;
  const v = Number(day.rating);
  const scale = Number(day.rating_scale) || 10;
  if (!Number.isFinite(v)) return null;
  const min = scale === 5 || scale === 10 ? 1 : 0;
  return Math.max(0, Math.min(1, (v - min) / (scale - min)));
}

export function validateRecord(rec) {
  const errors = [];
  if (!rec || typeof rec !== "object") return ["not an object"];
  if (!rec.id) errors.push("missing id");
  if (!RECORD_TYPES.includes(rec.type)) errors.push(`unknown type "${rec.type}"`);
  if (rec.deleted) return errors;
  switch (rec.type) {
    case "entry":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.day || "")) errors.push("entry.day must be YYYY-MM-DD");
      if (!rec.created) errors.push("entry.created missing");
      if (rec.kind && !ENTRY_KINDS[rec.kind]) errors.push(`unknown entry kind "${rec.kind}"`);
      if (rec.privacy && !PRIVACY_LEVELS[rec.privacy]) errors.push(`unknown privacy "${rec.privacy}"`);
      if (rec.privacy === "sealed" && !rec.sealed && rec.body) errors.push("sealed entry has plaintext body");
      break;
    case "day":
      if (rec.id !== rec.date) errors.push("day id must equal its date");
      if (rec.rating != null) {
        const s = Number(rec.rating_scale) || 10;
        const v = Number(rec.rating);
        if (!Number.isFinite(v) || v < 0 || v > s) errors.push(`rating ${rec.rating} outside scale ${s}`);
      }
      break;
    case "claim":
      if (!SECTION_IDS.includes(rec.section)) errors.push(`unknown section "${rec.section}"`);
      if (!rec.statement) errors.push("claim has no statement");
      if (rec.confidence && !CONFIDENCE_LEVELS[rec.confidence]) errors.push(`unknown confidence "${rec.confidence}"`);
      break;
    case "proposal":
      if (!PROPOSAL_OPS[rec.op]) errors.push(`unknown op "${rec.op}"`);
      if (rec.predicted_acceptance != null && !(rec.predicted_acceptance >= 0 && rec.predicted_acceptance <= 1)) errors.push("predicted_acceptance must be 0..1");
      break;
    case "question":
      if (!rec.text) errors.push("question has no text");
      break;
  }
  return errors;
}
