// Balance: Joy's nudge toward your weakest attribute. The status screen's radar
// is uneven when one attribute gets all the work (training is all STR), so the
// receptionist recommends one small quest for the attribute that's furthest
// behind, and says how to put a number on it where the radar needs one (typed
// active minutes or books, until a watch syncs). Pure and deterministic: no AI.

/** What would help each attribute: a quest to post, or a place to go (scout, train). */
export const SUGGEST = {
  str: { go: "#/train", label: "Open Train", line: "STR could use a set. The sergeant has today's ready." },
  vit: {
    line: "VIT's looking lonely. A 20-minute walk would cheer it up.",
    quest: { title: "A 20-minute walk", brief: "Easy pace: you should be able to talk. Your word is enough until the watch syncs.", attributes: { vit: 1 } },
    measure: "Or tap Measure on VIT in Stats with your weekly active minutes.",
  },
  agi: { act: "scout", label: "Scout nearby", line: "AGI wants somewhere new. Scout nearby finds a public place to check in." },
  int: {
    line: "INT's gone quiet. Thirty minutes with a book?",
    quest: { title: "Read for 30 minutes", brief: "Anything on your list. A chapter counts.", attributes: { int: 1 } },
    measure: "Finished a book lately? Tap Measure on INT in Stats.",
  },
  wis: {
    line: "WIS is the shy one. A few lines about your week would do it.",
    quest: { title: "Write a few lines about your week", brief: "In your journal or anywhere. What went well, what didn't.", attributes: { wis: 1 } },
  },
  cha: {
    line: "CHA misses people. Message someone you've been meaning to.",
    quest: { title: "Message someone you've been meaning to", brief: "A friend, family, anyone. A reply isn't required.", attributes: { cha: 1 } },
  },
  wil: {
    line: "WIL wants a win. Finish one task you've been putting off.",
    quest: { title: "Finish one task you've been putting off", brief: "The small annoying one. Done is the whole point.", attributes: { wil: 1 } },
  },
};

/**
 * The attribute furthest behind and what Joy recommends for it, or null when they're even.
 * attrs: attributeStats() rows. Behind = lowest percentile (unranked counts as 0), then least XP.
 * skip(id): true for a suggestion that's already on the board today, so the next one is offered.
 */
export function recommend(attrs = [], { skip = () => false } = {}) {
  const score = (a) => (a.percentile ?? 0) * 1000 + (a.xp || 0);
  const ranked = [...attrs].sort((a, b) => score(a) - score(b));
  if (ranked.length < 2) return null;
  const top = score(ranked[ranked.length - 1]);
  for (const a of ranked) {
    const s = SUGGEST[a.id];
    if (!s || skip(a.id)) continue;
    // Even enough: within 15 percentile points of the strongest.
    if (top - score(a) < 15000) return null;
    return { attr: a.id, name: a.name, line: s.line, quest: s.quest || null, act: s.act || null, go: s.go || null, label: s.label || null, measure: a.value == null ? s.measure || null : null };
  }
  return null;
}

/** The quest record for a recommendation (posted by Joy, on your word, easy). */
export function suggestionQuest(rec, { today, now }) {
  return {
    id: `joy-${rec.attr}-${today}`,
    ...rec.quest,
    status: "posted",
    origin: "self",
    giver: "relay",
    author: "relay",
    taskIds: [],
    difficulty: "easy",
    proof: { type: "honor" },
    posted: now,
    // Two days to get to it; tomorrow brings a fresh nudge if it's still behind.
    expires: new Date(Date.parse(`${today}T12:00:00Z`) + 2 * 864e5).toISOString().slice(0, 10),
  };
}
