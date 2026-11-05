// Relay, the guild's front-desk android. Every line is a template filled with
// board data, with a few variants so the counter doesn't repeat itself — no AI
// call ever happens on page view. The guild master (the director's scheduled
// pass) decides what gets posted; Relay only handles the counter.
//
// Tone: dry, warm, efficient, terminal-short. Notices effort; never nags.

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

/** A small stable number from a string, so the same day gets the same greeting. */
export function seedOf(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

const N = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * The greeting at the counter: 1–2 lines (quiet: 1; chatty: up to 3).
 * board: {fresh, expiringSoon, accepted, inferred, streak, name, rankUp}
 */
export function greet(board, { chattiness = "normal", seed = 0 } = {}) {
  const lines = [];
  const opener = pick(["Counter's open.", "Terminal live.", "Welcome back.", "Signal acquired.", "Badge scanned. Welcome."], seed);
  if (board.inferred) lines.push(`${opener} A request came in that seems meant for you.`);
  else if (board.fresh) lines.push(`${opener} ${N(board.fresh, "new quest")} on the board.`);
  else if (board.accepted) lines.push(`${opener} ${N(board.accepted, "quest")} in progress.`);
  else lines.push(`${opener} ${pick(["Board's quiet. Good time for a side quest.", "Nothing new posted. The guild master is thinking.", "Quiet shift. File a request if something's on your mind."], seed >> 3)}`);

  if (board.expiringSoon) lines.push(`${N(board.expiringSoon, "quest")} closing within two days.`);
  else if (board.streak >= 2) lines.push(pick([`Streak: ${board.streak} days. Noted.`, `${board.streak} days running. Logged.`, `Day ${board.streak} of the streak. Keep the line warm.`], seed >> 5));

  if (chattiness === "chatty") {
    if (board.rankUp) lines.push(`Rank ${board.rankUp} paperwork is on my desk. Congratulations.`);
    else lines.push(pick(["Coffee's synthetic. The quests aren't.", "I filed your last turn-in twice. Out of respect.", "Reminder: rest is a valid stat build.", "All systems nominal. Mostly."], seed >> 7));
  }
  return chattiness === "quiet" ? lines.slice(0, 1) : lines.slice(0, chattiness === "chatty" ? 3 : 2);
}

/** What Relay asks for at turn-in, by proof type. */
export function askProof(q) {
  const p = q.proof || { type: "honor" };
  switch (p.type) {
    case "gps": return `Check in at ${p.target?.place || "the marked spot"}. I only log the distance, never where you stood.`;
    case "reps": return `${p.count} ${p.exercise}${p.count === 1 ? "" : "s"}, camera-verified. Prop the phone up; I'll count.`;
    case "photo": return "A photo for the file, please. It stays in your private repo.";
    case "journal": return "Link the journal day this happened. I won't read it, just the date.";
    default: return "Your word is enough for this one. Tell me how it went.";
  }
}

export function stamped(q, xp, seed = 0) {
  return pick([`Quest logged. +${xp} XP. Stamped.`, `Stamped: "${q.title}". +${xp} XP.`, `Proof accepted. +${xp} XP to your file.`, `Clean turn-in. +${xp} XP.`], seed);
}

export function filedRequest(seed = 0) {
  return pick(["Request filed. The guild master shapes it on the next pass.", "Logged for the guild master. Expect a quest by the next pass.", "On the guild master's desk now."], seed);
}

/** Explaining a stat tier, tapped on the stats page. */
export function explainTier(a) {
  if (a.percentile == null) return `${a.label}: unranked. No measurement yet — missing isn't zero.`;
  const where = a.scale === "population"
    ? `You're around the top ${Math.max(1, Math.round(100 - a.percentile))}% of people your age.`
    : `Guild ladder, not population data: ${Math.round(a.percentile)}/100.`;
  const next = a.next && a.toNext != null ? ` ${a.toNext} ${a.unit} more to ${a.next.id}.` : a.next ? "" : " That's the top of the ladder.";
  return `${a.name} ${a.tier.id} (${a.tier.label}). ${where}${next}`;
}

export function inferredIntro(q) {
  return `A request came in that seems meant for you${q.why ? `: ${q.why}` : "."}`;
}

// Pep lines Relay says out loud (Settings › Receptionist voice). Always positive;
// the sass grows with chattiness. Short, so they finish before the toast does.
const ACCEPT = {
  quiet: ["Accepted. You've got this.", "Logged. Go get it.", "On your file. Good luck out there."],
  normal: ["Accepted. I believe in you, adventurer.", "Good pick. That one's yours now.", "Logged. Go make the guild proud.", "Quest taken. You're going to be great at this."],
  chatty: ["Ooh, bold choice. I like it. Go show them.", "Accepted. Try not to make it look too easy.", "Look at you, taking quests like a legend. Go on.", "Logged. I've already cleared space on the trophy shelf."],
};
const TURN_IN = {
  quiet: ["Well done.", "Stamped. Nice work.", "Done and logged. Proud of you."],
  normal: ["Stamped. That's real progress.", "Beautiful work. The file looks better already.", "Done. You keep showing up, and it shows.", "Quest complete. Take a second to feel good about it."],
  chatty: ["Stamped! Honestly? Show-off.", "Done already? Save some quests for the rest of the guild.", "Turned in. I'd act surprised, but I knew you would.", "Complete. Someone's levelling up and it isn't me."],
};
const tone = (c) => (c in ACCEPT ? c : "normal");
export const cheerAccept = ({ chattiness, seed = 0 } = {}) => pick(ACCEPT[tone(chattiness)], seed);
export const cheerTurnIn = (q, xp, { chattiness, seed = 0 } = {}) => `${pick(TURN_IN[tone(chattiness)], seed)} Plus ${xp} XP.`;
