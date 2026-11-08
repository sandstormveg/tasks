// Joy's voice: the browser's own speech (speechSynthesis), so nothing is sent
// anywhere and no AI runs. Off unless Settings › Receptionist voice is on; the
// voice, volume, speed and pitch are set there too. Sergeant Brass, the Train tab's
// coach, speaks through here as well, with a male voice (kind: "male"). While she talks, every
// portrait on screen gets .talking (mouth flaps, in CSS); word boundaries, where
// the browser reports them, give the mouth an extra snap. Tapping a portrait stops her.

// Device voices that sound most like a friendly receptionist, best first. The
// "Online (Natural)" and Google ones are far less robotic than the system defaults.
const PREFERRED = [/aria.*natural/i, /jenny.*natural/i, /natasha.*natural/i, /sonia.*natural/i, /libby.*natural/i, /michelle.*natural/i,
  /natural/i, /google uk english female/i, /samantha/i, /serena/i, /karen/i, /moira/i, /tessa/i, /google us english/i, /zira/i, /hazel/i, /susan/i, /female/i];

// The coach's: male voices, best first (Microsoft's British "Natural" ones lead, then Apple's and Google's).
// "\bmale" never matches "Female".
const MALE = [/ryan.*natural/i, /thomas.*natural/i, /oliver.*natural/i, /alfie.*natural/i, /elliot.*natural/i, /ethan.*natural/i, /noah.*natural/i,
  /guy.*natural/i, /andrew.*natural/i, /brian.*natural/i, /christopher.*natural/i, /eric.*natural/i, /davis.*natural/i,
  /google uk english male/i, /\bdaniel\b/i, /\barthur\b/i, /\bgeorge\b/i, /\boliver\b/i, /\bdavid\b/i, /\bmark\b/i, /\bfred\b/i, /\balex\b/i, /\bmale\b/i];

export const voices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : []);

/** The voice to use: the one picked in Settings if this device has it, else the best match above. */
function pickVoice(name, kind) {
  const all = voices();
  if (name) { const v = all.find((x) => x.name === name); if (v) return v; }
  if (kind === "male") {
    // British first, then any English; with no male voice at all, the en-GB one at a lower pitch (see coachVoice).
    for (const pool of [all.filter((x) => /^en[-_]GB/i.test(x.lang)), all]) for (const re of MALE) { const v = pool.find((x) => re.test(x.name)); if (v) return v; }
    return all.find((x) => /^en[-_]GB/i.test(x.lang)) || all[0] || null;
  }
  for (const re of PREFERRED.slice(0, 8)) { const v = all.find((x) => re.test(x.name)); if (v) return v; }
  // Android names its voices by language only ("English United Kingdom"); there the en-GB one is female.
  const gb = all.find((x) => /^en[-_]GB/i.test(x.lang));
  if (gb) return gb;
  for (const re of PREFERRED.slice(8)) { const v = all.find((x) => re.test(x.name)); if (v) return v; }
  return all[0] || null;
}
export const bestVoice = (kind) => pickVoice("", kind)?.name || "";

// Only the speaker's portrait moves: the coach's carry data-who="coach", Joy's carry nothing.
let who = "";
const portraits = (w = who) => document.querySelectorAll(w ? `.portrait[data-who="${w}"]` : ".portrait:not([data-who])");
const setTalking = (on) => { (on ? portraits() : document.querySelectorAll(".portrait")).forEach((p) => p.classList.toggle("talking", on)); };

/** Say a line. s: voiceName, voiceVolume, voiceRate, voicePitch, and for the coach kind: "male", who: "coach". */
export function speak(text, s = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  setTalking(false);
  who = s.who || "";
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(s.voiceName, s.kind);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.volume = num(s.voiceVolume, 1, 0, 1); u.rate = num(s.voiceRate, 1, 0.5, 2); u.pitch = num(s.voicePitch, 1.1, 0, 2);
  u.onstart = () => setTalking(true);
  u.onend = u.onerror = () => setTalking(false);
  u.onboundary = () => portraits().forEach((p) => { p.classList.remove("snap"); void p.offsetWidth; p.classList.add("snap"); });
  speechSynthesis.speak(u);
}
const num = (x, d, lo, hi) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function hush() { if ("speechSynthesis" in window) speechSynthesis.cancel(); setTalking(false); }

if ("speechSynthesis" in window) {
  speechSynthesis.getVoices(); // Chrome loads the list late; this starts it
  document.addEventListener("click", (e) => { if (e.target.closest(".portrait.talking")) { e.preventDefault(); hush(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hush(); });
}
