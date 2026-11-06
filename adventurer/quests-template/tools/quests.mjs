// Generated from sandstormveg/Adventurer tools/quests.mjs by npm run bundle-cli. Don't edit here.

// tools/quests.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

// src/core/objectives.js
var OBJECTIVE_TYPES = {
  exploration: "\u{1F9ED}",
  social: "\u{1F91D}",
  research: "\xA7",
  creation: "\u2726",
  reflection: "\u270E",
  learning: "\u25C7",
  physical: "\u2694",
  discovery: "\u2727"
};
var SYSTEMS = ["tasks", "research", "journal", "quests", "reps", "gps"];
var EXERCISES = ["pushup", "squat", "situp", "dip", "pullup"];
var hasObjectives = (q) => Array.isArray(q?.objectives) && q.objectives.length > 0;
var isDone = (q, o) => !!q.progress?.[o.id];
function validateObjectives(q) {
  const errs = [];
  if (q.objectives === void 0) return errs;
  if (!Array.isArray(q.objectives) || q.objectives.length > 12) return ["objectives must be a list of up to 12"];
  const ids = /* @__PURE__ */ new Set();
  for (const o of q.objectives) {
    const at = `objective ${o?.id || "?"}`;
    if (!o || typeof o !== "object") {
      errs.push("each objective must be an object");
      continue;
    }
    if (!/^[a-z0-9-]{1,24}$/.test(o.id || "")) errs.push(`${at}: id must be short kebab-case`);
    if (ids.has(o.id)) errs.push(`${at}: ids must be unique`);
    ids.add(o.id);
    if (!OBJECTIVE_TYPES[o.type]) errs.push(`${at}: type must be one of ${Object.keys(OBJECTIVE_TYPES).join(", ")}`);
    if (!o.text || typeof o.text !== "string") errs.push(`${at}: text is required`);
    if (!(Number.isInteger(o.xp) && o.xp >= 0 && o.xp <= 500)) errs.push(`${at}: xp must be a whole number from 0 to 500`);
    const l = o.link;
    if (l === void 0) continue;
    if (!SYSTEMS.includes(l.system)) {
      errs.push(`${at}: link.system must be one of ${SYSTEMS.join(", ")}`);
      continue;
    }
    if ((l.system === "tasks" || l.system === "quests") && !l.ref) errs.push(`${at}: a ${l.system} link needs a ref (its id)`);
    if (l.system === "research" && !l.ref && !l.tag && !l.kind) errs.push(`${at}: a research link needs a ref (source, board or piece id) or a tag/kind to match`);
    if (l.system === "gps" && !(Number.isFinite(l.target?.lat) && Number.isFinite(l.target?.lng))) errs.push(`${at}: a gps link needs target {lat, lng} of a public place`);
    if (l.system === "reps" && (!EXERCISES.includes(l.exercise) || !(l.count > 0))) errs.push(`${at}: a reps link needs an exercise and a count`);
  }
  for (const k of Object.keys(q.progress || {})) if (!ids.has(k)) errs.push(`progress names an objective that doesn't exist: ${k}`);
  return errs;
}
function objectiveXp(q) {
  let potential = 0, bonus = 0, earned = 0;
  for (const o of q.objectives || []) {
    if (o.optional) bonus += o.xp;
    else potential += o.xp;
    if (isDone(q, o)) earned += o.xp;
  }
  return { potential, bonus, earned };
}
function parseObjective(spec, n = 1) {
  const m = String(spec).trim().match(/^([a-z]+):\s*(.+?)(?:\s+@([a-z]+)(?::(.+?))?)?(?:\s+\+(\d+)\s*xp)?(\s+optional)?$/i);
  if (!m) throw new Error(`can't read objective "${spec}" \u2014 use "type: text [@system:key=value,\u2026] [+30xp] [optional]"`);
  const [, type, text, system, kv, xp, optional] = m;
  const o = { id: `o${n}`, type: type.toLowerCase(), text: text.trim(), xp: xp ? Number(xp) : 20 };
  if (optional) o.optional = true;
  if (system) {
    const link = { system: system.toLowerCase() };
    for (const pair of (kv || "").split(",").filter(Boolean)) {
      const [k, ...v] = pair.split("=");
      const val = v.join("=").trim();
      link[k.trim()] = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val;
    }
    if (link.system === "gps") {
      const { lat, lng, place, radius, ...rest2 } = link;
      Object.assign(o, { link: { ...rest2, target: { lat, lng, place, radius: radius || 60 } } });
    } else o.link = link;
  }
  return o;
}

// src/core/quests.js
var STATUSES = ["requested", "posted", "accepted", "done", "failed", "declined", "expired"];
var OPEN = /* @__PURE__ */ new Set(["posted", "accepted"]);
var ORIGINS = ["task", "inferred", "request", "guild", "local", "self", "training", "test"];
var GIVERS = ["guildmaster", "relay", "board", "self", "trainer"];
var PROOFS = ["gps", "reps", "photo", "journal", "honor"];
var EXERCISES2 = ["pushup", "squat", "situp", "dip", "pullup"];
var DIFFICULTY = {
  trivial: { xp: 10, label: "Trivial" },
  easy: { xp: 25, label: "Easy" },
  normal: { xp: 50, label: "Normal" },
  hard: { xp: 100, label: "Hard" },
  epic: { xp: 250, label: "Epic" }
};
var PROOF_RATE = { gps: 1, reps: 1, photo: 0.9, journal: 0.9, honor: 0.6 };
var ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
function slug(text) {
  return String(text || "quest").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quest";
}
function newId(title, taken = /* @__PURE__ */ new Set(), stamp = Date.now()) {
  const base = slug(title);
  if (!taken.has(base)) return base;
  const id = `${base}-${stamp.toString(36).slice(-5)}`;
  return taken.has(id) ? `${id}-${Math.random().toString(36).slice(2, 5)}` : id;
}
function normalize(q) {
  return {
    ...q,
    origin: q.origin || "self",
    giver: q.giver || "self",
    taskIds: Array.isArray(q.taskIds) ? q.taskIds : [],
    difficulty: DIFFICULTY[q.difficulty] ? q.difficulty : "normal",
    attributes: q.attributes && typeof q.attributes === "object" ? q.attributes : {},
    proof: q.proof && PROOFS.includes(q.proof.type) ? q.proof : { type: "honor" },
    status: STATUSES.includes(q.status) ? q.status : "posted"
  };
}
function validate(q) {
  const errs = [];
  if (!q || typeof q !== "object") return ["not an object"];
  if (!ID_RE.test(q.id || "")) errs.push("id must be lowercase kebab-case (a-z, 0-9, -), up to 80 characters");
  if (!q.title || typeof q.title !== "string") errs.push("title is required");
  if (q.status && !STATUSES.includes(q.status)) errs.push(`status must be one of ${STATUSES.join(", ")}`);
  if (q.origin && !ORIGINS.includes(q.origin)) errs.push(`origin must be one of ${ORIGINS.join(", ")}`);
  if (q.giver && !GIVERS.includes(q.giver)) errs.push(`giver must be one of ${GIVERS.join(", ")}`);
  if (q.difficulty && !DIFFICULTY[q.difficulty]) errs.push(`difficulty must be one of ${Object.keys(DIFFICULTY).join(", ")}`);
  if (q.origin === "inferred" && !q.why) errs.push("an inferred quest needs a one-line why");
  if (q.taskIds && !Array.isArray(q.taskIds)) errs.push("taskIds must be a list of task ids");
  const p = q.proof;
  if (p) {
    if (!PROOFS.includes(p.type)) errs.push(`proof.type must be one of ${PROOFS.join(", ")}`);
    if (p.type === "gps") {
      const t = p.target || {};
      if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) errs.push("a gps quest needs proof.target {lat, lng} of a public place");
    }
    if (p.type === "reps") {
      if (!EXERCISES2.includes(p.exercise)) errs.push(`proof.exercise must be one of ${EXERCISES2.join(", ")}`);
      if (!(p.count > 0)) errs.push("proof.count must be a positive number of reps");
    }
  }
  if (q.attributes) {
    for (const [k, v] of Object.entries(q.attributes)) if (!(v >= 0 && v <= 1)) errs.push(`attributes.${k} must be a weight from 0 to 1`);
  }
  if (q.skills) {
    if (typeof q.skills !== "object" || Array.isArray(q.skills)) errs.push("skills must be {skill-id: weight}");
    else for (const [k, v] of Object.entries(q.skills)) if (!(v >= 0 && v <= 1)) errs.push(`skills.${k} must be a weight from 0 to 1`);
  }
  if (q.expires && !/^\d{4}-\d{2}-\d{2}/.test(q.expires)) errs.push("expires must be a date (YYYY-MM-DD)");
  errs.push(...validateObjectives(q));
  if (q.encounter) {
    const e = q.encounter;
    if (!["chest", "scholar"].includes(e.type)) errs.push("encounter.type must be chest or scholar");
    if (q.proof?.type !== "gps") errs.push("an encounter waits at a place: its quest needs gps proof");
    if (!Array.isArray(e.loot) || e.loot.length > 5) errs.push("encounter.loot must be a list of up to 5 items");
    else for (const l of e.loot) {
      if (!["dex", "babel", "task", "note"].includes(l.kind)) errs.push("each loot item's kind is dex, babel, task or note");
      if (l.kind === "dex" && !/^Q\d+$/.test(l.qid || "")) errs.push("a dex loot item needs a Wikidata qid like Q5194");
      if (l.kind === "task" && !l.taskId) errs.push("a task loot item needs a taskId");
    }
  }
  return errs;
}
function payout(q, proofType = q.proof?.type) {
  if (hasObjectives(q)) return objectiveXp(q).potential;
  const base = DIFFICULTY[q.difficulty]?.xp ?? DIFFICULTY.normal.xp;
  return Math.round(base * (PROOF_RATE[proofType] ?? PROOF_RATE.honor));
}
function serialize(q) {
  const order = [
    "id",
    "title",
    "brief",
    "detail",
    "why",
    "status",
    "origin",
    "giver",
    "author",
    "taskIds",
    "taskCreated",
    "difficulty",
    "attributes",
    "skills",
    "proof",
    "objectives",
    "progress",
    "encounter",
    "kind",
    "grade",
    "testId",
    "posted",
    "expires",
    "accepted",
    "completed",
    "evidence",
    "xp"
  ];
  const out = {};
  for (const k of order) if (q[k] !== void 0) out[k] = q[k];
  for (const k of Object.keys(q).sort()) if (!(k in out) && q[k] !== void 0 && !k.startsWith("_")) out[k] = q[k];
  return JSON.stringify(out, null, 2) + "\n";
}
function localDay(iso) {
  const s = String(iso || "");
  if (s.length <= 10) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString("en-CA");
}

// src/core/skills.js
var SKILL_KINDS = { active: "Active", passive: "Passive", unique: "Unique" };
var SKILL_STATUS = ["known", "learning", "aspiring"];
var SKILL_LEVELS = [0, 60, 160, 320, 560, 900, 1360, 1960, 2720, 3660];
var MAX_SKILL_LEVEL = SKILL_LEVELS.length;
function validateSkill(s) {
  const errs = [];
  if (!s || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(s.id || "")) errs.push("skill id must be kebab-case");
  if (!s?.name) errs.push("skill name is required");
  if (s?.kind && !SKILL_KINDS[s.kind]) errs.push(`kind must be one of ${Object.keys(SKILL_KINDS).join(", ")}`);
  if (s?.status && !SKILL_STATUS.includes(s.status)) errs.push(`status must be one of ${SKILL_STATUS.join(", ")}`);
  if (s?.startLevel != null && !(s.startLevel >= 0 && s.startLevel <= MAX_SKILL_LEVEL)) errs.push(`startLevel must be 0\u2013${MAX_SKILL_LEVEL}`);
  return errs;
}

// src/core/norms.js
var PUSHUPS = {
  male: { "20-29": [16, 21, 28, 35, 36], "30-39": [11, 16, 21, 29, 30], "40-49": [9, 12, 16, 24, 25], "50-59": [6, 9, 12, 20, 21], "60-69": [4, 7, 10, 17, 18] },
  female: { "20-29": [9, 14, 20, 29, 30], "30-39": [7, 12, 19, 26, 27], "40-49": [4, 10, 14, 23, 24], "50-59": [1, 6, 10, 20, 21], "60-69": [1, 4, 11, 16, 17] }
};
function pushupCdf({ sex = "male", ageBand = "20-29" } = {}) {
  const t = (PUSHUPS[sex] || PUSHUPS.male)[ageBand] || PUSHUPS.male["20-29"];
  return [[0, 1], [t[0], 20], [t[1], 40], [t[2], 60], [t[3], 80], [Math.round(t[4] * 1.6), 98], [t[4] * 2.5, 99.7]];
}
var METRICS = {
  pushups: {
    label: "Push-ups in one set",
    unit: "reps",
    scale: "population",
    cdf: pushupCdf,
    source: "Canadian Physical Activity, Fitness & Lifestyle Approach push-up norms, as reprinted in ACSM's Guidelines for Exercise Testing and Prescription. Category cut-offs by age and sex; percentiles between them are interpolated."
  },
  steps: {
    label: "Average steps a day",
    unit: "steps",
    scale: "population",
    cdf: () => [[0, 0], [1500, 6], [3e3, 22], [5e3, 50], [7500, 76], [1e4, 90], [12500, 96], [16e3, 99]],
    source: "Althoff et al. (2017), Nature 547: smartphone data from 717,000 people in 111 countries, worldwide mean \u2248 4,961 steps a day. The spread around that mean is an assumed right-skewed shape, not their published distribution."
  },
  books: {
    label: "Books finished in the last 12 months",
    unit: "books",
    scale: "population",
    cdf: () => [[0, 23], [1, 30], [3, 42], [5, 50], [12, 72], [24, 87], [50, 96], [100, 99.5]],
    source: "Pew Research Center (2021), US adults: 23% read no book in the past year, median 5, mean 14. Points between are interpolated to fit those figures."
  },
  activeMinutes: {
    label: "Moderate-to-vigorous minutes a week",
    unit: "min/week",
    scale: "population",
    cdf: () => [[0, 8], [30, 15], [75, 22], [150, 31], [300, 62], [450, 82], [600, 91], [900, 98]],
    source: "WHO (2022): 31% of adults worldwide don't meet the 150 min/week guideline (Lancet Global Health, Strain et al. 2024). Above that, the shape is assumed."
  },
  places: {
    label: "New places explored (GPS check-ins)",
    unit: "places",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [10, 70], [20, 85], [35, 95], [60, 99]],
    source: "Guild ladder: no population data. Counts distinct check-in quests."
  },
  reflections: {
    label: "Reflection quests done",
    unit: "quests",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [12, 70], [24, 85], [40, 95], [70, 99]],
    source: "Guild ladder: no population data. Counts finished quests weighted to WIS. The journal itself is never read for this."
  },
  social: {
    label: "Social quests done",
    unit: "quests",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [12, 70], [24, 85], [40, 95], [70, 99]],
    source: "Guild ladder: no population data. Counts finished quests weighted to CHA."
  },
  tasksPerWeek: {
    label: "Tasks finished a week (last 8 weeks)",
    unit: "tasks/week",
    scale: "game",
    cdf: () => [[0, 0], [0.5, 10], [1, 30], [2, 50], [4, 70], [7, 85], [12, 95], [20, 99]],
    source: "Guild ladder: no population data. From the completed history in both task repos."
  }
};

// src/core/stats.js
function valueAt(p, cdf) {
  if (p <= cdf[0][1]) return cdf[0][0];
  for (let i = 1; i < cdf.length; i++) {
    const [x1, p1] = cdf[i];
    if (p <= p1) {
      const [x0, p0] = cdf[i - 1];
      return p1 === p0 ? x1 : x0 + (p - p0) / (p1 - p0) * (x1 - x0);
    }
  }
  return cdf[cdf.length - 1][0];
}

// src/core/grades.js
var GRADES = [
  { id: "E", title: "Novice Pathfinder" },
  { id: "D", title: "Iron Wayfarer" },
  { id: "C", title: "Bronze Vanguard" },
  { id: "B", title: "Silver Scoutmaster" },
  { id: "A", title: "Golden Sovereign" },
  { id: "S", title: "Mythic Vanguard" }
];
var PUSHUP_PERCENTILE = { D: 30, C: 50, B: 70, A: 85, S: 95 };
var LADDER = {
  squat: { D: 20, C: 30, B: 40, A: 55, S: 70 },
  situp: { D: 15, C: 22, B: 30, A: 40, S: 50 }
};
var TEST_EXERCISES = { D: ["pushup", "squat"], C: ["pushup", "squat", "situp"], B: ["pushup", "squat", "situp"], A: ["pushup", "squat", "situp"], S: ["pushup", "squat", "situp"] };
var PREREQ = {
  D: { sessions: 4, life: 2 },
  C: { sessions: 8, life: 4 },
  B: { sessions: 12, life: 6 },
  A: { sessions: 16, life: 8 },
  S: { sessions: 20, life: 10 }
};
var RETAKE_DAYS = 3;
var DAY = 864e5;
var dayOf = localDay;
var addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
var gradeIndex = (id) => GRADES.findIndex((g) => g.id === id);
var nextGrade = (id) => GRADES[gradeIndex(id) + 1] || null;
function testTargets(grade2, profile = {}) {
  const out = {};
  for (const ex of TEST_EXERCISES[grade2] || []) {
    out[ex] = ex === "pushup" ? Math.ceil(valueAt(PUSHUP_PERCENTILE[grade2], METRICS.pushups.cdf(profile))) : LADDER[ex][grade2];
  }
  return out;
}
var isTrainer = (q) => q.origin === "training" || q.origin === "test";
var verifiedReps = (q) => q.evidence?.type === "reps" && q.evidence.verified ? Number(q.evidence.reps) || 0 : null;
var trained = (q) => q.origin === "training" && ["done", "failed"].includes(q.status) && (verifiedReps(q) ?? 0) > 0;
function attempts(quests2) {
  const by = /* @__PURE__ */ new Map();
  for (const q of quests2) {
    if (q.origin !== "test" || !q.testId || !["done", "failed"].includes(q.status)) continue;
    const a = by.get(q.testId) || { testId: q.testId, grade: q.grade, day: dayOf(q.completed || q.posted), sets: [] };
    const reps = verifiedReps(q) ?? 0;
    a.sets.push({ exercise: q.proof?.exercise, target: q.proof?.count, reps, passed: q.status === "done" && reps >= (q.proof?.count || Infinity) });
    if (dayOf(q.completed) > a.day) a.day = dayOf(q.completed);
    by.set(q.testId, a);
  }
  return [...by.values()].map((a) => ({ ...a, passed: a.sets.length >= (TEST_EXERCISES[a.grade] || []).length && a.sets.every((s) => s.passed) })).sort((x, y) => y.day.localeCompare(x.day) || y.testId.localeCompare(x.testId));
}
function gradeOf(quests2) {
  const passed = attempts(quests2).filter((a) => a.passed);
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
function bestSet(quests2, exercise, today, days2 = 30) {
  const from = addDays(today, -days2);
  let best = null;
  for (const q of quests2) {
    if (!isTrainer(q) || q.proof?.exercise !== exercise) continue;
    const r = verifiedReps(q);
    if (r == null || dayOf(q.completed) < from) continue;
    if (best == null || r > best) best = r;
  }
  return best;
}
function eligibility(quests2, { profile = {}, today }) {
  const grade2 = gradeOf(quests2);
  const next = grade2.next;
  if (!next) return { grade: grade2, next: null, eligible: false, done: true };
  const since = grade2.since || "0000-00-00";
  const after = (q) => dayOf(q.completed) >= since;
  const sessions = new Set(quests2.filter((q) => trained(q) && after(q)).map((q) => dayOf(q.completed))).size;
  const life = quests2.filter((q) => q.status === "done" && !isTrainer(q) && after(q)).length;
  const need = PREREQ[next.id];
  const lastFail = attempts(quests2).find((a) => a.grade === next.id && !a.passed);
  const retakeOn = lastFail ? addDays(lastFail.day, RETAKE_DAYS) : null;
  const waiting = retakeOn && today < retakeOn;
  const targets = testTargets(next.id, profile);
  const missing = [];
  if (sessions < need.sessions) missing.push(`${need.sessions - sessions} more training day${need.sessions - sessions === 1 ? "" : "s"}`);
  if (life < need.life) missing.push(`${need.life - life} more quest${need.life - life === 1 ? "" : "s"} from your life (tasks, reading, places)`);
  if (waiting) missing.push(`a retake after ${retakeOn}`);
  return {
    grade: grade2,
    next,
    targets,
    sessions: { have: sessions, need: need.sessions },
    life: { have: life, need: need.life },
    retakeOn: waiting ? retakeOn : null,
    best: Object.fromEntries(Object.keys(targets).map((ex) => [ex, bestSet(quests2, ex, today)])),
    eligible: missing.length === 0,
    missing
  };
}

// src/core/achievements.js
var TROPHY_TIERS = { bronze: "Bronze", silver: "Silver", gold: "Gold", mythic: "Mythic" };
var count = (key, n) => (f2) => ({ value: f2[key].length, target: n, date: f2[key][n - 1] || null });
var grade = (id) => (f2) => ({ value: f2.grade, target: GRADES.findIndex((g) => g.id === id), date: f2.gradeDays[id] || null });
var streak = (n) => (f2) => ({ value: f2.streak.best, target: n, date: f2.streak.reached[n] || null });
var CATALOG = [
  { id: "first-quest", title: "First Quest", desc: "Turn in your first quest.", tier: "bronze", icon: "\u2694", check: count("done", 1) },
  { id: "quests-10", title: "Journeyman", desc: "Turn in 10 quests.", tier: "silver", icon: "\u2694", check: count("done", 10) },
  { id: "quests-50", title: "Veteran of the Board", desc: "Turn in 50 quests.", tier: "gold", icon: "\u2694", check: count("done", 50) },
  { id: "quests-200", title: "Living Legend", desc: "Turn in 200 quests.", tier: "mythic", icon: "\u2694", check: count("done", 200) },
  { id: "first-reps", title: "Proof of Strength", desc: "Turn in a camera-verified quest.", tier: "bronze", icon: "\u270A", check: count("reps", 1) },
  {
    id: "reps-500",
    title: "Iron Body",
    desc: "500 camera-verified reps in total.",
    tier: "gold",
    icon: "\u270A",
    check: (f2) => ({ value: f2.repTotal, target: 500, date: f2.repDates.find(([, n]) => n >= 500)?.[0] || null })
  },
  { id: "first-gps", title: "First Footsteps", desc: "Check in somewhere by GPS.", tier: "bronze", icon: "\u2316", check: count("gps", 1) },
  { id: "gps-10", title: "Cartographer", desc: "Check in at 10 places.", tier: "silver", icon: "\u2316", check: count("gps", 10) },
  { id: "gps-50", title: "World Walker", desc: "Check in at 50 places.", tier: "gold", icon: "\u2316", check: count("gps", 50) },
  { id: "inferred-1", title: "Heeded the Call", desc: "Finish a quest the guild master inferred for you.", tier: "silver", icon: "\u2726", check: count("inferred", 1) },
  { id: "epic-1", title: "Epic Deed", desc: "Finish an epic quest.", tier: "gold", icon: "\u265B", check: count("epic", 1) },
  { id: "streak-7", title: "Kindled", desc: "A 7-day streak.", tier: "silver", icon: "\u2739", check: streak(7) },
  { id: "streak-30", title: "Unbroken", desc: "A 30-day streak.", tier: "gold", icon: "\u2739", check: streak(30) },
  { id: "streak-100", title: "Eternal Flame", desc: "A 100-day streak.", tier: "mythic", icon: "\u2739", check: streak(100) },
  { id: "tasks-10", title: "Getting Things Done", desc: "Finish 10 tasks.", tier: "bronze", icon: "\u2713", check: count("tasks", 10) },
  { id: "tasks-100", title: "Taskmaster", desc: "Finish 100 tasks.", tier: "silver", icon: "\u2713", check: count("tasks", 100) },
  { id: "tasks-500", title: "Architect of Days", desc: "Finish 500 tasks.", tier: "gold", icon: "\u2713", check: count("tasks", 500) },
  { id: "rank-c", title: "Bronze Vanguard", desc: "Pass the C-grade test.", tier: "silver", icon: "\u25C6", check: grade("C") },
  { id: "rank-a", title: "Golden Sovereign", desc: "Pass the A-grade test.", tier: "gold", icon: "\u25C6", check: grade("A") },
  { id: "rank-s", title: "Mythic Vanguard", desc: "Pass the S-grade test.", tier: "mythic", icon: "\u25C6", check: grade("S") },
  { id: "tier-a", title: "Elite Trait", desc: "Any attribute at tier A.", tier: "gold", icon: "\u25C8", check: (f2) => ({ value: Math.max(0, f2.bestTier), target: 5, date: null }) },
  { id: "tier-ss", title: "Legendary Trait", desc: "Any attribute at tier SS.", tier: "mythic", icon: "\u25C8", check: (f2) => ({ value: Math.max(0, f2.bestTier), target: 7, date: null }) },
  { id: "skill-5", title: "Adept", desc: "Any skill at Lv 5.", tier: "silver", icon: "\u2727", check: (f2) => ({ value: f2.bestSkill, target: 5, date: null }) },
  { id: "skill-10", title: "Grandmaster", desc: "Any skill at Lv 10.", tier: "mythic", icon: "\u2727", check: (f2) => ({ value: f2.bestSkill, target: 10, date: null }) }
];
function validateTrophy(t) {
  const errs = [];
  if (!t || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(t.id || "")) errs.push("trophy id must be kebab-case");
  if (!t?.title) errs.push("trophy title is required");
  if (t?.tier && !TROPHY_TIERS[t.tier]) errs.push(`tier must be one of ${Object.keys(TROPHY_TIERS).join(", ")}`);
  if (t?.status && !["earned", "goal"].includes(t.status)) errs.push("status must be earned or goal");
  if (t?.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t.date)) errs.push("date must be YYYY, YYYY-MM or YYYY-MM-DD");
  return errs;
}

// src/core/forge.js
var DAY2 = 864e5;
var days = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(String(from).slice(0, 10))) / DAY2));
function attributesFor(category = "") {
  const c = category.toLowerCase();
  if (/shop|grocer|errand/.test(c)) return { agi: 0.5, wil: 0.5 };
  if (/r&d|develop|build|code|make/.test(c)) return { int: 1, wil: 0.5 };
  if (/research|read|learn|study/.test(c)) return { int: 1 };
  if (/interest|curio|explore/.test(c)) return { wis: 0.5, int: 0.5 };
  if (/admin|chore|home|clean|money/.test(c)) return { wil: 1 };
  if (/social|friend|family/.test(c)) return { cha: 1 };
  if (/fit|gym|health|run|train/.test(c)) return { vit: 1, str: 0.5 };
  return { wil: 0.5 };
}
var plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
var weeksAgo = (d) => d >= 14 ? `waiting ${Math.round(d / 7)} weeks` : d >= 2 ? `waiting ${d} days` : "new";
function forge({ tasks = [], history = [], sources = [], pieces = [], showcase = {}, quests: quests2 = [], today }) {
  const linked = /* @__PURE__ */ new Map();
  for (const q of quests2) for (const id of q.taskIds || []) (linked.get(String(id)) || linked.set(String(id), []).get(String(id))).push(q.status);
  const onBoard = new Set(quests2.filter((q) => OPEN.has(q.status) || q.status === "requested").map((q) => slug(q.title)));
  const skills = (showcase.skills || []).filter((s) => !s.removed);
  const learning = skills.filter((s) => ["learning", "aspiring"].includes(s.status));
  const skillsIn = (text) => skills.filter((s) => new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const recent = {};
  for (const h of history) if (h.completedDate && days(h.completedDate, today) <= 30) recent[h.category] = (recent[h.category] || 0) + 1;
  const out = [];
  const skipped = { declined: 0, linked: 0 };
  const steps = (t) => (t.noteItems || []).length + tasks.filter((s) => s.parentId === t.id).length;
  for (const t of tasks) {
    if (t.parentId != null) continue;
    const st = linked.get(String(t.id)) || [];
    if (st.includes("declined")) {
      skipped.declined++;
      continue;
    }
    if (st.some((s) => s !== "expired")) {
      skipped.linked++;
      continue;
    }
    const why = [], age = days(t.created, today), n = steps(t), mom = recent[t.category] || 0;
    let score = 2;
    score += Math.min(3, Math.floor(age / 14));
    why.push(weeksAgo(age));
    if (n) {
      score += 1;
      why.push(plural(n, "step"));
    }
    if (mom) {
      score += Math.min(3, mom);
      why.push(`you finished ${plural(mom, `${t.category} task`)} this month`);
    }
    if (/shop|grocer/i.test(t.category || "")) {
      score -= 2;
      why.push("an errand");
    }
    const sk = skillsIn(t.title);
    if (sk.length) {
      score += 2;
      why.push(`practises ${sk.map((s) => s.name).join(", ")}`);
    }
    out.push({ score, source: "task", title: t.title, why, quest: {
      title: t.title,
      origin: "task",
      taskIds: [String(t.id)],
      difficulty: n >= 4 ? "hard" : n ? "normal" : "easy",
      proof: { type: "honor" },
      attributes: attributesFor(t.category),
      skills: sk.length ? Object.fromEntries(sk.map((s) => [s.id, 1])) : void 0
    } });
  }
  for (const s of sources) {
    if (!["to-read", "inbox", "reading"].includes(s.status)) continue;
    const why = [s.status === "reading" ? "you started it" : s.status === "to-read" ? "on your to-read list" : "in your Deposit inbox"];
    let score = s.status === "reading" ? 4 : s.status === "to-read" ? 3 : 1;
    if (s.favourite) {
      score += 2;
      why.push("a favourite");
    }
    const age = days(s.added || today, today);
    if (age >= 14) {
      score += 1;
      why.push(weeksAgo(age));
    }
    out.push({ score, source: "reading", title: `Read: ${s.title}`, why, quest: {
      title: `Read: ${s.title}`,
      origin: "self",
      difficulty: "normal",
      proof: { type: "journal" },
      attributes: { int: 1 }
    } });
  }
  for (const p of pieces) {
    if (!["idea", "drafting"].includes(p.status)) continue;
    const why = [p.status === "drafting" ? "a draft in progress" : "an idea you saved"];
    out.push({ score: p.status === "drafting" ? 4 : 2, source: "writing", title: `Write 300 words of \u201C${p.title}\u201D`, why, quest: {
      title: `Write 300 words of \u201C${p.title}\u201D`,
      origin: "self",
      difficulty: "normal",
      proof: { type: "honor" },
      attributes: { wis: 0.5, int: 0.5 }
    } });
  }
  for (const g of (showcase.achievements || []).filter((a) => a.status === "goal" && !a.removed)) {
    out.push({ score: 4, source: "goal", title: `A step toward: ${g.title}`, why: ["a goal you set"], quest: {
      title: `A step toward: ${g.title}`,
      origin: "self",
      difficulty: "normal",
      proof: { type: "honor" },
      attributes: { wil: 1 }
    } });
  }
  for (const s of learning) {
    out.push({ score: s.status === "learning" ? 3 : 2, source: "skill", title: `Practise ${s.name}`, why: [s.status === "learning" ? "a skill you're learning" : "a skill you want"], quest: {
      title: `Practise ${s.name}`,
      origin: "self",
      difficulty: "normal",
      proof: { type: "honor" },
      attributes: { int: 0.5, wil: 0.5 },
      skills: { [s.id]: 1 }
    } });
  }
  const ranked = out.filter((c) => !onBoard.has(slug(c.title))).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const el = eligibility(quests2, { today });
  const lifeNeeded = el.next ? Math.max(0, el.life.need - el.life.have) : 0;
  return { candidates: ranked, skipped, grade: el.grade.id, next: el.next?.id ?? null, lifeNeeded };
}
function addCommand(c) {
  const q = c.quest, w = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(",");
  return [
    "add",
    "--title",
    JSON.stringify(q.title),
    ...q.taskIds?.flatMap((id) => ["--task", id]) ?? [],
    "--origin",
    q.origin,
    "--difficulty",
    q.difficulty,
    "--proof",
    q.proof.type,
    "--attr",
    w(q.attributes),
    ...q.skills ? ["--skill", w(q.skills)] : []
  ].join(" ");
}

// tools/quests.mjs
var root = process.env.QUESTS_DIR || (existsSync("board") || existsSync("CLAUDE.md") ? "." : "quests");
var boardDir = path.join(root, "board");
var showcaseFile = path.join(root, "showcase.json");
function readShowcase() {
  if (!existsSync(showcaseFile)) return { skills: [], achievements: [] };
  try {
    return { skills: [], achievements: [], ...JSON.parse(readFileSync(showcaseFile, "utf8")) };
  } catch (e) {
    fail(`showcase.json is unreadable: ${e.message}`);
  }
}
function saveShowcase(doc) {
  writeFileSync(showcaseFile, JSON.stringify(doc, null, 2) + "\n");
}
function readAll() {
  if (!existsSync(boardDir)) return [];
  return readdirSync(boardDir).filter((f2) => f2.endsWith(".json")).map((f2) => {
    const file = path.join(boardDir, f2);
    try {
      return { file, q: JSON.parse(readFileSync(file, "utf8")) };
    } catch (e) {
      return { file, error: e.message };
    }
  });
}
function save(q) {
  const errs = validate(q);
  if (errs.length) fail(`Not saved \u2014 ${errs.join("; ")}`);
  mkdirSync(boardDir, { recursive: true });
  writeFileSync(path.join(boardDir, `${q.id}.json`), serialize(q));
}
var dataRoot = process.env.DATA_DIR || path.resolve(root, "..");
function readJson(rel, fallback) {
  const file = path.join(dataRoot, rel);
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}
function readFrontMatter(rel) {
  const dir = path.join(dataRoot, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).filter((f2) => String(f2).endsWith(".md")).map((f2) => {
    const m = readFileSync(path.join(dir, String(f2)), "utf8").match(/^---\n([\s\S]*?)\n---/);
    const o = {};
    for (const l of (m?.[1] || "").split("\n")) {
      const kv = l.match(/^([a-z_]+):\s*(.*)$/);
      if (kv) o[kv[1]] = kv[2] === "true" ? true : kv[2] === "false" ? false : kv[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    return o;
  });
}
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
function parseFlags(args) {
  const out = { task: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      (out._ ||= []).push(a);
      continue;
    }
    const k = a.slice(2), v = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    if (k === "task") out.task.push(v);
    else if (k === "objective") (out.objective ||= []).push(v);
    else out[k] = v;
  }
  return out;
}
function build(f2, base = {}) {
  const proofType = f2.proof || base.proof?.type || "honor";
  let proof = { type: proofType };
  if (proofType === "reps") proof = { type: "reps", exercise: f2.exercise || base.proof?.exercise, count: Number(f2.count || base.proof?.count) };
  if (proofType === "gps") proof = { type: "gps", target: { lat: Number(f2.lat), lng: Number(f2.lng), place: f2.place || void 0, radius: f2.radius ? Number(f2.radius) : 60 } };
  const attributes = f2.attr ? weights(f2.attr) : base.attributes || {};
  const skills = f2.skill ? weights(f2.skill) : base.skills;
  if (f2.skill) {
    const known = new Set(readShowcase().skills.filter((s) => !s.removed).map((s) => s.id));
    for (const id of Object.keys(skills)) if (!known.has(id)) console.warn(`Note: no skill "${id}" in showcase.json yet (skill list); it will count once one exists.`);
  }
  return {
    ...base,
    title: f2.title || base.title,
    brief: f2.brief ?? base.brief,
    detail: f2.detail ?? base.detail,
    why: f2.why ?? base.why,
    status: "posted",
    origin: f2.origin || (f2.why ? "inferred" : f2.task.length ? "task" : base.origin === "request" ? "request" : "guild"),
    giver: "guildmaster",
    author: f2.author || base.author || "guildmaster",
    taskIds: f2.task.length ? f2.task : base.taskIds || [],
    difficulty: f2.difficulty || base.difficulty || "normal",
    attributes,
    skills,
    proof,
    posted: base.posted && base.status !== "requested" ? base.posted : (/* @__PURE__ */ new Date()).toISOString(),
    expires: f2.expires || base.expires,
    objectives: f2.objective ? objectivesFrom(f2.objective) : base.objectives
  };
}
function objectivesFrom(specs, start = 1) {
  try {
    return specs.map((s, i) => parseObjective(s, start + i));
  } catch (e) {
    fail(e.message);
  }
}
function weights(text) {
  return Object.fromEntries(String(text).split(",").map((p) => {
    const [k, v] = p.split("=");
    return [k.trim(), v === void 0 ? 1 : Number(v)];
  }));
}
var line = (q) => `${q.id.padEnd(40)} ${q.status.padEnd(9)} ${q.origin.padEnd(8)} ${String(payout(q)).padStart(4)}xp  ${q.title}`;
var [cmd, ...rest] = process.argv.slice(2);
var f = parseFlags(rest);
var all = readAll();
var quests = all.filter((x) => x.q).map((x) => normalize(x.q));
var find = (id) => quests.find((q) => q.id === id) || fail(`No quest "${id}".`);
switch (cmd) {
  case "list": {
    const qs = quests.filter((q) => !f.status || q.status === f.status);
    if (f.json) console.log(JSON.stringify(qs, null, 2));
    else qs.forEach((q) => console.log(line(q)));
    break;
  }
  case "requests":
    quests.filter((q) => q.status === "requested").forEach((q) => console.log(`${line(q)}
    ${(q.detail || "").replace(/\n/g, "\n    ")}`));
    break;
  case "show":
    console.log(serialize(find(f._?.[0])));
    break;
  case "add": {
    if (!f.title) fail("add needs --title");
    const dupe = quests.find((q2) => (OPEN.has(q2.status) || q2.status === "requested") && slug(q2.title) === slug(f.title));
    if (dupe) fail(`Refused: "${dupe.title}" is already on the board (${dupe.id}).`);
    const q = { id: newId(f.id || f.title, new Set(quests.map((x) => x.id))), ...build(f) };
    save(q);
    console.log(`Posted ${q.id} (+${payout(q)} XP)`);
    break;
  }
  case "objective": {
    const q = { ...find(f._?.[0]) };
    if (!["posted", "requested"].includes(q.status)) fail(`${q.id} is ${q.status}; objectives can only change before it's accepted.`);
    const have = q.objectives || [];
    const next = Math.max(0, ...have.map((o) => Number(String(o.id).replace(/\D/g, "")) || 0)) + 1;
    q.objectives = [...have, ...objectivesFrom(f._.slice(1), next)];
    save(q);
    const x = objectiveXp(q);
    console.log(`${q.id}: ${q.objectives.length} objectives, +${x.potential} XP (+${x.bonus} bonus)`);
    break;
  }
  case "shape": {
    const req = find(f._?.[0]);
    if (req.status !== "requested") fail(`${req.id} isn't a request (it's ${req.status}).`);
    const q = build(f, req);
    save(q);
    console.log(`Shaped ${q.id} into a posted quest (+${payout(q)} XP)`);
    break;
  }
  case "set": {
    const q = { ...find(f._?.[0]) };
    for (const kv of f._.slice(1)) {
      const [k, ...v] = kv.split("=");
      const val = v.join("=");
      if (["evidence", "xp", "completed", "progress"].includes(k)) fail("Turn-ins happen in the app, with proof \u2014 the tool doesn't stamp quests.");
      q[k] = val === "" ? void 0 : /^[[{]/.test(val) ? JSON.parse(val) : val;
    }
    save(q);
    console.log(`Updated ${q.id}`);
    break;
  }
  case "remove": {
    const q = find(f._?.[0]);
    if (["accepted", "done"].includes(q.status)) fail(`Refused: ${q.id} is ${q.status}. Set status=expired instead.`);
    rmSync(path.join(boardDir, `${q.id}.json`));
    console.log(`Removed ${q.id}`);
    break;
  }
  case "validate": {
    let bad = 0;
    for (const x of all) {
      const errs = x.error ? [`unreadable JSON: ${x.error}`] : validate(x.q);
      if (x.q && path.basename(x.file, ".json") !== x.q.id) errs.push("file name doesn't match id");
      if (errs.length) {
        bad++;
        console.log(`${x.file}: ${errs.join("; ")}`);
      }
    }
    console.log(bad ? `${bad} problem file(s).` : `All ${all.length} quest files valid.`);
    process.exitCode = bad ? 1 : 0;
    break;
  }
  case "summary": {
    const done = quests.filter((q) => q.status === "done").sort((a, b) => (b.completed || "").localeCompare(a.completed || ""));
    console.log(`Open: ${quests.filter((q) => OPEN.has(q.status)).length} \xB7 Requests: ${quests.filter((q) => q.status === "requested").length} \xB7 Done: ${done.length} \xB7 Quest XP: ${done.reduce((s, q) => s + (q.xp || 0), 0)}`);
    console.log("Recent turn-ins:");
    done.slice(0, 5).forEach((q) => console.log(`  ${(q.completed || "").slice(0, 10)}  +${q.xp}  ${q.title}  [${q.evidence?.type}]`));
    break;
  }
  case "skill": {
    const doc = readShowcase();
    const live = doc.skills.filter((s) => !s.removed);
    if (f._?.[0] === "add") {
      if (!f.name) fail("skill add needs --name");
      const id = f.id || slug(f.name);
      if (live.some((s2) => s2.id === id || slug(s2.name) === slug(f.name))) fail(`Refused: a skill "${f.name}" already exists.`);
      const s = {
        id,
        name: String(f.name),
        kind: f.kind || "active",
        status: f.status || "known",
        startLevel: f.status === "aspiring" ? 0 : Number(f.level || 1),
        category: f.category,
        note: f.note,
        since: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        author: f.author || "guildmaster",
        updated: (/* @__PURE__ */ new Date()).toISOString()
      };
      const errs = validateSkill(s);
      if (errs.length) fail(`Not saved \u2014 ${errs.join("; ")}`);
      saveShowcase({ ...doc, skills: [...doc.skills.filter((x) => x.id !== id), s] });
      console.log(`Added skill ${id}`);
    } else live.forEach((s) => console.log(`${s.id.padEnd(30)} ${(SKILL_KINDS[s.kind] || s.kind).padEnd(8)} ${String(s.status).padEnd(9)} Lv${s.startLevel ?? 1}  ${s.name}`));
    break;
  }
  case "trophy": {
    const doc = readShowcase();
    const live = doc.achievements.filter((t) => !t.removed);
    if (f._?.[0] === "add") {
      if (!f.title) fail("trophy add needs --title");
      const id = f.id || `life-${slug(f.title)}`.slice(0, 70);
      if (live.some((t2) => t2.id === id)) fail(`Refused: trophy ${id} already exists.`);
      const t = {
        id,
        title: String(f.title),
        detail: f.detail,
        status: f.goal ? "goal" : "earned",
        date: f.date || (f.goal ? void 0 : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)),
        tier: f.tier || "gold",
        icon: f.icon || "\u2605",
        category: f.category,
        author: f.author || "guildmaster",
        updated: (/* @__PURE__ */ new Date()).toISOString()
      };
      const errs = validateTrophy(t);
      if (errs.length) fail(`Not saved \u2014 ${errs.join("; ")}`);
      saveShowcase({ ...doc, achievements: [...doc.achievements.filter((x) => x.id !== id), t] });
      console.log(`Placed ${t.status === "goal" ? "goal" : "trophy"} ${id}`);
    } else live.forEach((t) => console.log(`${t.id.padEnd(40)} ${String(t.status).padEnd(7)} ${String(t.tier).padEnd(7)} ${t.date || ""}  ${t.title}`));
    break;
  }
  case "forge": {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const tasks = readJson("data/tasks.json", {}).tasks || [], history = readJson("data/history.json", {}).entries || [];
    const sources = readFrontMatter("research/sources"), pieces = readFrontMatter("research/writing");
    const res = forge({ tasks, history, sources, pieces, showcase: readShowcase(), quests, today });
    const top = res.candidates.slice(0, Number(f.limit) || 10);
    if (f.json) {
      console.log(JSON.stringify({ ...res, candidates: top }, null, 2));
      break;
    }
    console.log(`Forge (read-only): ${res.candidates.length} candidates from ${tasks.length} tasks, ${sources.length} sources, ${pieces.length} pieces, ${readShowcase().skills.length} skills. Journal not read.`);
    if (res.next) console.log(`Grade ${res.grade}; the ${res.next}-grade test needs ${res.lifeNeeded} more life quest${res.lifeNeeded === 1 ? "" : "s"}.`);
    if (res.skipped.declined || res.skipped.linked) console.log(`Left out: ${res.skipped.linked} task(s) already on a quest, ${res.skipped.declined} whose quest was declined.`);
    top.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. [${c.score}] ${c.source.padEnd(7)} ${c.title}
      ${c.why.join(" \xB7 ")}
      ${addCommand(c)}`));
    console.log("Post the ones Silica would want with add (edit the brief and difficulty first); nothing was written.");
    break;
  }
  default:
    console.log(`Commands: list, requests, show, add, shape, set, remove, validate, summary, skill, trophy, forge. Difficulties: ${Object.keys(DIFFICULTY).join(", ")}.`);
}
