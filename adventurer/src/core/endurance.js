// The trainer's daily endurance mission. It ticks itself off: any jog done that day
// (a watch workout imported from Health Connect, or a GPS-tracked jog) with enough
// steps completes it. Pure: the app posts and stores what this returns.

import { complete, localDay } from "./quests.js";

export const ENDURANCE_STEPS = 3000;

export const enduranceId = (day) => `endure-${day}`;
const isEndurance = (q) => q?.origin === "endurance";
const OPEN = new Set(["posted", "accepted"]);

/** Today's mission, open until a jog reaches the step target. */
export function enduranceMission(day, now, steps = ENDURANCE_STEPS) {
  return {
    id: enduranceId(day),
    title: `Endurance: one workout of ${steps.toLocaleString("en-AU")}+ steps`,
    brief: "Ticks itself off when a watch workout or tracked jog that day reaches it.",
    status: "posted", origin: "endurance", giver: "trainer", author: "trainer",
    taskIds: [], difficulty: "easy", attributes: { vit: 1 }, skills: { running: 1 },
    proof: { type: "jog", steps }, posted: now, expires: day,
  };
}

/** The day a jog happened: the workout's own start when known, else when it was logged. */
export const jogDay = (q) => localDay(q?.evidence?.started || q?.completed);

/** The biggest jog done on a day that reaches the target, or null. */
export function qualifyingJog(quests, day, steps = ENDURANCE_STEPS) {
  return (quests || [])
    .filter((q) => q && !isEndurance(q) && q.status === "done" && q.proof?.type === "jog" && jogDay(q) === day && (Number(q.evidence?.steps) || 0) >= steps)
    .sort((a, b) => (Number(b.evidence.steps) || 0) - (Number(a.evidence.steps) || 0))[0] || null;
}

/**
 * What to store now: today's mission if it isn't posted yet, and any open endurance
 * mission from today or yesterday that a jog has earned (a workout imported the next
 * morning still counts for its own day). `quests` is the raw store, not the expiry view.
 */
export function enduranceUpdates(quests, { today, yesterday, now }) {
  const all = quests || [];
  const out = [];
  const mine = all.filter(isEndurance);
  if (!mine.some((q) => q.id === enduranceId(today))) out.push(enduranceMission(today, now));
  for (const q of [...mine, ...out]) {
    const day = q.expires?.slice(0, 10);
    if (!OPEN.has(q.status) || (day !== today && day !== yesterday)) continue;
    const jog = qualifyingJog(all, day, q.proof?.steps || ENDURANCE_STEPS);
    if (!jog) continue;
    const done = complete(q, { proofType: "jog", evidence: { steps: Number(jog.evidence.steps), from: jog.id, tracked: true }, at: now });
    const i = out.indexOf(q);
    if (i >= 0) out[i] = done; else out.push(done);
  }
  return out;
}
