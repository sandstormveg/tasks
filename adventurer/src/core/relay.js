// Joy, the guild's receptionist. Every line comes from a small pool per moment
// (greeting, pitch, accept, turn-in, level-up, abandon, fail), picked at random
// and never the same line twice running — no AI call ever happens on page view.
// The guild master (the director's scheduled pass) decides what gets posted;
// Joy only handles the counter.
//
// Tone: short, simple, witty, warm. She never reads the quest back or explains
// how the app works; those details live in the ⓘ beside the proof (proofTip).

const last = new Map();
/** A line from the pool: by seed when given (stable), else random but not the last one said. */
function pick(arr, seed) {
  if (seed != null) return arr[Math.abs(seed) % arr.length];
  let i = Math.floor(Math.random() * arr.length);
  if (arr.length > 1 && i === last.get(arr)) i = (i + 1) % arr.length;
  last.set(arr, i);
  return arr[i];
}

/** A small stable number from a string, so the same day gets the same greeting. */
export function seedOf(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

const N = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

const OPENERS = ["Hi! Joy here.", "Oh good, it's you.", "Welcome back, hero.", "Desk's open. Mostly.", "Hey, you!", "There you are."];
const IDLE = ["Quiet board. Suspiciously quiet.", "Nothing new. I've alphabetised the pens.", "Board's empty. Got a wish to file?", "Slow day. I'm practising my stamp.", "No quests yet. The guild master's thinking very hard."];
const QUIPS = ["The coffee's fake. The XP is real.", "I stamped your last turn-in twice. For luck.", "Rest days count. I checked.", "I'd come with you, but who'd guard the stamp?", "Fun fact: I've never lost a quest. Misplaced, once."];

/**
 * The greeting at the counter: 1–2 lines (quiet: 1; chatty: up to 3).
 * board: {fresh, expiringSoon, accepted, inferred, streak, name, rankUp}
 */
export function greet(board, { chattiness = "normal", seed } = {}) {
  const lines = [];
  const opener = pick(OPENERS, seed);
  const s = (n) => (seed == null ? undefined : seed >> n);
  if (board.inferred) lines.push(`${opener} Someone asked for you. Well, for your vibe.`);
  else if (board.fresh) lines.push(`${opener} ${N(board.fresh, "new quest")}, still warm.`);
  else if (board.accepted) lines.push(`${opener} ${N(board.accepted, "quest")} on the go. No pressure. Some pressure.`);
  else lines.push(`${opener} ${pick(IDLE, s(3))}`);

  if (board.expiringSoon) lines.push(`${N(board.expiringSoon, "quest")} closing soon. Tick tock.`);
  else if (board.streak >= 2) lines.push(pick([`Day ${board.streak} streak. I'm invested now.`, `${board.streak} days running! Don't stop, I've made a chart.`, `Streak: ${board.streak}. Keep it warm.`], s(5)));

  if (chattiness === "chatty") lines.push(board.rankUp ? `Rank ${board.rankUp}! I'm making a banner.` : pick(QUIPS, s(7)));
  return chattiness === "quiet" ? lines.slice(0, 1) : lines.slice(0, chattiness === "chatty" ? 3 : 2);
}

/** The ⓘ beside a quest's proof: how it's checked and what's kept. Joy doesn't say this out loud. */
export function proofTip(q) {
  const p = q.proof || { type: "honor" };
  switch (p.type) {
    case "gps": return "Check in when you're there. Only the distance from the spot is saved, never where you stood.";
    case "reps": return "Prop the phone up and the camera counts. Frames never leave the device.";
    case "jog": return "Tracked by GPS while the app is open. Only the totals are kept, never the route. Or type your steps in: that pays as your word.";
    case "photo": return "The photo goes to your private repo only.";
    case "journal": return "Pick the journal day. Only the date is saved; the entry isn't read.";
    default: return "Your word is enough. Proof pays more where a quest asks for it.";
  }
}

const STAMPED = [(xp) => `Stamped! +${xp} XP.`, (xp) => `+${xp} XP. Lovely.`, (xp) => `Filed and framed. +${xp} XP.`, (xp) => `Ka-chunk. +${xp} XP.`];
export const stamped = (q, xp, seed) => pick(STAMPED, seed)(xp);

const FILED = ["Filed! The guild master's on it.", "Wish received. Stand by.", "On the big desk now. Ooh, exciting."];
export const filedRequest = (seed) => pick(FILED, seed);

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
  return pick(["This one came in with your name on it. In pencil.", "I think this one's meant for you.", "Someone had you in mind for this."]);
}

// Lines Joy says (and shows) at each moment, by chattiness. Short, so they finish before the toast does.
const ACCEPT = {
  quiet: ["Accepted.", "Go get it.", "Yours now."],
  normal: ["Ooh, good pick.", "Yours now. No refunds.", "Go get 'em.", "Signed, sealed, yours.", "I'll keep the kettle on.", "Off you go, hero."],
  chatty: ["Bold. I love it.", "Try not to make it look easy.", "I've cleared a spot on the trophy shelf.", "The board will miss it. I won't.", "Go on. Make me proud. Prouder."],
};
const TURN_IN = {
  quiet: ["Well done.", "Nice work.", "Done."],
  normal: ["Nailed it.", "Stamped! Look at you.", "That's going on the fridge.", "Done! I did a little spin.", "Ooh, tidy work."],
  chatty: ["Show-off. Lovely.", "Done already? Save some for the rest of us.", "I'd act surprised, but I knew.", "Someone's levelling up, and it isn't me."],
};
const LEVEL = {
  quiet: [(n) => `Level ${n}.`, () => "Level up."],
  normal: [(n) => `Level ${n}! Ding!`, () => "Level up! I'm telling everyone.", (n) => `Ooh, Level ${n}. Fancy.`, () => "New level. Same great taste in quests."],
  chatty: [(n) => `Level ${n}! I've ordered a cake. It's imaginary.`, () => "Level up! Should I curtsy? I'm curtsying.", (n) => `Level ${n}. The other adventurers are nervous.`],
};
const ABANDON = ["Back on the board. No harm done.", "Fair enough. It'll keep.", "Shelved. Quests are patient.", "No worries. It's not going anywhere."];
const FAILED = ["Logged. Trying counts.", "Noted. The next one's yours.", "Filed under 'learned something'.", "Hey, that's how legends start."];

const tone = (c) => (c in ACCEPT ? c : "normal");
export const cheerAccept = ({ chattiness, seed } = {}) => pick(ACCEPT[tone(chattiness)], seed);
export const cheerTurnIn = (q, xp, { chattiness, seed } = {}) => pick(TURN_IN[tone(chattiness)], seed);
export const cheerLevel = (level, { chattiness, seed } = {}) => pick(LEVEL[tone(chattiness)], seed)(level);
export const sayAbandon = (seed) => pick(ABANDON, seed);
export const sayFailed = (seed) => pick(FAILED, seed);

/** What Joy says when you open a quest at the counter. */
export function questPitch(q, xp, label, seed) {
  if (q.status === "accepted") return pick(["Back for more?", "How's it going?", "Ready to hand it in?", "Still on this one? Good.", "Oh, this one. Nice."], seed);
  if (q.status === "done") return pick(["Done and dusted.", "Filed. Framed, nearly.", "One of your finest."], seed);
  if (q.status === "failed") return pick(["Not this time. Want another go?", "It happens. Shall I put it back up?"], seed);
  if (q.status !== "posted") return "Off the board. Want it back up?";
  const hard = q.difficulty === "hard" || q.difficulty === "epic";
  return pick(hard
    ? [`A ${label.toLowerCase()} one. You like those.`, "Spicy. Interested?", `${xp} XP, if you're brave.`]
    : ["Fresh off the board. Want it?", `${xp} XP. Interested?`, "This one's got your name on it. In pencil.", "Ooh, I like this one."], seed);
}
