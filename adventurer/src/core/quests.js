// The quest record: one JSON file per quest in quests/board/ of the private
// tasks-data repo, written by the app (you, the receptionist's intake, local
// scouting) and by the guild master's tool (tools/quests.mjs). Pure, shared by
// both, so the app and the tool agree on what a valid quest is.
//
// Quests point at tasks by id (taskIds) instead of copying them: the task stays
// the record, the quest is the adventure built on it.

export const STATUSES = ["requested", "posted", "accepted", "done", "declined", "expired"];
export const OPEN = new Set(["posted", "accepted"]);
export const ORIGINS = ["task", "inferred", "request", "guild", "local", "self"];
export const GIVERS = ["guildmaster", "relay", "board", "self"];
export const PROOFS = ["gps", "reps", "photo", "journal", "honor"];
export const EXERCISES = ["pushup", "squat", "situp", "dip", "pullup"];

export const DIFFICULTY = {
  trivial: { xp: 10, label: "Trivial" },
  easy: { xp: 25, label: "Easy" },
  normal: { xp: 50, label: "Normal" },
  hard: { xp: 100, label: "Hard" },
  epic: { xp: 250, label: "Epic" },
};

/** Verified proof pays in full; your word alone pays a bit over half. */
export const PROOF_RATE = { gps: 1, reps: 1, photo: 0.9, journal: 0.9, honor: 0.6 };

export const PROOF_LABEL = {
  gps: "GPS check-in",
  reps: "Camera-verified reps",
  photo: "Photo",
  journal: "Journal link",
  honor: "Your word",
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slug(text) {
  return String(text || "quest").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quest";
}

/** A unique id from a title: refuses to reuse one already on the board. */
export function newId(title, taken = new Set(), stamp = Date.now()) {
  const base = slug(title);
  if (!taken.has(base)) return base;
  const id = `${base}-${stamp.toString(36).slice(-5)}`;
  return taken.has(id) ? `${id}-${Math.random().toString(36).slice(2, 5)}` : id;
}

/** Fill defaults so older or hand-written files read the same. Unknown fields are kept. */
export function normalize(q) {
  return {
    ...q,
    origin: q.origin || "self",
    giver: q.giver || "self",
    taskIds: Array.isArray(q.taskIds) ? q.taskIds : [],
    difficulty: DIFFICULTY[q.difficulty] ? q.difficulty : "normal",
    attributes: q.attributes && typeof q.attributes === "object" ? q.attributes : {},
    proof: q.proof && PROOFS.includes(q.proof.type) ? q.proof : { type: "honor" },
    status: STATUSES.includes(q.status) ? q.status : "posted",
  };
}

/** Problems with a quest, as plain sentences (empty when it's fine). */
export function validate(q) {
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
  if (q.expires && !/^\d{4}-\d{2}-\d{2}/.test(q.expires)) errs.push("expires must be a date (YYYY-MM-DD)");
  return errs;
}

/** What a quest pays, given the proof actually handed in. */
export function payout(q, proofType = q.proof?.type) {
  const base = DIFFICULTY[q.difficulty]?.xp ?? DIFFICULTY.normal.xp;
  return Math.round(base * (PROOF_RATE[proofType] ?? PROOF_RATE.honor));
}

export function isExpired(q, today) {
  return OPEN.has(q.status) && !!q.expires && q.expires.slice(0, 10) < today;
}

/** Board order: inferred and guild-master quests first, then soonest deadline, then newest. */
export function boardOrder(a, b) {
  const rank = (q) => (q.status === "accepted" ? 0 : q.origin === "inferred" ? 1 : q.giver === "guildmaster" ? 2 : 3);
  return rank(a) - rank(b) || (a.expires || "9999").localeCompare(b.expires || "9999") || (b.posted || "").localeCompare(a.posted || "");
}

/** Turn in: the quest with its evidence, stamped and paid. */
export function complete(q, { proofType, evidence = {}, at }) {
  return { ...q, status: "done", completed: at, evidence: { type: proofType, ...evidence }, xp: payout(q, proofType) };
}

/** Deterministic file text: stable key order so unchanged quests never make a diff. */
export function serialize(q) {
  const order = ["id", "title", "brief", "detail", "why", "status", "origin", "giver", "author", "taskIds", "difficulty", "attributes",
    "proof", "posted", "expires", "accepted", "completed", "evidence", "xp"];
  const out = {};
  for (const k of order) if (q[k] !== undefined) out[k] = q[k];
  for (const k of Object.keys(q).sort()) if (!(k in out) && q[k] !== undefined && !k.startsWith("_")) out[k] = q[k];
  return JSON.stringify(out, null, 2) + "\n";
}
