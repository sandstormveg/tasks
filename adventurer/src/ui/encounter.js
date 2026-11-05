// Explore-quest encounters: a chest to open or a scholar to meet, waiting at a
// check-in quest's place. What's inside is written by the guild master when it
// posts the quest (no AI runs here), and points into Silica's other worlds: a
// lead to chart in the Infodex (and mint as a Dex card), a challenge for Babel,
// or one of their tasks. Opening happens only after a real check-in.

import { sheet, html, raw } from "./dom.js";

const ATLAS = "https://epistemic-atlas.vercel.app/";
const CHEST = `<svg class="chest-svg" viewBox="0 0 96 80"><g class="chest-glow"><ellipse cx="48" cy="40" rx="30" ry="14" fill="#facc15" opacity=".55"/></g><rect x="14" y="38" width="68" height="36" rx="3" fill="#7c4a1e" stroke="#2a1606" stroke-width="2.5"/><rect x="14" y="48" width="68" height="5" fill="#c79a3b"/><rect x="26" y="38" width="5" height="36" fill="#c79a3b"/><rect x="65" y="38" width="5" height="36" fill="#c79a3b"/><g class="chest-lid"><path d="M14 38v-10c0-10 15-16 34-16s34 6 34 16v10z" fill="#8b5524" stroke="#2a1606" stroke-width="2.5"/><rect x="26" y="15" width="5" height="23" fill="#c79a3b"/><rect x="65" y="15" width="5" height="23" fill="#c79a3b"/></g><rect x="42" y="34" width="12" height="13" rx="2" fill="#facc15" stroke="#2a1606" stroke-width="2"/><circle cx="48" cy="40" r="2" fill="#2a1606"/></svg>`;

const lootRow = (l, taskTitle) => {
  if (l.kind === "dex") return html`<li class="loot dex"><span class="loot-icon">◈</span><div><b>${l.label}</b> <span class="muted small">Infodex lead</span>${l.why ? html`<p>${l.why}</p>` : ""}<a class="btn small" href="${ATLAS}#/q/${l.qid}" target="_blank" rel="noopener">Chart it in the Infodex</a></div></li>`;
  if (l.kind === "babel") return html`<li class="loot babel"><span class="loot-icon">♜</span><div><b>${l.label || "A Babel challenge"}</b>${l.why ? html`<p>${l.why}</p>` : ""}<a class="btn small" href="${ATLAS}#/babel" target="_blank" rel="noopener">Climb the Tower</a></div></li>`;
  if (l.kind === "task") return html`<li class="loot task"><span class="loot-icon">⛓</span><div><b>${[taskTitle(l.taskId)].find((t) => t && t !== l.taskId) || l.label || l.taskId}</b> <span class="muted small">from your tasks</span>${l.why ? html`<p>${l.why}</p>` : ""}</div></li>`;
  return html`<li class="loot note"><span class="loot-icon">✎</span><div><b>${l.label || "A note"}</b>${l.why ? html`<p>${l.why}</p>` : ""}</div></li>`;
};

/** Shows the encounter. taskTitle(id) names linked tasks. Resolves when closed. */
export function openEncounter(q, { taskTitle = () => "" } = {}) {
  const e = q.encounter;
  const chest = e.type === "chest";
  return sheet({
    title: e.name || (chest ? "A chest" : "A scholar"),
    body: html`<div class="encounter ${chest ? "is-chest" : "is-scholar"}">
        <div class="enc-art" aria-hidden="true">${chest ? raw(CHEST) : "📜"}</div>
        ${e.text ? html`<p class="enc-text">${e.text}</p>` : ""}
        ${chest ? html`<button class="btn primary" data-open>Open the chest</button>` : ""}
        <ul class="loot-list" ${chest ? "hidden" : ""}>${(e.loot || []).map((l) => lootRow(l, taskTitle))}</ul>
      </div>`,
    foot: html`<button class="btn" data-close>Done</button>`,
    setup: (d) => d.querySelector("[data-open]")?.addEventListener("click", (ev) => {
      ev.currentTarget.remove();
      d.querySelector(".encounter").classList.add("opened");
      d.querySelector(".loot-list").hidden = false;
      navigator.vibrate?.([20, 40, 20]);
    }),
  });
}
