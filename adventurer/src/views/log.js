// 🗓️ The Log: turned-in quests by day, newest first, with what each paid.

import { html } from "../ui/dom.js";
import { PROOF_LABEL } from "../core/quests.js";

export async function mount(el, ctx, route, ui) {
  const draw = () => {
    const done = ctx.quests().filter((q) => q.status === "done").sort((a, b) => (b.completed || "").localeCompare(a.completed || ""));
    const days = new Map();
    for (const q of done) {
      const d = (q.completed || "").slice(0, 10);
      if (!days.has(d)) days.set(d, []);
      days.get(d).push(q);
    }
    el.innerHTML = String(html`<h2 class="view-title">🗓️ Log</h2>
      ${done.length ? [...days].map(([day, qs]) => html`<section class="day">
        <h3>${new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          <span class="muted small">+${qs.reduce((s, q) => s + (q.xp || 0), 0)} XP</span></h3>
        ${qs.map((q) => html`<div class="log-row"><span class="stamp-mark">✓</span><span class="grow">${q.title}</span><span class="muted small">${PROOF_LABEL[q.evidence?.type] || ""}</span><span class="reward">+${q.xp || 0}</span></div>`)}
      </section>`) : html`<div class="empty"><p>No quests turned in yet. Your first stamp goes here.</p></div>`}`);
  };
  draw();
  ui.onStore((c) => { if (["quest", "sync"].includes(c.op)) draw(); });
}
