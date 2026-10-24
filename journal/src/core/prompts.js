// Contextual prompts without notification fatigue (design doc §7).
//
// The engine looks at context (photos without words, a recurring #topic, an
// old open question, a trip nearing its end, a calendar event you imported)
// and offers at most `budget` quiet cards on Today. There are no push
// notifications. Every card says why it appeared, can be dismissed, and takes
// feedback; categories you keep marking unhelpful fade out — visibly, and you
// can reset that in Settings. Silence is never interpreted as anything.

import { addDays, compareDays, daysBetween } from "./dates.js";

export const DEFAULT_PREFS = {
  rating_scale: 10,
  rollover_hour: 4,
  prompts: { budget: 2, evening_hour: 19, paused_until: null, disabled: [], on_this_day: true },
  feedback: {},
  muted_topics: [],
  never_kinds: [],
  simple_today: false,
};

export const PROMPT_KINDS = {
  reflect: "A moment to reflect",
  "photo-context": "Photos without words",
  "recurring-topic": "A recurring topic",
  revisit: "An old open question",
  trip: "Trip memories",
  "event-follow-up": "After a calendar event",
};

export const DEFAULT_REFLECTIONS = [
  "What felt most alive, meaningful, or difficult today?",
  "What would you like future-you to remember about today?",
  "What surprised you today, even a little?",
  "Was there a moment today you'd like to linger on?",
  "What made you laugh, or almost laugh?",
  "What took more energy than you expected — and what gave some back?",
  "Is there something from today you're still turning over?",
  "Who did you notice today?",
  "What did you learn, or unlearn?",
  "What's one small thing that went well?",
];

export function mergePrefs(p) {
  const base = structuredClone(DEFAULT_PREFS);
  if (!p) return base;
  return { ...base, ...p, prompts: { ...base.prompts, ...(p.prompts || {}) }, feedback: { ...(p.feedback || {}) } };
}

/** Laplace-smoothed share of "helpful" for a kind; n = how many ratings. */
export function kindWeight(feedback, kind) {
  const f = (feedback || {})[kind] || {};
  const h = f.helpful || 0, n = f.not || 0;
  return { weight: (h + 1) / (h + n + 2), n: h + n, helpful: h, notHelpful: n };
}

/** Kinds the engine has learned to hold back, with the evidence for it. */
export function learnedSuppressions(feedback) {
  return Object.keys(feedback || {}).map((k) => ({ kind: k, ...kindWeight(feedback, k) })).filter((w) => w.n >= 4 && w.weight < 0.3);
}

export function isMuted(prefs, topic, today) {
  if (!topic) return false;
  return (prefs.muted_topics || []).some((m) => (m.topic || m) === topic && (!m.until || compareDays(today, m.until) <= 0));
}

/**
 * Rank open questions. Returns [{q, score, reasons[]}]; scores are internal
 * ordering only — the UI shows the reasons, never a number.
 */
export function rankQuestions(questions, { today, prefs = DEFAULT_PREFS, includeSensitive = true } = {}) {
  const out = [];
  for (const q of questions) {
    if (q.status !== "open" && !(q.status === "snoozed" && q.snooze_until && compareDays(q.snooze_until.slice(0, 10), today) <= 0)) continue;
    if (q.snooze_until && compareDays(q.snooze_until.slice(0, 10), today) > 0) continue;
    if (isMuted(prefs, q.topic, today)) continue;
    if ((prefs.never_kinds || []).includes(q.kind)) continue;
    if (!includeSensitive && q.sensitivity === "high") continue;
    const reasons = [];
    let score = 1;
    if (q.origin === "self") { score += 0.4; reasons.push("You asked this yourself"); }
    else if (q.origin === "document") reasons.push("Came from a document you imported");
    else if (q.origin === "ai") reasons.push("Suggested from your entries — you accepted it");
    else if (q.origin === "rule") reasons.push("Noticed from patterns in your tags");
    const ev = (q.evidence || []).length;
    if (ev) { score += Math.min(3, ev) * 0.3; reasons.push(`Linked to ${ev} entr${ev === 1 ? "y" : "ies"}`); }
    const age = q.created ? daysBetween(q.created.slice(0, 10), today) : 0;
    if (age <= 14) { score += 0.5; reasons.push("Recent"); }
    const sinceShown = q.last_shown ? daysBetween(q.last_shown.slice(0, 10), today) : null;
    if (sinceShown == null || sinceShown > 21) { score += 0.3; if (age > 21) reasons.push(sinceShown == null ? "Not raised before" : "Not raised in a while"); }
    if (sinceShown != null && sinceShown < 3) { score *= 0.3; reasons.push("Shown recently, so ranked lower"); }
    const w = kindWeight(prefs.feedback, `q:${q.kind}`);
    score *= 0.5 + w.weight;
    if (w.n >= 2 && w.weight > 0.6) reasons.push("You've found similar questions helpful");
    if (w.n >= 2 && w.weight < 0.4) reasons.push("You've often skipped similar questions, so ranked lower");
    if (q.sensitivity === "high") reasons.push("Sensitive: only shown here, never on Today");
    out.push({ q, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Prompt cards for Today.
 * input: {today, nowHour, entries (recent, incl. today), days, questions, events,
 *         chapters, prefs, state: {date, dismissed: []}}
 */
export function todayPrompts(input) {
  const { today, nowHour = 12, entries = [], questions = [], events = [], chapters = [] } = input;
  const prefs = input.prefs || DEFAULT_PREFS;
  const state = input.state && input.state.date === today ? input.state : { date: today, dismissed: [] };
  const P = prefs.prompts || DEFAULT_PREFS.prompts;
  if (P.paused_until && compareDays(today, P.paused_until.slice(0, 10)) <= 0) return [];
  const disabled = new Set(P.disabled || []);
  const cards = [];
  const add = (card) => {
    if (disabled.has(card.kind) || state.dismissed.includes(card.id)) return;
    const w = kindWeight(prefs.feedback, card.kind);
    if (w.n >= 4 && w.weight < 0.3) return; // learned: you rarely find these helpful
    cards.push({ ...card, score: card.base * (0.5 + w.weight) });
  };
  const todays = entries.filter((e) => e.day === today && !e.deleted);

  // Photos with no words.
  const bare = todays.filter((e) => (e.media || []).some((m) => m.type === "photo") && !String(e.body || "").trim());
  const barePhotos = bare.reduce((n, e) => n + (e.media || []).filter((m) => m.type === "photo" && !m.caption).length, 0);
  if (barePhotos >= 2) {
    add({ id: `photo-context:${today}`, kind: "photo-context", base: 1.2, text: `You've saved ${barePhotos} photos today. Want to add a little context?`,
      reasons: [`${barePhotos} photos today have no caption or words yet`], action: { type: "open-entry", id: bare[0].id } });
  }

  // A recurring #topic in the last 14 days.
  const recent = entries.filter((e) => !e.deleted && compareDays(e.day, addDays(today, -14)) >= 0);
  const tagCount = new Map();
  for (const e of recent) for (const t of e.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const recurring = [...tagCount.entries()].filter(([t, n]) => n >= 3 && !isMuted(prefs, t, today)).sort((a, b) => b[1] - a[1])[0];
  if (recurring) {
    const [tag, n] = recurring;
    add({ id: `recurring-topic:${tag}:${today.slice(0, 7)}`, kind: "recurring-topic", base: 0.9, topic: tag,
      text: `#${tag} has come up ${n} times in the last two weeks. Anything you'd like to explore about it — or is it just on your mind?`,
      reasons: [`#${tag} appears in ${n} entries since ${addDays(today, -14)}`, "Repetition can mean importance, coincidence, or just a busy topic"],
      action: { type: "compose", prefill: `#${tag} ` } });
  }

  // An old open question.
  const old = rankQuestions(questions, { today, prefs, includeSensitive: false })
    .find(({ q }) => q.created && daysBetween(q.created.slice(0, 10), today) >= 21);
  if (old) {
    add({ id: `revisit:${old.q.id}:${today}`, kind: "revisit", base: 0.8, question: old.q.id,
      text: `A while ago you wondered: “${old.q.text}” Has anything changed?`, reasons: old.reasons,
      action: { type: "answer", question: old.q.id } });
  }

  // A trip/chapter nearing its end.
  for (const ch of chapters) {
    if (!ch.from || !ch.to) continue;
    if (compareDays(today, ch.from) >= 0 && compareDays(today, ch.to) <= 0 && daysBetween(today, ch.to) <= 2) {
      add({ id: `trip:${ch.id}`, kind: "trip", base: 1.1, text: `What would you like future-you to remember about ${ch.name}?`,
        reasons: [`${ch.name} ends ${ch.to === today ? "today" : `on ${ch.to}`}`], action: { type: "compose", prefill: "" } });
    }
  }

  // A calendar event that has ended today or yesterday with nothing written that day about it.
  for (const ev of events) {
    if (ev.all_day || !ev.end) continue;
    const endDay = String(ev.end).slice(0, 10);
    if (!(endDay === today || endDay === addDays(today, -1))) continue;
    if (endDay === today && Number(String(ev.end).slice(11, 13)) > nowHour) continue;
    const mentioned = entries.some((e) => e.day === ev.day && String(e.body || "").toLowerCase().includes(String(ev.title || "").toLowerCase().slice(0, 12)));
    if (mentioned) continue;
    add({ id: `event-follow-up:${ev.id}`, kind: "event-follow-up", base: 0.85, text: `Anything worth remembering from “${ev.title}”?`,
      reasons: ["From a calendar you imported", `Ended ${endDay === today ? "today" : "yesterday"}`], action: { type: "compose", prefill: "" } });
  }

  // The daily reflection: your top open question, or a gentle rotating one.
  const top = rankQuestions(questions, { today, prefs, includeSensitive: false })[0];
  const evening = nowHour >= (P.evening_hour ?? 19);
  if (top && top.q.id !== old?.q?.id) {
    add({ id: `reflect:${top.q.id}:${today}`, kind: "reflect", base: evening ? 1.3 : 0.7, question: top.q.id, text: top.q.text,
      reasons: top.reasons, action: { type: "answer", question: top.q.id } });
  } else {
    const n = Math.abs([...today].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    const text = DEFAULT_REFLECTIONS[n % DEFAULT_REFLECTIONS.length];
    add({ id: `reflect:default:${today}`, kind: "reflect", base: evening ? 1.3 : 0.6, text,
      reasons: ["A gentle daily question — optional. Skip it, answer in a sentence, or talk it through."], action: { type: "compose", prefill: "", question: text } });
  }

  cards.sort((a, b) => b.score - a.score);
  return cards.slice(0, Math.max(0, P.budget ?? 2));
}

/** Record feedback on a prompt kind. Returns new prefs. */
export function withFeedback(prefs, kind, helpful) {
  const fb = { ...(prefs.feedback || {}) };
  const cur = { helpful: 0, not: 0, ...(fb[kind] || {}) };
  if (helpful) cur.helpful++; else cur.not++;
  fb[kind] = cur;
  return { ...prefs, feedback: fb };
}
