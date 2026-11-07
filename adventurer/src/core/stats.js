// The status screen's maths: where a value sits in a population (percentile),
// what tier that earns, and the XP, level and guild rank built from evidence —
// finished quests and finished tasks. Pure; the data lives in norms.js.
//
// The XP is reflexive: it only comes from things that happened (a turned-in
// quest, a completed task), and verified proof pays more than your word. A
// measurement you type in moves a tier but never pays XP, so tiers say where
// you are and XP says what you've done.
//
// Missing is not zero: an attribute with no measurement and no evidence shows
// as unranked, never as F.

import { METRICS, ATTRIBUTES } from "./norms.js";
import { localDay } from "./quests.js";

export const TIERS = [
  { id: "F", min: 0, label: "Unawakened" },
  { id: "E", min: 10, label: "Novice" },
  { id: "D", min: 30, label: "Apprentice" },
  { id: "C", min: 50, label: "Adept" },
  { id: "B", min: 70, label: "Veteran" },
  { id: "A", min: 85, label: "Elite" },
  { id: "S", min: 95, label: "Hero" },
  { id: "SS", min: 99, label: "Legend" },
];

/** GeoGuild's guild ranks, by total XP. */
export const RANKS = [
  { id: "E", title: "Novice Pathfinder", min: 0 },
  { id: "D", title: "Iron Wayfarer", min: 200 },
  { id: "C", title: "Bronze Vanguard", min: 600 },
  { id: "B", title: "Silver Scoutmaster", min: 1400 },
  { id: "A", title: "Golden Sovereign", min: 2800 },
  { id: "S", title: "Mythic Vanguard", min: 5000 },
];

/** XP for a finished task, by the tracker's own record. */
export const TASK_XP = 15;

export function percentile(value, cdf) {
  if (!Number.isFinite(value) || !cdf.length) return null;
  if (value <= cdf[0][0]) return cdf[0][1];
  for (let i = 1; i < cdf.length; i++) {
    const [x1, p1] = cdf[i];
    if (value <= x1) {
      const [x0, p0] = cdf[i - 1];
      return x1 === x0 ? p1 : p0 + ((value - x0) / (x1 - x0)) * (p1 - p0);
    }
  }
  return cdf[cdf.length - 1][1];
}

/** The value at a percentile: how far to the next tier. */
export function valueAt(p, cdf) {
  if (p <= cdf[0][1]) return cdf[0][0];
  for (let i = 1; i < cdf.length; i++) {
    const [x1, p1] = cdf[i];
    if (p <= p1) {
      const [x0, p0] = cdf[i - 1];
      return p1 === p0 ? x1 : x0 + ((p - p0) / (p1 - p0)) * (x1 - x0);
    }
  }
  return cdf[cdf.length - 1][0];
}

export function tierOf(p) {
  if (p == null) return null;
  let t = TIERS[0];
  for (const x of TIERS) if (p >= x.min) t = x;
  return t;
}

export function nextTier(t) {
  const i = TIERS.findIndex((x) => x.id === t?.id);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

// Levels: quick at first, then each a little dearer — +40 XP a level (60, 100, 140…), so the
// first few come from a quest or two and Lv 20 takes months. Steady growth, never a wall.
export const levelNeed = (level) => 20 + 40 * level;
/** An attribute's own level, from the XP earned in it: the same shape, cheaper (15, 25, 35…). */
export const attrNeed = (level) => 5 + 10 * level;
export const LEVEL_NOTE = "Levels come quick at first, then each costs a bit more: 60 XP to Lv 2, then +40 XP a level (attributes: 15, then +10). Tiers are separate: where you stand against people your age.";

function climb(xp, need) {
  let level = 1, floor = 0;
  while (xp >= floor + need(level)) { floor += need(level); level++; }
  return { level, into: xp - floor, need: need(level) };
}
export const levelOf = (xp) => climb(xp, levelNeed);
export const attrLevel = (xp) => climb(xp, attrNeed);

export function rankOf(xp) {
  let r = RANKS[0];
  for (const x of RANKS) if (xp >= x.min) r = x;
  const next = RANKS[RANKS.indexOf(r) + 1] || null;
  return { ...r, next };
}

/** The finished-task history from both repos, deduped by id. */
export function tasksPerWeek(history, today, weeks = 8) {
  const from = new Date(Date.parse(today) - weeks * 7 * 864e5).toISOString().slice(0, 10);
  const n = new Set(history.filter((h) => (h.completedDate || "") >= from && (h.completedDate || "") <= today).map((h) => h.id)).size;
  return n / weeks;
}

/** Sum of attribute weight over finished quests that lean on it. */
function questWeight(quests, attr) {
  return quests.filter((q) => q.status === "done").reduce((s, q) => s + (Number(q.attributes?.[attr]) || 0), 0);
}

/**
 * Every attribute's current value, percentile and tier.
 * `measurements`: [{metric, value, date}] typed in or verified (latest wins, except
 * pushups where the best verified set within a year counts).
 */
export function attributeStats({ quests = [], history = [], measurements = [], profile = {}, today }) {
  const done = quests.filter((q) => q.status === "done");
  const latest = (metric) => measurements.filter((m) => m.metric === metric).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const yearAgo = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
  const derived = {
    pushups: () => {
      const reps = done.filter((q) => q.evidence?.type === "reps" && q.evidence.exercise === "pushup" && (q.completed || "") >= yearAgo).map((q) => q.evidence.reps || 0);
      // A push-up quest turned in without the camera is your word for the set, like a typed measurement.
      const word = done.filter((q) => q.evidence?.type !== "reps" && q.proof?.type === "reps" && q.proof.exercise === "pushup" && (q.completed || "") >= yearAgo).map((q) => Number(q.proof.count) || 0);
      const typed = [...measurements.filter((m) => m.metric === "pushups" && (m.date || "") >= yearAgo).map((m) => m.value), ...word];
      const all = [...reps, ...typed];
      return all.length ? { value: Math.max(...all), from: reps.length && Math.max(...reps) >= Math.max(...typed, 0) ? "verified" : "typed" } : null;
    },
    places: () => {
      const n = new Set(done.filter((q) => q.evidence?.type === "gps").map((q) => q.id)).size;
      return n ? { value: n, from: "quests" } : null;
    },
    reflections: () => { const v = questWeight(quests, "wis"); return v ? { value: v, from: "quests" } : null; },
    social: () => { const v = questWeight(quests, "cha"); return v ? { value: v, from: "quests" } : null; },
    tasksPerWeek: () => (history.length ? { value: Math.round(tasksPerWeek(history, today) * 10) / 10, from: "tasks" } : null),
  };
  return ATTRIBUTES.map((a) => {
    const m = METRICS[a.metric];
    const cdf = m.cdf(profile);
    const got = derived[a.metric]?.() || (latest(a.metric) ? { value: latest(a.metric).value, from: "typed", date: latest(a.metric).date } : null);
    const p = got ? percentile(got.value, cdf) : null;
    const tier = tierOf(p);
    const nt = nextTier(tier);
    const xp = Math.round(done.reduce((s, q) => s + (q.xp || 0) * (Number(q.attributes?.[a.id]) || 0), 0));
    return {
      ...a, metric: a.metric, xp, level: attrLevel(xp), unit: m.unit, scale: m.scale, cdf,
      value: got?.value ?? null, from: got?.from ?? null, percentile: p == null ? null : Math.round(p * 10) / 10,
      tier, next: nt, toNext: nt && got ? Math.max(0, Math.ceil(valueAt(nt.min, cdf) - got.value)) : null,
    };
  });
}

/** What a turn-in did to each attribute: XP earned there, and any tier change. For the turn-in toast. */
export function attributeGains(before, after) {
  return after.map((a) => {
    const b = before.find((x) => x.id === a.id) || {};
    return { id: a.id, name: a.name, xp: (a.xp || 0) - (b.xp || 0), from: b.tier?.id || null, to: a.tier?.id || null };
  }).filter((g) => g.xp > 0 || g.from !== g.to);
}

/** Total XP from evidence only. */
export function totalXp({ quests = [], history = [] }) {
  const q = quests.filter((x) => x.status === "done").reduce((s, x) => s + (x.xp || 0), 0);
  return q + new Set(history.map((h) => h.id)).size * TASK_XP;
}

/** Days in a row (ending today or yesterday) with a quest turned in or a task finished. */
export function streak({ quests = [], history = [], today }) {
  const days = new Set([
    ...quests.filter((q) => q.status === "done" && q.completed).map((q) => localDay(q.completed)),
    ...history.map((h) => h.completedDate).filter(Boolean),
  ]);
  let d = new Date(today + "T12:00:00Z");
  if (!days.has(today)) d = new Date(d - 864e5);
  let n = 0;
  while (days.has(d.toISOString().slice(0, 10))) { n++; d = new Date(d - 864e5); }
  return n;
}
