// Watch workouts from Health Connect become jogs. The shell's HealthSteps plugin
// reads exercise sessions; only the totals of a session are kept (steps, distance,
// minutes), never heart rate or a route. Pure: the app does the plugin reads and writes.

import { complete } from "./quests.js";

// Any session type counts: watches label an indoor or fitness walk "other", and the
// steps read for the session decide whether it was a jog (the endurance mission wants 3,000+).
export const MIN_WORKOUT_MS = 10 * 60 * 1000;

const nameOf = (s) => String(s?.name || s?.type || "").trim().toLowerCase();
const ms = (s) => {
  const a = Date.parse(s?.start), b = Date.parse(s?.end);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
};

/** Sessions worth importing: any type, at least ten minutes, inside the window, not already imported. */
export function workoutCandidates(sessions, { since, imported = new Set() } = {}) {
  const from = Date.parse(since || "");
  return (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && typeof s.id === "string")
    .filter((s) => ms(s) >= MIN_WORKOUT_MS)
    .filter((s) => !Number.isFinite(from) || Date.parse(s.start) >= from)
    .filter((s) => !imported.has(s.id))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/** The quest id for a session: stable, lowercase kebab-case, inside the 80-character limit. */
export function workoutId(session) {
  const raw = String(session?.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `workout-${raw || String(Date.parse(session?.start) || "session").replace(/[^0-9]/g, "").slice(0, 20)}`;
}

/** A completed self-jog for one session, shaped exactly like runJog's. */
export function workoutQuest(session, { steps, meters = null, minutes }, { now }) {
  const n = Math.max(0, Math.round(Number(steps) || 0));
  const name = nameOf(session) || "other";
  const q = {
    id: workoutId(session),
    title: `Workout: ${name}, ${n.toLocaleString("en-AU")} steps`,
    status: "accepted", origin: "self", giver: "self", author: "self",
    taskIds: [], difficulty: n < 5000 ? "easy" : "normal", attributes: { vit: 1, agi: 0.5 },
    skills: { running: 1 }, proof: { type: "jog", steps: n }, posted: now, accepted: now,
  };
  const evidence = { meters: meters == null ? null : Number.isFinite(Number(meters)) ? Number(meters) : null, steps: n, minutes: Math.max(1, Math.round(Number(minutes) || 0)), tracked: true, source: "health-connect", started: session?.start || null };
  return complete(q, { proofType: "jog", evidence, at: now });
}

/** Minutes in a session, at least one. */
export function workoutMinutes(session) {
  return Math.max(1, Math.round(ms(session) / 60000));
}
