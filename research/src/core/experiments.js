// Experiments: things you might try, are trying, or have tried — each a small
// record in experiments/ next to your sources. A proposition is an idea to choose
// from (a question, why it matters, the method in a line or two, what it costs,
// the sources it comes from). Only you select one: then it's Active, and before
// you start you write your hypothesis and what you expect (like a source's
// "expect"), keep a dated log of steps, and work on its own corkboard. When it's
// Done you write the result, what surprised you and a verdict.
//
// Agents may propose and add to the log, always marked as theirs. They never
// select, and never write the hypothesis, expectation, result, surprise or verdict:
// those are yours (OWNER_FIELDS). A proposition is set aside, never deleted, so
// nothing is lost and a starter idea can't come back after you've put it away.

import { newId } from "./ids.js";

export const EXP_STATUSES = { proposed: "Proposition", active: "Active", done: "Done", shelved: "Set aside" };
export const VERDICTS = { confirmed: "Confirmed", refuted: "Refuted", unclear: "Unclear" };
export const COSTS = [["hours", "Hours"], ["money", "Money"], ["gpu", "GPU"]];
/** The owner's own thinking: never written by an agent. */
export const OWNER_FIELDS = ["hypothesis", "expected", "result", "surprised", "verdict"];

const text = (v) => String(v ?? "").trim();
const ids = (v) => (Array.isArray(v) && v.length ? [...new Set(v.map(String).filter(Boolean))] : undefined);

/** A cost as short words ("1 weekend", "under $10", "none"): only the parts given. */
export function cleanCost(c) {
  if (!c || typeof c !== "object") return undefined;
  const out = {};
  for (const [k] of COSTS) if (text(c[k])) out[k] = text(c[k]).slice(0, 80);
  return Object.keys(out).length ? out : undefined;
}

export function makeExperiment(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("x", now),
    type: "experiment",
    title: text(fields.title) || undefined,
    question: text(fields.question),
    why: text(fields.why) || undefined,
    method: text(fields.method) || undefined,
    cost: cleanCost(fields.cost),
    sources: ids(fields.sources),
    status: EXP_STATUSES[fields.status] ? fields.status : "proposed",
    author,
    created: now,
    updated: now,
    visibility: "private",
  };
}

/** A dated step for the log; returns the new log. */
export function addLogStep(exp, stepText, { now, author = "self" } = {}) {
  const t = text(stepText);
  if (!t) return exp.log || [];
  return [...(exp.log || []), { date: now, author, text: t }];
}

/**
 * Moving between columns. Selecting (→ active) is the owner's act alone; the others
 * stamp when it happened. Returns a patch, or { error } when the move isn't allowed.
 */
export function movePatch(exp, to, { now, byOwner = false } = {}) {
  if (!EXP_STATUSES[to]) return { error: `Unknown column "${to}". Use ${Object.keys(EXP_STATUSES).join(", ")}.` };
  if (exp.status === to) return { error: `Already ${EXP_STATUSES[to]}.` };
  if (to === "active" && !byOwner) return { error: "Only the owner selects a proposition — in the Experiments tab." };
  const patch = { status: to, updated: now };
  if (to === "active" && !exp.selected) patch.selected = now;
  if (to === "done") patch.finished = now;
  if (to !== "done" && exp.finished) patch.finished = undefined;
  return patch;
}

/** What an agent may set: a proposition's own fields and its log. Throws on anything else. */
export function agentPatchAllowed(patch) {
  const bad = Object.keys(patch).filter((k) => OWNER_FIELDS.includes(k) || k === "selected");
  if (bad.length) throw new Error(`Those are the owner's to write: ${bad.join(", ")}.`);
  return patch;
}

export function validateExperiment(rec) {
  const errors = [];
  if (!text(rec.question) && !text(rec.title)) errors.push("experiment needs a question");
  if (!EXP_STATUSES[rec.status]) errors.push(`unknown experiment status "${rec.status}"`);
  if (rec.verdict != null && !VERDICTS[rec.verdict]) errors.push(`unknown verdict "${rec.verdict}"`);
  if (rec.cost != null && (typeof rec.cost !== "object" || Array.isArray(rec.cost))) errors.push("cost must be a map of hours / money / gpu");
  else for (const k of Object.keys(rec.cost || {})) if (!COSTS.some(([c]) => c === k)) errors.push(`unknown cost "${k}"`);
  for (const k of ["sources", "produced"]) if (rec[k] != null && !Array.isArray(rec[k])) errors.push(`${k} must be a list of source ids`);
  for (const s of rec.log || []) if (!s?.date || !s?.text || !s?.author) errors.push("a log step needs date, author and text");
  if (rec.status === "proposed" && rec.verdict) errors.push("a proposition has no verdict yet");
  return errors;
}

/** Columns for the tab: propositions (newest first), active (latest selected first), done (latest finished first). */
export function columns(list) {
  const live = list.filter((x) => !x.deleted);
  const by = (k) => (a, b) => String(b[k] || b.updated || "").localeCompare(String(a[k] || a.updated || ""));
  return {
    proposed: live.filter((x) => x.status === "proposed").sort(by("created")),
    active: live.filter((x) => x.status === "active").sort(by("selected")),
    done: live.filter((x) => x.status === "done").sort(by("finished")),
    shelved: live.filter((x) => x.status === "shelved").sort(by("updated")),
  };
}

// Starter propositions, Claude's, from the director's note on the Interpretability paper list
// (s-20261112-0848-kjug) and the timelines update (s-20261112-0914-xzdk). Fixed ids, so two
// devices seeding at once make the same records rather than duplicates.
export const STARTERS = [
  { id: "x-seed-value-axis", title: "Value Axis replication",
    question: "Does a small open model carry a 'right track' direction that tells solvable maths problems from unsolvable ones?",
    why: "The Value Axis paper suggests models encode whether they're progressing towards a goal; replicating it small is the cheapest way to see it for yourself.",
    method: "Run Qwen 2.5 1.5B or Gemma 2 2B on solvable vs unsolvable problems, collect residual activations, train a linear probe and check it generalises.",
    cost: { hours: "about a weekend", money: "free", gpu: "laptop or a free Colab GPU" }, sources: ["s-20261112-0848-kjug"] },
  { id: "x-seed-chive-check", title: "CHIVE-style faithfulness check",
    question: "When a model explains its answer, does changing the factor it names actually change the answer?",
    why: "Tests whether self-explanations are faithful rather than plausible — the counterfactual idea behind CHIVE, on a scale you can run.",
    method: "Ask for an answer plus the factor it relied on; edit that factor (and a control factor) and measure how often the answer moves.",
    cost: { hours: "a few evenings", money: "API cost, a few dollars", gpu: "none" }, sources: ["s-20261112-0848-kjug"] },
  { id: "x-seed-memory-trap", title: "Memory Trap mini-test",
    question: "Given a memory file with one benign permission, how often does an agent over-generalise it to things you never allowed?",
    why: "The Memory Trap paper shows agents generalise permissions beyond what was granted; a small test shows whether the agents you use do too.",
    method: "Seed an agent's memory with one narrow permission, give it tasks just outside it, and count the times it acts as if allowed.",
    cost: { hours: "an evening or two", money: "API cost, a few dollars", gpu: "none" }, sources: ["s-20261112-0848-kjug"] },
  { id: "x-seed-sae-browse", title: "Browse SAE features on Neuronpedia",
    question: "What do Gemma Scope's sycophancy and deception features actually fire on?",
    why: "Zero setup, and a good first look at sparse-autoencoder features before training anything yourself.",
    method: "Search Neuronpedia's Gemma Scope features for sycophancy and deception; note top activations and anything that surprises you.",
    cost: { hours: "an hour or two", money: "free", gpu: "none" }, sources: ["s-20261112-0848-kjug"] },
  { id: "x-seed-score-timelines", title: "Score my own timelines probabilities",
    question: "What are my own probabilities for the AI Futures Project's milestones, and how do they move as evidence comes in?",
    why: "Forecasts move on partly hidden evidence; writing your own numbers down now makes later updates checkable, not vibes.",
    method: "Write dated probabilities for each milestone (superhuman AI researcher, TED-AI) by 2027 and 2028; revisit monthly and log what moved them.",
    cost: { hours: "an hour, then minutes a month", money: "free", gpu: "none" }, sources: ["s-20261112-0914-xzdk"] },
];

export function starterRecords({ now }) {
  return STARTERS.map((s) => ({ ...makeExperiment(s, { now, author: "claude" }), id: s.id }));
}
