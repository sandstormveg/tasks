// Helping you remember a day you're catching up on. Two well-tested ideas:
//
// - Reconstruct the day as a sequence of episodes, morning to night (the Day
//   Reconstruction Method; Kahneman, Krueger, Schkade, Schwarz & Stone, 2004).
//   Walking through a day in order, with where / what / who for each part,
//   brings back more than one global "how was it?" and is less coloured by how
//   the day ended.
// - Reinstate the context first (the Cognitive Interview; Fisher & Geiselman,
//   1992). Records of what you did — tasks finished, notes, calendar events,
//   what you wrote the day before — are retrieval cues.
//
// Cues are shown as records and are never written into an entry for you: a cue
// can also suggest a memory that didn't happen (the misinformation effect;
// Loftus), so what you remember stays in your own words, beside — not mixed
// with — what the records say.

import { dayKey, addDays } from "./dates.js";
import { plainExcerpt } from "./markdown.js";

export const RECALL_STEPS = [
  { id: "woke", label: "Waking up", q: "Start where you woke up. Where were you, and what was the first thing you did?" },
  { id: "morning", label: "Morning", q: "What happened in the morning? Where were you, and who were you with?" },
  { id: "midday", label: "Midday", q: "The middle of the day — a meal, a place, a conversation?" },
  { id: "afternoon", label: "Afternoon", q: "What did the afternoon hold?" },
  { id: "evening", label: "Evening", q: "And the evening — where were you, and how did the day end?" },
  { id: "keep", label: "Worth keeping", q: "One thing from this day you'd like to remember." },
];

/** Your answers, in order, under their labels. Empty steps are left out; nothing is added. */
export function assembleWalkthrough(answers = {}) {
  return RECALL_STEPS
    .map((s) => [s.label, String(answers[s.id] || "").trim()])
    .filter(([, text]) => text)
    .map(([label, text]) => `**${label}** — ${text}`)
    .join("\n\n");
}

/**
 * The journal day a Tasks date belongs to. Timestamps ("…T…Z") are placed by
 * your time zone and rollover hour. Bare dates are kept as written — note that
 * the tasks app writes them in UTC, so something done before ~7am in Vietnam is
 * dated the previous day.
 */
export function tasksDateToDay(value, { tz, rolloverHour = 4 } = {}) {
  const s = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : dayKey(d, tz, rolloverHour);
  }
  return null;
}

/**
 * What your tasks say about one day: tasks finished, tasks added, and notes
 * written. `sources` is a list of { label, tasks, history } (e.g. private and
 * public). Returns [{ kind: "done"|"added"|"note", title, text, category, source }].
 */
export function taskCuesForDay(day, sources = [], opts = {}) {
  const out = [];
  const seen = new Set();
  const push = (cue) => {
    const key = `${cue.kind}|${cue.title}|${cue.text || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cue);
  };
  const notesOn = (item, source) => {
    for (const n of item.noteItems || []) {
      if (n && tasksDateToDay(n.created, opts) === day && String(n.text || "").trim()) {
        push({ kind: "note", title: item.title || "", text: plainExcerpt(n.text, 160), category: item.category || "", source });
      }
    }
  };
  for (const src of sources) {
    for (const h of src.history || []) {
      if (tasksDateToDay(h.completedDate, opts) === day) {
        push({ kind: "done", title: h.title || "", text: plainExcerpt(h.note || "", 160), category: h.category || "", source: src.label });
      }
      notesOn(h, src.label);
    }
    for (const t of src.tasks || []) {
      if (tasksDateToDay(t.created, opts) === day) push({ kind: "added", title: t.title || "", text: "", category: t.category || "", source: src.label });
      notesOn(t, src.label);
    }
  }
  const order = { done: 0, note: 1, added: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/**
 * What you wrote on the days either side — often the quickest way back into a
 * day. Sealed entries are skipped (they may be locked, and they're private).
 */
export function neighbourCues(day, { entries = [], days = [] } = {}) {
  const out = [];
  for (const [offset, when] of [[-1, "before"], [1, "after"]]) {
    const d = addDays(day, offset);
    const written = entries.filter((e) => e.day === d && !e.deleted && !e.sealed && (e.body || e.title));
    const rec = days.find((x) => x.id === d || x.date === d);
    const bits = [];
    for (const e of written.slice(0, 2)) bits.push(plainExcerpt(e.title ? `${e.title}. ${e.body || ""}` : e.body, 140));
    if (rec?.best) bits.push(`Best moment: ${plainExcerpt(rec.best, 100)}`);
    if (bits.length) out.push({ day: d, when, bits });
  }
  return out;
}
