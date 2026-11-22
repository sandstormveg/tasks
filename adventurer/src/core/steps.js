// Watch-counted steps -> Vitality points. The watch app owns
// quests/steps.json ({"days": {"YYYY-MM-DD": steps}}); this app only reads it.

export const STEPS_PER_VIT = 1000;

/** Per-day Vitality points (floor(steps / stepsPerVit)) and the total. */
export function vitFromSteps(days, stepsPerVit = STEPS_PER_VIT) {
  const per = Number(stepsPerVit) > 0 ? Number(stepsPerVit) : STEPS_PER_VIT;
  const perDay = {};
  let total = 0;
  for (const [day, raw] of Object.entries(days || {})) {
    const steps = Math.max(0, Math.floor(Number(raw) || 0));
    const points = Math.floor(steps / per);
    perDay[day] = points;
    total += points;
  }
  return { perDay, total };
}

/** The steps file's days, or none: a missing or malformed file is not an error. */
export function stepsDoc(text) {
  if (!text) return { days: {} };
  try {
    const doc = JSON.parse(text);
    if (doc && doc.days && typeof doc.days === "object") return doc;
  } catch {}
  return { days: {} };
}

/** Keep every day and unknown key; today becomes max(existing, new). */
export function mergeStepsDoc(doc, date, steps) {
  const base = doc && typeof doc === "object" ? doc : {};
  const days = { ...(base.days && typeof base.days === "object" ? base.days : {}) };
  const n = Math.max(0, Math.floor(Number(steps) || 0));
  const had = Math.max(0, Math.floor(Number(days[date]) || 0));
  days[date] = Math.max(had, n);
  return { ...base, days };
}

export const STEPS_WRITE_EVERY_MS = 10 * 60 * 1000;

/** True when a steps.json write is due: at most one every ten minutes. */
export function dueStepsWrite(lastAt, now, every = STEPS_WRITE_EVERY_MS) {
  return !lastAt || now - lastAt >= every;
}
