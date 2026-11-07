// Sergeant Brass on screen: a brass drill automaton portrait (animated like
// Relay's, and still under reduced motion), his line, and his voice when
// Settings › Training coach has it on. Lines come from core/coach.js.

import { html, raw } from "./dom.js";
import { speak, hush } from "./voice.js";
import * as L from "../core/coach.js";

const PORTRAIT = `<svg viewBox="0 0 64 64" aria-hidden="true" class="portrait-svg">
  <rect x="0" y="0" width="64" height="64" fill="currentColor" opacity=".06"/>
  <path d="M8 62c2-9 10-14 24-14s22 5 24 14" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M26 42v6M38 42v6" stroke="currentColor" stroke-width="2"/>
  <path d="M17 21q0-8 15-9q15 1 15 9v13q0 7-7 8H24q-7-1-7-8z" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M41 14l2 3-3 1" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/>
  <path d="M12 20h40l-3-7c-6-4-28-4-34 0z" fill="currentColor" opacity=".55"/><circle cx="32" cy="15" r="1.8" fill="currentColor"/>
  <g fill="currentColor" opacity=".8"><circle cx="20" cy="25" r="1"/><circle cx="44" cy="25" r="1"/><circle cx="20" cy="38" r="1"/><circle cx="44" cy="38" r="1"/></g>
  <path d="M22 23l6 1.5M42 23l-6 1.5" stroke="currentColor" stroke-width="1.6"/>
  <g class="eyes"><circle cx="25.5" cy="27.5" r="2.4" fill="currentColor"/><circle cx="38.5" cy="27.5" r="2.4" fill="currentColor"/></g>
  <path d="M23 33q4-2.5 9 0q5-2.5 9 0q-2 2.5-9 1.5q-7 1-9-1.5z" fill="currentColor" opacity=".85"/>
  <path class="mouth-shut" d="M28 38h8" stroke="currentColor" stroke-width="1.5"/><rect class="mouth-open" x="28" y="36" width="8" height="4" rx="1" fill="currentColor"/>
  <path d="M44 53l2 4 2-4M46 57v2" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".8"/>
</svg>`;

export const coachName = (s) => s.coachName || "Sergeant Brass";
export const coachVoice = (s) => ({ voiceName: s.coachVoiceName || "", voiceVolume: s.coachVolume ?? 1, voiceRate: s.coachRate ?? 1, voicePitch: s.coachPitch ?? 0.85, kind: "male", who: "coach" });

export function coachBubble(name, line) {
  return html`<div class="relay relay-bubble coach-bubble"><span class="portrait" data-who="coach">${raw(PORTRAIT)}</span><div><span class="relay-name">${name}</span><p class="relay-say coach-say" aria-live="polite">${line}</p></div></div>`;
}

/** Shows a line in his bubble (inside d, the open sheet) and says it if his voice is on. */
export function coachSay(s, d, line) {
  const p = (d || document).querySelector(".coach-say");
  if (p) p.textContent = line;
  if (s.coachVoice) speak(line, coachVoice(s));
}

/** The coach for one set, wired to the camera counter's events. best: top counted set before this one. */
export function coachSet(s, exercise, target, { max = false, best = null } = {}) {
  let seed = Date.now() & 0xffff, lastHint = "", hintAt = -Infinity;
  return {
    bubble: coachBubble(coachName(s), max ? "Max set. Get in position." : `${target} ${L.noun(exercise)}. Get in position.`),
    on(ev, data, d) {
      seed++;
      if (ev === "start") coachSay(s, d, L.setStart(exercise, target, { max, seed }));
      else if (ev === "down") { const t = L.tempo(data, seed); if (t) coachSay(s, d, t); }
      else if (ev === "rep") coachSay(s, d, L.repLine(data, { target, max, best, seed }));
      else if (ev === "hint") {
        const now = performance.now();
        if (data !== lastHint && now - hintAt > 6000) { lastHint = data; hintAt = now; coachSay(s, d, L.formCue(data, seed)); }
      }
    },
    end(reps) { const line = L.setEnd(reps, { target, max, best, seed }); if (s.coachVoice) speak(line, coachVoice(s)); return line; },
    stop: hush,
  };
}
