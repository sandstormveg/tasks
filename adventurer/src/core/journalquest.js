// The daily Journal quest: a few lines in the journal, for Wisdom. It ticks itself off
// from journal/activity.json, a counts-only file the Journal publishes ({days: {date: n}}).
// Entries themselves are never opened. Pure: the app stores what this returns.

import { complete } from "./quests.js";

export const journalQuestId = (day) => `journal-${day}`;
const isJournal = (q) => q?.origin === "journal";
const OPEN = new Set(["posted", "accepted"]);

/** Entries written on a day, from the activity file's text (0 when unknown). */
export function entriesOn(activityText, day) {
  try { return Math.max(0, Math.floor(Number(JSON.parse(activityText || "{}")?.days?.[day]) || 0)); } catch { return 0; }
}

export function journalQuest(day, now) {
  return {
    id: journalQuestId(day),
    title: "Write in your journal",
    brief: "A few lines about today. Ticks itself off once an entry is saved; the Guild only sees that one was written.",
    status: "accepted", origin: "journal", giver: "board", author: "board",
    taskIds: [], difficulty: "easy", attributes: { wis: 1 },
    proof: { type: "journal" }, posted: now, accepted: now, expires: day,
  };
}

/** Post today's quest if missing; complete today's or yesterday's once an entry exists that day. */
export function journalUpdates(quests, activityText, { today, yesterday, now }) {
  const out = [];
  const mine = (quests || []).filter(isJournal);
  if (!mine.some((q) => q.id === journalQuestId(today))) out.push(journalQuest(today, now));
  for (const q of [...mine, ...out]) {
    const day = q.expires?.slice(0, 10);
    if (!OPEN.has(q.status) || (day !== today && day !== yesterday)) continue;
    const n = entriesOn(activityText, day);
    if (!n) continue;
    const done = complete(q, { proofType: "journal", evidence: { entries: n }, at: now });
    const i = out.indexOf(q);
    if (i >= 0) out[i] = done; else out.push(done);
  }
  return out;
}
