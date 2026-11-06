// Expeditions: quests with several objectives, each of a type and, optionally,
// linked to a real record in another of Silica's systems, so it completes when
// that record exists (a task ticked off, a source filed in Research, another
// quest done) or by a proof the app already has (a check-in, counted reps, a
// journal day linked by date only — the journal itself is never read).
//
//   objectives: [{ id, type, text, xp, optional?, link?: { system, ref?, tag?, kind?, status?, count?,
//                  target?: {lat, lng, place, radius}, exercise?, count? } }]
//   progress:   { <objective id>: { at, by: "auto" | "you", refs?: ["research:s-…", "tasks:…", "journal:2026-11-06"] } }
//
// The guild master writes objectives; only the app writes progress (like evidence).
// Attribution: a record pays once. A source, task or journal day credited to one
// objective can't complete another, on this quest or any other.

export const OBJECTIVE_TYPES = {
  exploration: "🧭", social: "🤝", research: "§", creation: "✦", reflection: "✎", learning: "◇", physical: "⚔", discovery: "✧",
};
export const SYSTEMS = ["tasks", "research", "journal", "quests", "reps", "gps"];
const AUTO = new Set(["tasks", "research", "quests"]);
const EXERCISES = ["pushup", "squat", "situp", "dip", "pullup"];

export const hasObjectives = (q) => Array.isArray(q?.objectives) && q.objectives.length > 0;
export const isAuto = (o) => AUTO.has(o.link?.system);
export const isDone = (q, o) => !!q.progress?.[o.id];

/** Problems with a quest's objectives, as plain sentences. */
export function validateObjectives(q) {
  const errs = [];
  if (q.objectives === undefined) return errs;
  if (!Array.isArray(q.objectives) || q.objectives.length > 12) return ["objectives must be a list of up to 12"];
  const ids = new Set();
  for (const o of q.objectives) {
    const at = `objective ${o?.id || "?"}`;
    if (!o || typeof o !== "object") { errs.push("each objective must be an object"); continue; }
    if (!/^[a-z0-9-]{1,24}$/.test(o.id || "")) errs.push(`${at}: id must be short kebab-case`);
    if (ids.has(o.id)) errs.push(`${at}: ids must be unique`);
    ids.add(o.id);
    if (!OBJECTIVE_TYPES[o.type]) errs.push(`${at}: type must be one of ${Object.keys(OBJECTIVE_TYPES).join(", ")}`);
    if (!o.text || typeof o.text !== "string") errs.push(`${at}: text is required`);
    if (!(Number.isInteger(o.xp) && o.xp >= 0 && o.xp <= 500)) errs.push(`${at}: xp must be a whole number from 0 to 500`);
    const l = o.link;
    if (l === undefined) continue;
    if (!SYSTEMS.includes(l.system)) { errs.push(`${at}: link.system must be one of ${SYSTEMS.join(", ")}`); continue; }
    if ((l.system === "tasks" || l.system === "quests") && !l.ref) errs.push(`${at}: a ${l.system} link needs a ref (its id)`);
    if (l.system === "research" && !l.ref && !l.tag && !l.kind) errs.push(`${at}: a research link needs a ref (source, board or piece id) or a tag/kind to match`);
    if (l.system === "gps" && !(Number.isFinite(l.target?.lat) && Number.isFinite(l.target?.lng))) errs.push(`${at}: a gps link needs target {lat, lng} of a public place`);
    if (l.system === "reps" && (!EXERCISES.includes(l.exercise) || !(l.count > 0))) errs.push(`${at}: a reps link needs an exercise and a count`);
  }
  for (const k of Object.keys(q.progress || {})) if (!ids.has(k)) errs.push(`progress names an objective that doesn't exist: ${k}`);
  return errs;
}

/** XP: potential (mandatory), bonus (optional), earned (done so far). */
export function objectiveXp(q) {
  let potential = 0, bonus = 0, earned = 0;
  for (const o of q.objectives || []) {
    if (o.optional) bonus += o.xp; else potential += o.xp;
    if (isDone(q, o)) earned += o.xp;
  }
  return { potential, bonus, earned };
}

export function objectiveCount(q) {
  const all = q.objectives || [];
  return { done: all.filter((o) => isDone(q, o)).length, total: all.length, left: all.filter((o) => !o.optional && !isDone(q, o)).length };
}

/** Every mandatory objective is done: the expedition can be turned in. */
export const ready = (q) => hasObjectives(q) && objectiveCount(q).left === 0;

/** Records already credited, across every quest: each pays once. */
export function claimed(quests) {
  const s = new Set();
  for (const q of quests) for (const p of Object.values(q.progress || {})) for (const r of p.refs || []) s.add(r);
  return s;
}

const sourceMatches = (src, l) => (!l.tag || (src.tags || []).includes(l.tag)) && (!l.kind || src.kind === l.kind) && (!l.status || src.status === l.status);

/**
 * Ticks off objectives whose record now exists. research: { sources: [{id, tags, kind, status, added}], boards: [id], pieces: [id] }
 * (or null when it wasn't read). Returns only the quests that changed, as new objects.
 */
export function autoProgress(quests, { history = [], research = null, now }) {
  const taken = claimed(quests), doneTasks = new Set(history.map((h) => h.id));
  const doneQuests = new Set(quests.filter((q) => q.status === "done").map((q) => q.id));
  const changed = [];
  for (const q of quests) {
    if (q.status !== "accepted" || !hasObjectives(q)) continue;
    let progress = q.progress;
    const tick = (o, refs) => { progress = { ...progress, [o.id]: { at: now, by: "auto", refs } }; refs.forEach((r) => taken.add(r)); };
    for (const o of q.objectives) {
      if (progress?.[o.id] || !isAuto(o)) continue;
      const l = o.link;
      if (l.system === "tasks" && doneTasks.has(l.ref) && !taken.has(`tasks:${l.ref}`)) tick(o, [`tasks:${l.ref}`]);
      else if (l.system === "quests" && doneQuests.has(l.ref) && !taken.has(`quests:${l.ref}`)) tick(o, [`quests:${l.ref}`]);
      else if (l.system === "research" && research) {
        if (l.ref) {
          const exists = research.sources.some((s) => s.id === l.ref) || research.boards.includes(l.ref) || research.pieces.includes(l.ref);
          if (exists && !taken.has(`research:${l.ref}`)) tick(o, [`research:${l.ref}`]);
        } else {
          // Sources filed since the expedition was accepted, not yet credited anywhere.
          const since = (q.accepted || q.posted || "").slice(0, 10);
          const fresh = research.sources.filter((s) => (s.added || "").slice(0, 10) >= since && sourceMatches(s, l) && !taken.has(`research:${s.id}`));
          const need = Math.max(1, Number(l.count) || 1);
          if (fresh.length >= need) tick(o, fresh.slice(0, need).map((s) => `research:${s.id}`));
        }
      }
    }
    if (progress !== q.progress) changed.push({ ...q, progress });
  }
  return changed;
}

/** Marks one objective done by Silica (a tick, a check-in, counted reps, a linked journal day). */
export function markDone(q, id, { refs = [], at }) {
  return { ...q, progress: { ...q.progress, [id]: { at, by: "you", ...(refs.length ? { refs } : {}) } } };
}
export function unmark(q, id) {
  const { [id]: _, ...rest } = q.progress || {};
  return { ...q, progress: Object.keys(rest).length ? rest : undefined };
}

/** What finishes an objective, in a few words for its row. */
export function howItCompletes(o) {
  const l = o.link;
  if (!l) return "Tick it when it's done";
  if (l.system === "tasks") return "Done when its task is ticked off in Tasks";
  if (l.system === "quests") return "Done when that quest is turned in";
  if (l.system === "research") return l.ref ? "Done when it's in Research" : `Done when ${l.count > 1 ? `${l.count} sources` : "a source"}${l.tag ? ` tagged #${l.tag}` : ""}${l.kind ? ` (${l.kind})` : ""}${l.status ? `, ${l.status},` : ""} land in Research`;
  if (l.system === "journal") return "Link the journal day (only the date is kept)";
  if (l.system === "gps") return `Check in at ${l.target.place || "the marked spot"}`;
  if (l.system === "reps") return `${l.count} ${l.exercise}s, camera-counted`;
  return "";
}

/**
 * The guild master's shorthand, for the tool:
 *   "research: Read one paper on emergent misalignment @research:tag=emergent-misalignment +30xp"
 *   "reflection: Write what you learned @journal +20xp optional"
 *   "exploration: Visit the State Library @gps:lat=-37.81,lng=144.96,place=State Library,radius=80 +25xp"
 *   "physical: 20 push-ups @reps:exercise=pushup,count=20 +15xp"   "creation: Ship it @tasks:ref=<task-id> +40xp"
 */
export function parseObjective(spec, n = 1) {
  const m = String(spec).trim().match(/^([a-z]+):\s*(.+?)(?:\s+@([a-z]+)(?::(.+?))?)?(?:\s+\+(\d+)\s*xp)?(\s+optional)?$/i);
  if (!m) throw new Error(`can't read objective "${spec}" — use "type: text [@system:key=value,…] [+30xp] [optional]"`);
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
    if (link.system === "gps") { const { lat, lng, place, radius, ...rest } = link; Object.assign(o, { link: { ...rest, target: { lat, lng, place, radius: radius || 60 } } }); }
    else o.link = link;
  }
  return o;
}
