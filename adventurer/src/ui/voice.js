// Relay's voice: the browser's own speech (speechSynthesis), so nothing is sent
// anywhere and no AI runs. Off unless Settings › Receptionist voice is on; the
// voice, volume, speed and pitch are set there too. While she talks, every
// portrait on screen gets .talking (mouth flaps, in CSS); word boundaries, where
// the browser reports them, give the mouth an extra snap. Tapping a portrait stops her.

// Device voices that sound most like a friendly receptionist, best first. The
// "Online (Natural)" and Google ones are far less robotic than the system defaults.
const PREFERRED = [/aria.*natural/i, /jenny.*natural/i, /natasha.*natural/i, /sonia.*natural/i, /libby.*natural/i, /michelle.*natural/i,
  /natural/i, /google uk english female/i, /samantha/i, /serena/i, /karen/i, /moira/i, /tessa/i, /google us english/i, /zira/i, /hazel/i, /susan/i, /female/i];

export const voices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : []);

/** The voice to use: the one picked in Settings if this device has it, else the best match above. */
function pickVoice(name) {
  const all = voices();
  if (name) { const v = all.find((x) => x.name === name); if (v) return v; }
  for (const re of PREFERRED) { const v = all.find((x) => re.test(x.name)); if (v) return v; }
  return all[0] || null;
}
export const bestVoice = () => pickVoice("")?.name || "";

const portraits = () => document.querySelectorAll(".portrait");
const setTalking = (on) => portraits().forEach((p) => p.classList.toggle("talking", on));

/** Say a line in Relay's voice. s: the settings (voiceName, voiceVolume, voiceRate, voicePitch). */
export function speak(text, s = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(s.voiceName);
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
