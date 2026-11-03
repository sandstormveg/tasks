// The forge: candidate quests drawn from what you already said you want to do —
// open tasks, your reading list, writing in progress, your goals and the skills
// you're learning — ranked, each with the plain facts behind its place. It only
// suggests: the guild master (tools/quests.mjs forge) reads this list instead of
// whole repos, picks, and posts with `add`. Pure, so it's tested in Node.
//
// It never reads the journal. Declining a quest is data too: a task whose quest
// you declined isn't offered again.

import { slug, OPEN } from "./quests.js";
import { eligibility } from "./grades.js";

const DAY = 86400000;
const days = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(String(from).slice(0, 10))) / DAY));

/** Attribute weights from a category's name (Tasks categories are free text). */
export function attributesFor(category = "") {
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

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const weeksAgo = (d) => (d >= 14 ? `waiting ${Math.round(d / 7)} weeks` : d >= 2 ? `waiting ${d} days` : "new");

/**
 * Ranked candidates. Each: {score, source, title, why[], quest} where quest holds
 * the fields to post it with (title, taskIds, difficulty, proof, attributes, skills, origin).
 */
export function forge({ tasks = [], history = [], sources = [], pieces = [], showcase = {}, quests = [], today }) {
  const linked = new Map(); // task id -> statuses of quests built on it
  for (const q of quests) for (const id of q.taskIds || []) (linked.get(String(id)) || linked.set(String(id), []).get(String(id))).push(q.status);
  const onBoard = new Set(quests.filter((q) => OPEN.has(q.status) || q.status === "requested").map((q) => slug(q.title)));
  const skills = (showcase.skills || []).filter((s) => !s.removed);
  const learning = skills.filter((s) => ["learning", "aspiring"].includes(s.status));
  const skillsIn = (text) => skills.filter((s) => new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));

  // Momentum: what you've actually been finishing this month, by category.
  const recent = {};
  for (const h of history) if (h.completedDate && days(h.completedDate, today) <= 30) recent[h.category] = (recent[h.category] || 0) + 1;

  const out = [];
  const skipped = { declined: 0, linked: 0 };
  const steps = (t) => (t.noteItems || []).length + tasks.filter((s) => s.parentId === t.id).length;

  for (const t of tasks) {
    if (t.parentId != null) continue; // steps of a bigger task count toward it
    const st = linked.get(String(t.id)) || [];
    if (st.includes("declined")) { skipped.declined++; continue; }
    if (st.some((s) => s !== "expired")) { skipped.linked++; continue; }
    const why = [], age = days(t.created, today), n = steps(t), mom = recent[t.category] || 0;
    let score = 2;
    score += Math.min(3, Math.floor(age / 14)); why.push(weeksAgo(age));
    if (n) { score += 1; why.push(plural(n, "step")); }
    if (mom) { score += Math.min(3, mom); why.push(`you finished ${plural(mom, `${t.category} task`)} this month`); }
    if (/shop|grocer/i.test(t.category || "")) { score -= 2; why.push("an errand"); }
    const sk = skillsIn(t.title);
    if (sk.length) { score += 2; why.push(`practises ${sk.map((s) => s.name).join(", ")}`); }
    out.push({ score, source: "task", title: t.title, why, quest: {
      title: t.title, origin: "task", taskIds: [String(t.id)], difficulty: n >= 4 ? "hard" : n ? "normal" : "easy",
      proof: { type: "honor" }, attributes: attributesFor(t.category), skills: sk.length ? Object.fromEntries(sk.map((s) => [s.id, 1])) : undefined,
    } });
  }

  for (const s of sources) {
    if (!["to-read", "inbox", "reading"].includes(s.status)) continue;
    const why = [s.status === "reading" ? "you started it" : s.status === "to-read" ? "on your to-read list" : "in your Deposit inbox"];
    let score = s.status === "reading" ? 4 : s.status === "to-read" ? 3 : 1;
    if (s.favourite) { score += 2; why.push("a favourite"); }
    const age = days(s.added || today, today);
    if (age >= 14) { score += 1; why.push(weeksAgo(age)); }
    out.push({ score, source: "reading", title: `Read: ${s.title}`, why, quest: {
      title: `Read: ${s.title}`, origin: "self", difficulty: "normal", proof: { type: "journal" }, attributes: { int: 1 },
    } });
  }

  for (const p of pieces) {
    if (!["idea", "drafting"].includes(p.status)) continue;
    const why = [p.status === "drafting" ? "a draft in progress" : "an idea you saved"];
    out.push({ score: p.status === "drafting" ? 4 : 2, source: "writing", title: `Write 300 words of “${p.title}”`, why, quest: {
      title: `Write 300 words of “${p.title}”`, origin: "self", difficulty: "normal", proof: { type: "honor" }, attributes: { wis: 0.5, int: 0.5 },
    } });
  }

  for (const g of (showcase.achievements || []).filter((a) => a.status === "goal" && !a.removed)) {
    out.push({ score: 4, source: "goal", title: `A step toward: ${g.title}`, why: ["a goal you set"], quest: {
      title: `A step toward: ${g.title}`, origin: "self", difficulty: "normal", proof: { type: "honor" }, attributes: { wil: 1 },
    } });
  }
  for (const s of learning) {
    out.push({ score: s.status === "learning" ? 3 : 2, source: "skill", title: `Practise ${s.name}`, why: [s.status === "learning" ? "a skill you're learning" : "a skill you want"], quest: {
      title: `Practise ${s.name}`, origin: "self", difficulty: "normal", proof: { type: "honor" }, attributes: { int: 0.5, wil: 0.5 }, skills: { [s.id]: 1 },
    } });
  }

  const ranked = out.filter((c) => !onBoard.has(slug(c.title))).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const el = eligibility(quests, { today });
  const lifeNeeded = el.next ? Math.max(0, el.life.need - el.life.have) : 0;
  return { candidates: ranked, skipped, grade: el.grade.id, next: el.next?.id ?? null, lifeNeeded };
}

/** The `add` command that would post a candidate (the guild master edits before running it). */
export function addCommand(c) {
  const q = c.quest, w = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(",");
  return ["add", "--title", JSON.stringify(q.title), ...q.taskIds?.flatMap((id) => ["--task", id]) ?? [],
    "--origin", q.origin, "--difficulty", q.difficulty, "--proof", q.proof.type, "--attr", w(q.attributes),
    ...(q.skills ? ["--skill", w(q.skills)] : [])].join(" ");
}
