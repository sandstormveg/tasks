// Generated from sandstormveg/Adventurer tools/quests.mjs by npm run bundle-cli. Don't edit here.

// tools/quests.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

// src/core/quests.js
var STATUSES = ["requested", "posted", "accepted", "done", "declined", "expired"];
var OPEN = /* @__PURE__ */ new Set(["posted", "accepted"]);
var ORIGINS = ["task", "inferred", "request", "guild", "local", "self"];
var GIVERS = ["guildmaster", "relay", "board", "self"];
var PROOFS = ["gps", "reps", "photo", "journal", "honor"];
var EXERCISES = ["pushup", "squat", "situp", "dip", "pullup"];
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
      if (!EXERCISES.includes(p.exercise)) errs.push(`proof.exercise must be one of ${EXERCISES.join(", ")}`);
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
  return errs;
}
function payout(q, proofType = q.proof?.type) {
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

// src/core/stats.js
var RANKS = [
  { id: "E", title: "Novice Pathfinder", min: 0 },
  { id: "D", title: "Iron Wayfarer", min: 200 },
  { id: "C", title: "Bronze Vanguard", min: 600 },
  { id: "B", title: "Silver Scoutmaster", min: 1400 },
  { id: "A", title: "Golden Sovereign", min: 2800 },
  { id: "S", title: "Mythic Vanguard", min: 5e3 }
];

// src/core/achievements.js
var TROPHY_TIERS = { bronze: "Bronze", silver: "Silver", gold: "Gold", mythic: "Mythic" };
var count = (key, n) => (f2) => ({ value: f2[key].length, target: n, date: f2[key][n - 1] || null });
var rank = (id) => (f2) => {
  const min = RANKS.find((r) => r.id === id).min;
  return { value: f2.xp, target: min, date: f2.xpAt.find(([, x]) => x >= min)?.[0] || null };
};
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
  { id: "rank-c", title: "Bronze Vanguard", desc: "Reach guild rank C.", tier: "silver", icon: "\u25C6", check: rank("C") },
  { id: "rank-a", title: "Golden Sovereign", desc: "Reach guild rank A.", tier: "gold", icon: "\u25C6", check: rank("A") },
  { id: "rank-s", title: "Mythic Vanguard", desc: "Reach guild rank S.", tier: "mythic", icon: "\u25C6", check: rank("S") },
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
    expires: f2.expires || base.expires
  };
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
      if (["evidence", "xp", "completed"].includes(k)) fail("Turn-ins happen in the app, with proof \u2014 the tool doesn't stamp quests.");
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
  default:
    console.log(`Commands: list, requests, show, add, shape, set, remove, validate, summary, skill, trophy. Difficulties: ${Object.keys(DIFFICULTY).join(", ")}.`);
}
