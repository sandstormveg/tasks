// The journal's one outward signal: how many entries each day had, for the last ~60 days.
// Published as `activity.json` at the journal's root (tasks-data `journal/activity.json`) so other
// apps, like the Guild's daily Journal quest, can see that you wrote without opening entries/.
// Dates and counts only: no ids, titles, text or times. Pure.

export const ACTIVITY_PATH = "activity.json";
export const ACTIVITY_DAYS = 60;

/** {version:1, days:{"YYYY-MM-DD": n}} from entries, keeping days on or after `today` minus 60. */
export function activityOf(entries, { today, addDays }) {
  const from = addDays(today, -(ACTIVITY_DAYS - 1));
  const days = {};
  for (const e of entries) {
    if (e.deleted || !/^\d{4}-\d{2}-\d{2}$/.test(e.day || "") || e.day < from || e.day > today) continue;
    days[e.day] = (days[e.day] || 0) + 1;
  }
  const sorted = Object.fromEntries(Object.keys(days).sort().map((d) => [d, days[d]]));
  return { version: 1, days: sorted };
}

export const activityText = (a) => `${JSON.stringify(a, null, 2)}\n`;
