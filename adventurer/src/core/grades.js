// Grades: your guild rank is earned by passing grade tests, not by piling up XP.
// You start at E. To sit the next grade's test you first put in the work the
// trainer sets — verified training sessions — and keep living: quests from the
// rest of your life (tasks, reading, places) count too. The test itself is a
// benchmark, one camera-verified set per exercise; pass every one and you're
// promoted. Fail and you can retake it after a few days' more training.
//
// Benchmarks are real where real data exists: push-up targets are percentiles
// of the population norms for your sex and age band (norms.js — D is the 30th
// percentile, S the 95th). Squats and sit-ups have no comparable norms in our
// sources, so they use the guild's own ladder, and the page says so.
//
// The trainer is deterministic — no AI on page view. Each day it sets at most
// two missions: an assessment set when it doesn't know your level yet, a weekly
// max set to re-measure, and otherwise a set a step above your last one, capped
// at the test target. Three training days in a row earn a rest day.
//
// Everything here reads quest records only (training missions and test sets are
// ordinary quests: proof "reps", origin "training"/"test", giver "trainer"), so
// your grade is derived, never stored: it can't drift from the evidence.

import { METRICS } from "./norms.js";
import { valueAt } from "./stats.js";
import { localDay } from "./quests.js";

export const GRADES = [
  { id: "E", title: "Novice Pathfinder" },
  { id: "D", title: "Iron Wayfarer" },
  { id: "C", title: "Bronze Vanguard" },
  { id: "B", title: "Silver Scoutmaster" },
  { id: "A", title: "Golden Sovereign" },
  { id: "S", title: "Mythic Vanguard" },
];

/** Population percentile each grade's push-up benchmark sits at. */
export const PUSHUP_PERCENTILE = { D: 30, C: 50, B: 70, A: 85, S: 95 };

/** The guild's own ladder where we have no population norms (one clean set, camera-counted). */
export const LADDER = {
  squat: { D: 20, C: 30, B: 40, A: 55, S: 70 },
  situp: { D: 15, C: 22, B: 30, A: 40, S: 50 },
};

/** What each test asks for. Higher grades add sit-ups. */
export const TEST_EXERCISES = { D: ["pushup", "squat"], C: ["pushup", "squat", "situp"], B: ["pushup", "squat", "situp"], A: ["pushup", "squat", "situp"], S: ["pushup", "squat", "situp"] };

/** Before you may sit a test: verified training sessions, and quests from the rest of your life, since your last promotion. */
export const PREREQ = {
  D: { sessions: 4, life: 2 },
  C: { sessions: 8, life: 4 },
  B: { sessions: 12, life: 6 },
  A: { sessions: 16, life: 8 },
  S: { sessions: 20, life: 10 },
};

/**
 * Exercises the trainer works on beside the test's, so none gets left out: one a day, rotating,
 * aimed at the next grade's rung (pull-ups have no norms either, so they use the guild's ladder).
 */
export const ACCESSORY = { situp: LADDER.situp, pullup: { D: 3, C: 5, B: 8, A: 12, S: 16 } };

export const RETAKE_DAYS = 3;
const MAX_EVERY_DAYS = 7;
const PER_DAY = 2;

const DAY = 864e5;
const dayOf = localDay;
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

export const gradeIndex = (id) => GRADES.findIndex((g) => g.id === id);
export const nextGrade = (id) => GRADES[gradeIndex(id) + 1] || null;

/** One test's targets for you: { exercise: reps }. */
export function testTargets(grade, profile = {}) {
  const out = {};
  for (const ex of TEST_EXERCISES[grade] || []) {
    out[ex] = ex === "pushup" ? Math.ceil(valueAt(PUSHUP_PERCENTILE[grade], METRICS.pushups.cdf(profile))) : LADDER[ex][grade];
  }
  return out;
}

const isTrainer = (q) => q.origin === "training" || q.origin === "test";
const verifiedReps = (q) => (q.evidence?.type === "reps" && q.evidence.verified ? Number(q.evidence.reps) || 0 : null);
// A training day is a day you did a camera-counted set — hitting the target or
// not. Failing at the edge of what you can do is training too.
const trained = (q) => q.origin === "training" && ["done", "failed"].includes(q.status) && (verifiedReps(q) ?? 0) > 0;

/** Test attempts, newest first: [{ testId, grade, day, sets: [{exercise, target, reps, passed}], passed }]. */
export function attempts(quests) {
  const by = new Map();
  for (const q of quests) {
    if (q.origin !== "test" || !q.testId || !["done", "failed"].includes(q.status)) continue;
    const a = by.get(q.testId) || { testId: q.testId, grade: q.grade, day: dayOf(q.completed || q.posted), sets: [] };
    const reps = verifiedReps(q) ?? 0;
    a.sets.push({ exercise: q.proof?.exercise, target: q.proof?.count, reps, passed: q.status === "done" && reps >= (q.proof?.count || Infinity) });
    if (dayOf(q.completed) > a.day) a.day = dayOf(q.completed);
    by.set(q.testId, a);
  }
  return [...by.values()].map((a) => ({ ...a, passed: a.sets.length >= (TEST_EXERCISES[a.grade] || []).length && a.sets.every((s) => s.passed) }))
    .sort((x, y) => y.day.localeCompare(x.day) || y.testId.localeCompare(x.testId));
}

/** Your grade: the highest test passed in order (you can't skip one), with when. */
export function gradeOf(quests) {
  const passed = attempts(quests).filter((a) => a.passed);
  let current = GRADES[0];
  let since = null;
  for (const g of GRADES.slice(1)) {
    const a = passed.filter((x) => x.grade === g.id).sort((x, y) => x.day.localeCompare(y.day))[0];
    if (!a) break;
    current = g;
    since = a.day;
  }
  return { ...current, since, next: nextGrade(current.id) };
}

/** Best verified set of an exercise in the last `days` days (training or tests). */
export function bestSet(quests, exercise, today, days = 30) {
  const from = addDays(today, -days);
  let best = null;
  for (const q of quests) {
    if (!isTrainer(q) || q.proof?.exercise !== exercise) continue;
    const r = verifiedReps(q);
    if (r == null || dayOf(q.completed) < from) continue;
    if (best == null || r > best) best = r;
  }
  return best;
}

/** Whether you may sit the next test, and exactly what's missing if not. */
export function eligibility(quests, { profile = {}, today }) {
  const grade = gradeOf(quests);
  const next = grade.next;
  if (!next) return { grade, next: null, eligible: false, done: true };
  const since = grade.since || "0000-00-00";
  const after = (q) => dayOf(q.completed) >= since;
  const sessions = new Set(quests.filter((q) => trained(q) && after(q)).map((q) => dayOf(q.completed))).size;
  const life = quests.filter((q) => q.status === "done" && !isTrainer(q) && after(q)).length;
  const need = PREREQ[next.id];
  const lastFail = attempts(quests).find((a) => a.grade === next.id && !a.passed);
  const retakeOn = lastFail ? addDays(lastFail.day, RETAKE_DAYS) : null;
  const waiting = retakeOn && today < retakeOn;
  const targets = testTargets(next.id, profile);
  const missing = [];
  if (sessions < need.sessions) missing.push(`${need.sessions - sessions} more training day${need.sessions - sessions === 1 ? "" : "s"}`);
  if (life < need.life) missing.push(`${need.life - life} more quest${need.life - life === 1 ? "" : "s"} from your life (tasks, reading, places)`);
  if (waiting) missing.push(`a retake after ${retakeOn}`);
  return {
    grade, next, targets,
    sessions: { have: sessions, need: need.sessions },
    life: { have: life, need: need.life },
    retakeOn: waiting ? retakeOn : null,
    best: Object.fromEntries(Object.keys(targets).map((ex) => [ex, bestSet(quests, ex, today)])),
    eligible: missing.length === 0,
    missing,
  };
}

/** Days in a row (ending yesterday) with a verified training session — three earns a rest day. */
function trainingRun(quests, today) {
  const days = new Set(quests.filter(trained).map((q) => dayOf(q.completed)));
  let n = 0;
  for (let d = addDays(today, -1); days.has(d); d = addDays(d, -1)) n++;
  return n;
}

const lastOf = (quests, exercise, pred = () => true) => quests
  .filter((q) => q.origin === "training" && q.proof?.exercise === exercise && ["done", "failed"].includes(q.status) && pred(q))
  .sort((a, b) => dayOf(b.completed).localeCompare(dayOf(a.completed)))[0] || null;

/**
 * Today's missions from the trainer, as quest records to post (ids are stable per day,
 * so opening the page twice posts nothing new). Returns { rest, missions }.
 */
export function trainingPlan(quests, { profile = {}, today, now }) {
  const el = eligibility(quests, { profile, today });
  if (!el.next) return { rest: false, missions: [] };
  const already = quests.filter((q) => q.origin === "training" && dayOf(q.posted) === today);
  if (already.length) return { rest: false, missions: [] }; // today's are posted
  if (trainingRun(quests, today) >= 3) return { rest: true, missions: [] };
  const exercises = Object.keys(el.targets);
  // Rotate which exercises come first, day by day, so each gets trained.
  const offset = Math.abs(Math.floor(Date.parse(`${today}T12:00:00Z`) / DAY)) % exercises.length;
  const order = exercises.slice(offset).concat(exercises.slice(0, offset));
  const missions = [];
  const extra = Object.keys(ACCESSORY).filter((ex) => !exercises.includes(ex));
  const accessory = extra.length ? extra[offset % extra.length] : null;
  for (const ex of [...order, accessory]) {
    if (!ex) continue;
    const isExtra = ex === accessory;
    if (!isExtra && missions.length >= PER_DAY) continue;
    const target = isExtra ? ACCESSORY[ex][el.next.id] : el.targets[ex];
    const best = bestSet(quests, ex, today, 60);
    const lastMax = lastOf(quests, ex, (q) => q.kind === "max");
    const last = lastOf(quests, ex, (q) => q.kind !== "max");
    let kind;
    let count;
    let note;
    if (best == null) {
      kind = "max"; count = 1;
      note = "Assessment: as many clean reps as you can in one set. This sets your starting point.";
    } else if (best >= target && el.eligible && !isExtra) {
      continue; // ready for the test on this one
    } else if (!lastMax || daysBetween(dayOf(lastMax.completed), today) >= MAX_EVERY_DAYS) {
      kind = "max"; count = 1;
      note = isExtra ? `Weekly max set: one all-out set. Your best is ${best}; the ${el.next.id} rung is ${target}.` : `Weekly max set: one all-out set. Your best is ${best}; the ${el.next.id} test needs ${target}.`;
    } else {
      kind = "set";
      const lastTarget = last?.proof?.count || 0;
      const lastHit = last && last.status === "done" && (verifiedReps(last) ?? 0) >= lastTarget;
      const base = Math.ceil(best * 0.7);
      count = Math.min(target, Math.max(base, lastHit ? lastTarget + 1 : lastTarget || base));
      const aim = isExtra ? "aim" : "test";
      note = lastHit ? `Last set ${lastTarget} — one more today. Best ${best}, ${aim} ${target}.` : last ? `Hold at ${count} until it's clean. Best ${best}, ${aim} ${target}.` : `${count} clean reps (about 70% of your best ${best}).`;
    }
    missions.push({
      id: `train-${today}-${ex}`,
      title: kind === "max" ? `Max set: ${ex}s` : `${count} ${ex}s`,
      brief: note,
      status: "posted",
      origin: "training",
      giver: "trainer",
      author: "trainer",
      kind,
      grade: el.next.id,
      ...(isExtra ? { accessory: true } : {}),
      taskIds: [],
      difficulty: kind === "max" ? "normal" : "easy",
      attributes: ex === "situp" ? { str: 0.5, vit: 0.5 } : { str: 1 },
      proof: { type: "reps", exercise: ex, count },
      posted: now,
      expires: today,
    });
  }
  return { rest: false, missions };
}

/** The sets of a test attempt, as quest records to fill in as you go. */
export function testSets(grade, { profile = {}, now, stamp = Date.now() }) {
  const testId = `test-${grade.toLowerCase()}-${stamp.toString(36)}`;
  return Object.entries(testTargets(grade, profile)).map(([ex, count]) => ({
    id: `${testId}-${ex}`,
    title: `${grade}-grade test: ${count} ${ex}s`,
    status: "accepted",
    origin: "test",
    giver: "trainer",
    author: "trainer",
    grade,
    testId,
    taskIds: [],
    difficulty: "hard",
    attributes: { str: 1 },
    proof: { type: "reps", exercise: ex, count },
    posted: now,
    accepted: now,
  }));
}
