// Relay's voice: the browser's own speech (speechSynthesis), so nothing is sent
// anywhere and no AI runs. Off unless Settings › Receptionist voice is on. While
// she talks, every portrait on screen gets .talking (mouth flaps, in CSS); word
// boundaries, where the browser reports them, give the mouth an extra snap.
// Tapping a portrait stops her.

let voice;
function pickVoice() {
  const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  // A clear, local English voice if the device has one; otherwise the browser's default.
  return all.find((v) => v.localService && /natural|neural|enhanced|premium/i.test(v.name)) || all.find((v) => v.localService) || all[0] || null;
}

const portraits = () => document.querySelectorAll(".portrait");
const setTalking = (on) => portraits().forEach((p) => p.classList.toggle("talking", on));

export function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  voice ||= pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 1.05; u.pitch = 1.15;
  u.onstart = () => setTalking(true);
  u.onend = u.onerror = () => setTalking(false);
  u.onboundary = () => portraits().forEach((p) => { p.classList.remove("snap"); void p.offsetWidth; p.classList.add("snap"); });
  speechSynthesis.speak(u);
}

export function hush() { if ("speechSynthesis" in window) speechSynthesis.cancel(); setTalking(false); }

if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); }; // voices load late on Chrome
  document.addEventListener("click", (e) => { if (e.target.closest(".portrait.talking")) { e.preventDefault(); hush(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hush(); });
}
