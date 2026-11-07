// Sergeant Brass, the Train tab's coach: an old salvaged drill automaton, gruff
// but kind. Like Relay, every line is a template with a few variants, so no AI
// runs per rep (or ever). The camera counts; he only talks about the count.

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const NOUN = { pushup: "push-ups", squat: "squats", situp: "sit-ups", dip: "dips", pullup: "pull-ups" };
export const noun = (ex) => NOUN[ex] || `${ex}s`;

/** When you first come into view and the set begins. */
export function setStart(ex, target, { max = false, seed = 0 } = {}) {
  return max
    ? pick([`Max set. Everything you've got, then one more. Begin.`, `Right. Max ${noun(ex)}. Show me what's in the tank.`, `No target this time. Honest reps only. Go.`], seed)
    : pick([`${target} ${noun(ex)}. On my count. Begin.`, `Right then, ${target} ${noun(ex)}. Nice and controlled. Go.`, `${target} ${noun(ex)}, soldier. Smooth and steady. Begin.`], seed);
}

/** The tempo cue on the way down: the first couple of reps, then now and then, so the count isn't crowded. */
export function tempo(done, seed = 0, ex = "") {
  if (done > 1 && seed % 4) return null;
  if (ex === "pullup") return pick(["Full hang…", "Arms straight…", "All the way down…"], seed);
  return pick(["Down…", "Lower…", "Slow on the way down…", "Control it…"], seed);
}

/** The count, with a word at the moments that matter. best: your top counted set before this one. */
export function repLine(n, { target, max = false, best = null, seed = 0 } = {}) {
  if (max) {
    if (best != null && n === best + 1) return `${n}! New record! Keep going!`;
    if (best != null && n === best) return `${n}. That ties your best.`;
  } else {
    if (n === target) return `${n}! That's the target. Anything more is a bonus.`;
    if (target - n === 1) return `${n}. Last one!`;
    if (target - n === 2 && target >= 5) return `${n}. Two more.`;
    if (target >= 6 && n === Math.ceil(target / 2)) return `${n}. Halfway. Steady.`;
  }
  if (n % 5 === 0) return `${n}. ${pick(["Good.", "Keep that form.", "Breathe.", "Solid."], seed)}`;
  return `${n}.`;
}

/** A form cue from the rep counter's hint (why nothing is counting). */
export const formCue = (hint, seed = 0) => `${pick(["Form check. ", "Hold up. ", "Fix that. "], seed)}${hint}`;

/** After Done: the verdict on the set. */
export function setEnd(reps, { target, max = false, best = null, seed = 0 } = {}) {
  if (!reps) return "Nothing counted. We go again when you're ready.";
  if (best != null && reps > best) return pick([`${reps}. New personal record! Outstanding work.`, `That's a PR. ${reps}! I'm putting that on the wall.`, `${reps}! Best you've ever done. Proud of you, soldier.`], seed);
  if (max) return best == null ? `${reps}. That's your baseline. We build from here.` : pick([`${reps}. Solid effort. Logged.`, `${reps}. Not a record, but honest work.`], seed);
  if (reps >= target) return pick([`${reps}. Target met. Well done, soldier.`, `Good set. ${reps} clean reps.`, `${reps}. That's how it's done.`], seed);
  return pick([`${reps} of ${target}. Not today, but it counts. We go again.`, `${reps}. Short, but you showed up. That matters.`], seed);
}

/** Jogging: the start, a call every 1000 steps, and when GPS won't come. */
export const jogStart = (target, seed = 0) => pick([`${target.toLocaleString()} steps. Easy pace, you should be able to talk. Off you go.`, "Right. Nice and steady, soldier. I'll call the thousands.", "Jog on. Light feet, loose shoulders."], seed);
export function jogMark(steps, target, seed = 0) {
  const k = Math.floor(steps / 1000) * 1000;
  if (steps >= target) return pick([`${k.toLocaleString()} steps. That's the target! Walk it off, then tap Done.`, "Target reached. Outstanding. Tap Done when you've caught your breath."], seed);
  if (Math.abs(k - target / 2) < 500) return `${k.toLocaleString()} steps. Halfway. Hold that pace.`;
  return `${k.toLocaleString()} steps. ${pick(["Good rhythm.", "Keep breathing.", "Steady.", "Lovely work."], seed)}`;
}
export const jogNoFix = () => "No GPS signal yet. Step outside, or enter your steps by hand.";

/** Spoken rest countdown: a line at the marks, null in between. */
export function restLine(left) {
  return { 60: "One minute.", 30: "Thirty seconds.", 10: "Ten seconds. Get in position.", 3: "Three.", 2: "Two.", 1: "One.", 0: "Up. Next set." }[left] ?? null;
}
export const restStart = (seed = 0) => pick(["Rest. Breathe. Shake it out.", "Stand down. Water if you've got it.", "Good. Rest now. I'll call time."], seed);
