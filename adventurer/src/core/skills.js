// Skills: the things Silica actually knows, is learning, or means to learn,
// each with a level, like a manhwa status screen's skill list. A skill starts
// at the level Silica gives it (self-assessed, honest is the point) and grows
// with the XP of turned-in quests that train it (quest.skills: {id: weight}).
// Pure; the list lives in quests/showcase.json. A quest tagged with a skill that isn't
// in the list unlocks it at Lv1 when it's turned in (Silica can rename or move it later),
// and a feat (rare/epic/legendary, core/quests.js) trains its skills 1.5×, 2× or 3×.

import { featTier } from "./quests.js";

export const SKILL_KINDS = { active: "Active", passive: "Passive", unique: "Unique" };
export const SKILL_STATUS = ["known", "learning", "aspiring"];

/** Cumulative XP to reach each level, Lv1…Lv10 (MAX). Lv0 is an aspiring skill not yet begun. */
export const SKILL_LEVELS = [0, 60, 160, 320, 560, 900, 1360, 1960, 2720, 3660];
export const MAX_SKILL_LEVEL = SKILL_LEVELS.length;

export function skillRank(level) {
  if (level <= 0) return "Sealed";
  if (level <= 2) return "Novice";
  if (level <= 4) return "Apprentice";
  if (level <= 6) return "Adept";
  if (level <= 8) return "Expert";
  if (level === 9) return "Master";
  return "Grandmaster";
}

/** Level from total skill XP; `base` is the XP the starting level stands for. */
export function skillLevel(xp) {
  let level = 0;
  for (let i = 0; i < SKILL_LEVELS.length; i++) if (xp >= SKILL_LEVELS[i]) level = i + 1;
  const floor = level ? SKILL_LEVELS[level - 1] : 0;
  const next = SKILL_LEVELS[level] ?? null;
  return { level, into: xp - floor, need: next == null ? 0 : next - floor, max: level >= MAX_SKILL_LEVEL };
}

export function validateSkill(s) {
  const errs = [];
  if (!s || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(s.id || "")) errs.push("skill id must be kebab-case");
  if (!s?.name) errs.push("skill name is required");
  if (s?.kind && !SKILL_KINDS[s.kind]) errs.push(`kind must be one of ${Object.keys(SKILL_KINDS).join(", ")}`);
  if (s?.status && !SKILL_STATUS.includes(s.status)) errs.push(`status must be one of ${SKILL_STATUS.join(", ")}`);
  if (s?.startLevel != null && !(s.startLevel >= 0 && s.startLevel <= MAX_SKILL_LEVEL)) errs.push(`startLevel must be 0–${MAX_SKILL_LEVEL}`);
  return errs;
}

export const FEAT_BOOST = { rare: 1.5, epic: 2, legendary: 3 };
const boost = (q) => FEAT_BOOST[featTier(q)] || 1;
const nameOf = (id) => id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Every skill with its level, XP and the quests that trained it. */
export function skillStats(skills = [], quests = []) {
  const done = quests.filter((q) => q.status === "done");
  // Tagged on a turned-in quest but not in the list: unlocked at Lv1. A removed skill stays removed.
  const listed = new Set(skills.map((s) => s.id));
  const unlocked = [...new Set(done.flatMap((q) => Object.keys(q.skills || {}).filter((id) => Number(q.skills[id]) > 0)))]
    .filter((id) => !listed.has(id)).map((id) => ({ id, name: nameOf(id), status: "learning", startLevel: 1, auto: true }));
  return [...skills.filter((s) => !s.removed), ...unlocked].map((s) => {
    const start = s.status === "aspiring" ? 0 : Math.max(1, Math.min(MAX_SKILL_LEVEL, Number(s.startLevel) || 1));
    const base = start ? SKILL_LEVELS[start - 1] : 0;
    const trained = done.filter((q) => Number(q.skills?.[s.id]) > 0);
    const earned = Math.round(trained.reduce((sum, q) => sum + (q.xp || 0) * Number(q.skills[s.id]) * boost(q), 0));
    const lv = skillLevel(base + earned);
    // An aspiring skill wakes at Lv1 with its first trained quest.
    const level = s.status === "aspiring" && !earned ? 0 : Math.max(lv.level, start);
    return { ...s, kind: s.kind || "active", status: s.status || "known", start, earned, xp: base + earned, ...lv, level, rank: skillRank(level), quests: trained.length };
  }).sort((a, b) => b.level - a.level || b.xp - a.xp || a.name.localeCompare(b.name));
}
