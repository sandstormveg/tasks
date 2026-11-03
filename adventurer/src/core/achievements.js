// Achievements: the trophy cabinet. Two kinds, shown together:
// - the guild's own catalog, earned automatically from evidence (turned-in
//   quests, finished tasks, streaks, grades, tiers, skill levels), each showing
//   progress until it's won — "the ones you will make";
// - personal trophies, Silica's real-life achievements (earned, with a date)
//   and life goals (still ahead), kept in quests/showcase.json.
// Pure: everything here is computed from data handed in.

import { TIERS } from "./stats.js";
import { GRADES, attempts } from "./grades.js";

export const TROPHY_TIERS = { bronze: "Bronze", silver: "Silver", gold: "Gold", mythic: "Mythic" };

const day = (iso) => (iso || "").slice(0, 10);

/** Longest run of consecutive days in a set of YYYY-MM-DD strings, and the day it reached n. */
function streakDates(days) {
  const sorted = [...new Set(days)].filter(Boolean).sort();
  let run = 0, prev = null, best = 0;
  const reached = {}; // length -> first day a run reached it
  for (const d of sorted) {
    run = prev && Date.parse(d) - Date.parse(prev) === 864e5 ? run + 1 : 1;
    prev = d;
    best = Math.max(best, run);
    if (!reached[run]) reached[run] = d;
  }
  return { best, reached };
}

/** Facts the catalog is checked against. */
export function facts({ quests = [], history = [], attributes = [], skills = [] }) {
  const done = quests.filter((q) => q.status === "done").sort((a, b) => (a.completed || "").localeCompare(b.completed || ""));
  // The trainer's daily sets and grade tests are quests too, but counting them would turn
  // "Turn in 50 quests" into a month of push-ups: they count for reps and streaks only.
  const quested = done.filter((q) => q.giver !== "trainer");
  const dates = (qs) => qs.map((q) => day(q.completed));
  const tasks = [...new Map(history.map((h) => [h.id, h])).values()].map((h) => h.completedDate).filter(Boolean).sort();
  // The day each grade was first passed, in order (you can't skip one).
  const passed = attempts(quests).filter((a) => a.passed);
  const gradeDays = {};
  for (const g of GRADES.slice(1)) {
    const d = passed.filter((a) => a.grade === g.id).map((a) => a.day).sort()[0];
    if (!d) break;
    gradeDays[g.id] = d;
  }
  let reps = 0;
  const repDates = [];
  for (const q of done) if (q.evidence?.type === "reps") { reps += q.evidence.reps || 0; repDates.push([day(q.completed), reps]); }
  return {
    done: dates(quested),
    reps: dates(done.filter((q) => q.evidence?.type === "reps")),
    gps: dates(done.filter((q) => q.evidence?.type === "gps")),
    inferred: dates(quested.filter((q) => q.origin === "inferred")),
    epic: dates(quested.filter((q) => q.difficulty === "epic")),
    tasks,
    repTotal: reps, repDates,
    grade: Object.keys(gradeDays).length, gradeDays,
    streak: streakDates([...dates(done), ...tasks]),
    bestTier: Math.max(-1, ...attributes.map((a) => TIERS.findIndex((t) => t.id === a.tier?.id))),
    bestSkill: Math.max(0, ...skills.map((s) => s.level)),
  };
}

const count = (key, n) => (f) => ({ value: f[key].length, target: n, date: f[key][n - 1] || null });
const grade = (id) => (f) => ({ value: f.grade, target: GRADES.findIndex((g) => g.id === id), date: f.gradeDays[id] || null });
const streak = (n) => (f) => ({ value: f.streak.best, target: n, date: f.streak.reached[n] || null });

export const CATALOG = [
  { id: "first-quest", title: "First Quest", desc: "Turn in your first quest.", tier: "bronze", icon: "⚔", check: count("done", 1) },
  { id: "quests-10", title: "Journeyman", desc: "Turn in 10 quests.", tier: "silver", icon: "⚔", check: count("done", 10) },
  { id: "quests-50", title: "Veteran of the Board", desc: "Turn in 50 quests.", tier: "gold", icon: "⚔", check: count("done", 50) },
  { id: "quests-200", title: "Living Legend", desc: "Turn in 200 quests.", tier: "mythic", icon: "⚔", check: count("done", 200) },
  { id: "first-reps", title: "Proof of Strength", desc: "Turn in a camera-verified quest.", tier: "bronze", icon: "✊", check: count("reps", 1) },
  { id: "reps-500", title: "Iron Body", desc: "500 camera-verified reps in total.", tier: "gold", icon: "✊",
    check: (f) => ({ value: f.repTotal, target: 500, date: f.repDates.find(([, n]) => n >= 500)?.[0] || null }) },
  { id: "first-gps", title: "First Footsteps", desc: "Check in somewhere by GPS.", tier: "bronze", icon: "⌖", check: count("gps", 1) },
  { id: "gps-10", title: "Cartographer", desc: "Check in at 10 places.", tier: "silver", icon: "⌖", check: count("gps", 10) },
  { id: "gps-50", title: "World Walker", desc: "Check in at 50 places.", tier: "gold", icon: "⌖", check: count("gps", 50) },
  { id: "inferred-1", title: "Heeded the Call", desc: "Finish a quest the guild master inferred for you.", tier: "silver", icon: "✦", check: count("inferred", 1) },
  { id: "epic-1", title: "Epic Deed", desc: "Finish an epic quest.", tier: "gold", icon: "♛", check: count("epic", 1) },
  { id: "streak-7", title: "Kindled", desc: "A 7-day streak.", tier: "silver", icon: "✹", check: streak(7) },
  { id: "streak-30", title: "Unbroken", desc: "A 30-day streak.", tier: "gold", icon: "✹", check: streak(30) },
  { id: "streak-100", title: "Eternal Flame", desc: "A 100-day streak.", tier: "mythic", icon: "✹", check: streak(100) },
  { id: "tasks-10", title: "Getting Things Done", desc: "Finish 10 tasks.", tier: "bronze", icon: "✓", check: count("tasks", 10) },
  { id: "tasks-100", title: "Taskmaster", desc: "Finish 100 tasks.", tier: "silver", icon: "✓", check: count("tasks", 100) },
  { id: "tasks-500", title: "Architect of Days", desc: "Finish 500 tasks.", tier: "gold", icon: "✓", check: count("tasks", 500) },
  { id: "rank-c", title: "Bronze Vanguard", desc: "Pass the C-grade test.", tier: "silver", icon: "◆", check: grade("C") },
  { id: "rank-a", title: "Golden Sovereign", desc: "Pass the A-grade test.", tier: "gold", icon: "◆", check: grade("A") },
  { id: "rank-s", title: "Mythic Vanguard", desc: "Pass the S-grade test.", tier: "mythic", icon: "◆", check: grade("S") },
  { id: "tier-a", title: "Elite Trait", desc: "Any attribute at tier A.", tier: "gold", icon: "◈", check: (f) => ({ value: Math.max(0, f.bestTier), target: 5, date: null }) },
  { id: "tier-ss", title: "Legendary Trait", desc: "Any attribute at tier SS.", tier: "mythic", icon: "◈", check: (f) => ({ value: Math.max(0, f.bestTier), target: 7, date: null }) },
  { id: "skill-5", title: "Adept", desc: "Any skill at Lv 5.", tier: "silver", icon: "✧", check: (f) => ({ value: f.bestSkill, target: 5, date: null }) },
  { id: "skill-10", title: "Grandmaster", desc: "Any skill at Lv 10.", tier: "mythic", icon: "✧", check: (f) => ({ value: f.bestSkill, target: 10, date: null }) },
];

export function validateTrophy(t) {
  const errs = [];
  if (!t || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(t.id || "")) errs.push("trophy id must be kebab-case");
  if (!t?.title) errs.push("trophy title is required");
  if (t?.tier && !TROPHY_TIERS[t.tier]) errs.push(`tier must be one of ${Object.keys(TROPHY_TIERS).join(", ")}`);
  if (t?.status && !["earned", "goal"].includes(t.status)) errs.push("status must be earned or goal");
  if (t?.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t.date)) errs.push("date must be YYYY, YYYY-MM or YYYY-MM-DD");
  return errs;
}

/** The whole cabinet: catalog + personal, each {id, title, desc, tier, icon, earned, date, progress, kind}. */
export function cabinet(data, personal = []) {
  const f = facts(data);
  const guild = CATALOG.map((a) => {
    const r = a.check(f);
    const earned = r.value >= r.target;
    return { id: a.id, title: a.title, desc: a.desc, tier: a.tier, icon: a.icon, kind: "guild", earned, date: earned ? r.date : null, value: Math.min(r.value, r.target), target: r.target, progress: Math.min(1, r.value / r.target) };
  });
  const mine = personal.filter((t) => !t.removed).map((t) => ({
    id: t.id, title: t.title, desc: t.detail || "", tier: t.tier || "gold", icon: t.icon || "★", kind: "personal", category: t.category,
    earned: t.status !== "goal", date: t.status !== "goal" ? t.date || null : null, target: null, progress: t.status !== "goal" ? 1 : 0, author: t.author,
  }));
  const order = { mythic: 0, gold: 1, silver: 2, bronze: 3 };
  return [...mine, ...guild].sort((a, b) => Number(b.earned) - Number(a.earned) || (b.date || "").localeCompare(a.date || "") || b.progress - a.progress || order[a.tier] - order[b.tier]);
}

/** Achievements earned now that weren't before: for the "unlocked" moment at turn-in. */
export function newlyEarned(before, after) {
  const had = new Set(before.filter((a) => a.earned).map((a) => a.id));
  return after.filter((a) => a.earned && !had.has(a.id));
}
