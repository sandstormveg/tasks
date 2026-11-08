// The companions: Marginalia, Research's archive automaton, and Quicksilver, the
// Journal's bard-alchemist (the character bible is docs/COMPANIONS.md). Like the
// Guild's Relay, every line is a template filled from what's already in the app,
// with a few variants per slot and a seed per day, so they don't repeat themselves.
// No AI call happens when you open an app. Pure functions; nothing here reads the DOM.
//
// What they may look at: Marginalia sees counts, titles, tags and board names from the
// library. Quicksilver sees only when you last wrote, how many entries today, and,
// if you turn "notice themes" on, the #tags of recent entries that aren't sealed.
// Neither one quotes your words back to you.

export const COMPANIONS = {
  marginalia: {
    id: "marginalia", name: "Marginalia", short: "Margin", app: "Research",
    question: "What can we discover?",
    // Older, measured, a little theatrical: a British voice, slower and lower.
    voice: { kind: "older", rate: 0.88, pitch: 0.8 },
  },
  quicksilver: {
    id: "quicksilver", name: "Quicksilver", short: "Silver", app: "Journal",
    question: "What does this reveal?",
    // Lighter and expressive: a warm British voice, a touch quicker.
    voice: { kind: "warm", rate: 1.05, pitch: 1.1 },
  },
};

export const CHATTINESS = { quiet: "Quiet", normal: "Normal", chatty: "Chatty" };

/** Device settings for one companion, with defaults: shown, voice off, normal chattiness. */
export function companionSettings(s = {}) {
  const c = s.companion || {};
  return {
    on: c.on !== false,
    chattiness: CHATTINESS[c.chattiness] ? c.chattiness : "normal",
    name: String(c.name || "").trim().slice(0, 24),
    voice: c.voice === true,
    voiceName: c.voiceName || "",
    voiceRate: Number.isFinite(Number(c.voiceRate)) && c.voiceRate !== "" && c.voiceRate != null ? Number(c.voiceRate) : null,
    voicePitch: Number.isFinite(Number(c.voicePitch)) && c.voicePitch !== "" && c.voicePitch != null ? Number(c.voicePitch) : null,
    themes: c.themes === true,
  };
}

/** A small stable number from a string, so the same day gets the same lines. */
export function seedOf(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const N = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cut = (s, n = 60) => { const t = String(s || "").trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t; };
const limit = (lines, chattiness) => (chattiness === "quiet" ? lines.slice(0, 1) : lines.slice(0, chattiness === "chatty" ? 4 : 3));

// ---------- Marginalia (Research) ----------

/**
 * What Marginalia can see, from the research records: counts, what's next to read,
 * the board with the most unexplained red string, and assist prompts.
 */
export function libraryState(records, { now = "" } = {}) {
  const live = records.filter((r) => !r.deleted);
  const sources = live.filter((r) => r.type === "source");
  const by = (st) => sources.filter((s) => s.status === st);
  const boards = new Map(live.filter((r) => r.type === "board").map((b) => [b.id, b]));
  const red = new Map();
  for (const s of live) if (s.type === "string" && s.state !== "synthesised" && boards.has(s.board)) red.set(s.board, (red.get(s.board) || 0) + 1);
  const [redBoard, redCount] = [...red.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const toRead = by("to-read").sort((a, b) => String(a.added || "").localeCompare(String(b.added || "")));
  const reading = by("reading").sort((a, b) => String(b.started || b.added || "").localeCompare(String(a.started || a.added || "")));
  const since = Date.parse(now) - 3 * 864e5;
  const answered = sources.filter((s) => (s.agent_notes || []).some((n) => Date.parse(n.date) >= since));
  const surprised = sources.filter((s) => String(s.surprised || "").trim()).sort((a, b) => String(b.finished || b.updated || "").localeCompare(String(a.finished || a.updated || "")));
  const day = String(now).slice(0, 10);
  return {
    total: sources.length,
    deposit: by("inbox").length,
    newToday: by("inbox").filter((s) => String(s.added || "").startsWith(day)).length,
    toRead: toRead.length,
    reading: reading.length,
    read: by("read").length,
    next: reading[0] ? { id: reading[0].id, title: reading[0].title, status: "reading" } : toRead[0] ? { id: toRead[0].id, title: toRead[0].title, status: "to-read" } : null,
    red: redBoard ? { board: redBoard, title: boards.get(redBoard).title, count: redCount, total: [...red.values()].reduce((a, b) => a + b, 0) } : null,
    waiting: sources.filter((s) => s.assist === true && String(s.prompt || "").trim() && !(s.agent_notes || []).some((n) => (Date.parse(n.date) || 0) >= (Date.parse(s.prompted || "") || 0))).length,
    answered: answered.length ? { count: answered.length, id: answered[0].id, title: answered[0].title } : null,
    surprised: surprised[0] ? { id: surprised[0].id, title: surprised[0].title } : null,
  };
}

/**
 * Marginalia's greeting: lines of { text, href? } — the library's state, a gap worth
 * looking at, what to read next. Quiet: 1 line; normal: up to 3; chatty: up to 4.
 */
export function marginaliaLines(st, { chattiness = "normal", seed = 0 } = {}) {
  const lines = [];
  const opener = pick(["Ah, you're back.", "The stacks are awake.", "Welcome to the archive.", "Lens polished. Shall we?", "Another day among the shelves."], seed);
  if (!st.total) lines.push({ text: `${opener} The shelves are bare. Paste anything into the donut and I'll find it a shelf.` });
  else if (st.newToday) lines.push({ text: `${opener} ${N(st.newToday, "new arrival")} today. Let me find ${st.newToday === 1 ? "it" : "them"} a shelf.` });
  else if (st.deposit) lines.push({ text: `${opener} ${N(st.deposit, "thing")} in the Deposit, waiting to be shelved.` });
  else lines.push({ text: `${opener} ${pick(["Everything is shelved. A rare and suspicious calm.", `${N(st.total, "source")} catalogued, nothing waiting at the door.`, "The Deposit is empty. I dusted it anyway."], seed >> 3)}` });

  if (st.answered) lines.push({ text: st.answered.count === 1 ? `I've left notes in the margins of “${cut(st.answered.title)}”, as you asked.` : `I've written in the margins of ${N(st.answered.count, "source")} you asked about.`, href: `#/source/${st.answered.id}` });
  else if (st.waiting) lines.push({ text: `${N(st.waiting, "question")} on my desk. I'll take ${st.waiting === 1 ? "it" : "them"} up on my next round.` });

  if (st.red) lines.push({ text: st.red.count === 1 ? `One red string on “${cut(st.red.title, 40)}” is still unexplained. What joins them?` : `${N(st.red.count, "red string")} on “${cut(st.red.title, 40)}” are still unexplained. What can we discover?`, href: `#/board/${st.red.board}` });
  if (st.next) lines.push({ text: st.next.status === "reading" ? `You left off in “${cut(st.next.title)}”. Shall we go back in?` : `Next on the shelf, if you'll take my suggestion: “${cut(st.next.title)}”.`, href: `#/source/${st.next.id}` });

  if (chattiness === "chatty") {
    if (st.surprised) lines.push({ text: `You marked “${cut(st.surprised.title, 40)}” as surprising. Those are always the interesting ones.`, href: `#/source/${st.surprised.id}` });
    else lines.push({ text: pick(["A contradiction is just two truths that haven't met properly.", "I never pretend to know. I only pretend to be patient.", "Every margin is an invitation.", "Ink-stained fingers are a sign of good company."], seed >> 5) });
  }
  return limit(lines, chattiness);
}

/** A short line for Marginalia's signature on an answered assist. */
export const marginaliaSigns = (seed = 0) => pick(["From the margins:", "My notes, for what they're worth:", "Here is what I found:", "Annotated, with care:"], seed);

// ---------- Quicksilver (Journal) ----------

/**
 * What Quicksilver can see: whether you've written today, when you last wrote, the hour,
 * and (only with themes on) #tags that keep coming back in the last week's unsealed entries.
 */
export function journalState(entries, { today, hour = 12, themes = false, addDays }) {
  const live = entries.filter((e) => !e.deleted);
  const days = [...new Set(live.map((e) => e.day).filter(Boolean))].sort();
  const last = days.filter((d) => d <= today).pop() || null;
  let streak = 0;
  for (let d = today; days.includes(d); d = addDays(d, -1)) streak++;
  const out = { today: live.filter((e) => e.day === today).length, last, streak, hour, themes: [] };
  if (last && last !== today) {
    let n = 0; for (let d = today; d > last && n < 400; d = addDays(d, -1)) n++;
    out.since = n;
  }
  if (themes) {
    const from = addDays(today, -6);
    const counts = new Map();
    for (const e of live) {
      if (e.sealed || e.privacy === "sealed" || !e.day || e.day < from || e.day > today) continue;
      for (const t of new Set(e.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
    }
    out.themes = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
  }
  return out;
}

// One gentle question per day; tapping it puts it above the writing box.
const PROMPTS = [
  "What's one thing from today worth keeping?",
  "What surprised you today, even a little?",
  "Where did your attention keep drifting?",
  "What did you make, mend or move forward?",
  "What would you tell yesterday's you?",
  "What felt heavier than it should have?",
  "What are you curious about right now?",
  "Who or what gave you energy today?",
  "What's one small thing that went right?",
  "If today were a vial, what colour would it glow?",
];

/**
 * Quicksilver's lines: a greeting, a gentle prompt (as { text, prompt }), and with themes on, a
 * theme it has noticed — always a question, never a verdict. Quiet: 1 line; normal 2–3; chatty up to 4.
 */
export function quicksilverLines(st, { chattiness = "normal", seed = 0 } = {}) {
  const lines = [];
  const part = st.hour < 5 ? "night" : st.hour < 12 ? "morning" : st.hour < 18 ? "afternoon" : "evening";
  const hello = {
    night: ["Still up? The vials glow brighter at this hour.", "Late, isn't it. Pour it out and we'll see what crystallises."],
    morning: ["Morning. The satchel's full of empty vials.", "Good morning. Fresh day, clean glass."],
    afternoon: ["Afternoon. Halfway through the story.", "Ah, the middle of the day, where the plot thickens."],
    evening: ["Evening. Time to distil the day.", "The lute's tuned. How did today go?"],
  }[part];
  if (st.today) lines.push({ text: pick([`${N(st.today, "entry", "entries")} already today. The mixture's taking shape.`, "You've written today. Anything still settling?", "Already some ink on today's page. More, or let it rest?"], seed) });
  else if (st.since >= 4) lines.push({ text: pick(["It's been a little while. No need to catch up — even a single word counts.", `${st.since} days of quiet. No entry needed; start wherever you are.`], seed) });
  else lines.push({ text: pick(hello, seed) });

  const prompt = PROMPTS[seed % PROMPTS.length];
  if (!st.today || chattiness !== "quiet") lines.push({ text: prompt, prompt });

  if (st.themes?.length) {
    const [tag, n] = st.themes[0];
    lines.push({ text: pick([`#${tag} has come up ${n} times this week. A theme, perhaps? What does it reveal?`, `${n} entries this week touch #${tag}. I wonder what it's distilling into.`, `The #${tag} vial keeps glowing — ${n} times this week. What do you make of it?`], seed >> 2), href: `#/search?q=${encodeURIComponent(`#${tag}`)}` });
  }
  if (chattiness === "chatty") {
    if (st.streak >= 3) lines.push({ text: `${st.streak} days running. That's a ballad, not a diary.` });
    else lines.push({ text: pick(["Lead into gold takes time. So do days.", "I only ask questions. The meaning is yours to keep.", "A patched coat has the best stories.", "No wrong answers. Only interesting ones."], seed >> 4) });
  }
  // Quiet keeps just one line: the day's question if there's no entry yet, else the greeting.
  if (chattiness === "quiet") return [lines.find((l) => l.prompt) || lines[0]];
  return limit(lines, chattiness);
}
