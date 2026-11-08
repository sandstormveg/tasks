// Joy's counter: a small CRT portrait and a speech box. The portrait is an
// original synthetic clerk drawn in SVG (scanlines and flicker in CSS, which
// stop under reduced motion). She blinks and bobs; her mouth moves while the voice talks. On phones it folds to one line; tap to open.

import { html, raw } from "./dom.js";

const PORTRAIT = `<svg viewBox="0 0 64 64" aria-hidden="true" class="portrait-svg">
  <rect x="0" y="0" width="64" height="64" fill="currentColor" opacity=".06"/>
  <path d="M14 58c2-12 9-17 18-17s16 5 18 17" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M18 26c0-10 6-16 14-16s14 6 14 16v4c0 8-6 13-14 13s-14-5-14-13z" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M16 24c2-9 8-15 16-15 9 0 15 6 17 16l-4-3-6 2-7-6-8 6-6-2z" fill="currentColor" opacity=".55"/>
  <g class="eyes"><rect x="22" y="27" width="7" height="2" fill="currentColor"/><rect x="35" y="27" width="7" height="2" fill="currentColor"/></g>
  <path class="mouth-shut" d="M28 36h8" stroke="currentColor" stroke-width="1.5"/><ellipse class="mouth-open" cx="32" cy="36.5" rx="3.5" ry="2.2" fill="currentColor"/>
  <path d="M46 30h6v4h-4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="53" cy="36" r="1.5" fill="currentColor"/>
  <path d="M24 47l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"/>
</svg>`;

/** Joy at the top of a quest's pop-up: portrait and one line, always open, so you can watch her talk. */
export function relayBubble(name, line) {
  return html`<div class="relay relay-bubble"><span class="portrait">${raw(PORTRAIT)}</span><div><span class="relay-name">Receptionist: ${name}</span><p class="relay-say">${line}</p></div></div>`;
}

export function relayCounter(name, lines) {
  return html`<details class="relay" open>
    <summary><span class="portrait">${raw(PORTRAIT)}</span><span class="relay-name">Receptionist: ${name}</span><span class="relay-first">${lines[0] || ""}</span></summary>
    <div class="relay-box" aria-live="polite">${lines.map((l, i) => html`<p class="type" style="--i:${i}">&gt; ${l}</p>`)}</div>
  </details>`;
}
