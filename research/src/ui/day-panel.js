// The optional day fields: rating, best moment, hardest moment, feelings.
// Each is a suggestion, never a requirement; an empty field stays empty
// (and a missing rating is never treated as a low one).

import { html, raw, sheet, on } from "./dom.js";
import { icon } from "./icons.js";
import { EMOTION_SUGGESTIONS } from "../core/model.js";
import { setDayFields } from "../app/actions.js";

export function dayPanelHtml(ctx, date, { evening = false, simple = false } = {}) {
  const d = ctx.store.get(date) || {};
  const scale = d.rating_scale || ctx.prefs().rating_scale || 10;
  const filled = d.rating != null || d.best || d.hardest || (d.emotions || []).length;
  if (simple && !filled) {
    return html`<button class="btn small" data-day-act="expand">${raw(icon("plus"))}Rate the day or note a moment</button>`;
  }
  const row = (key, label, value, placeholder) => html`<button class="day-field" type="button" data-day-act="${key}">
      <span class="k">${label}</span>
      <span class="v ${value ? "" : "placeholder"}">${value || placeholder}</span></button>`;
  return html`<div class="day-fields">
    ${evening && !filled ? html`<div class="small muted" style="margin-bottom:2px">Before the day ends — all optional.</div>` : ""}
    ${row("rating", "Day", d.rating != null ? `${d.rating} / ${scale}` : "", "Rate it (optional)")}
    ${row("best", "Best moment", d.best, "What stood out?")}
    ${row("hardest", "Hardest moment", d.hardest, "Anything difficult?")}
    ${row("emotions", "Feelings", (d.emotions || []).join(", "), "Name a feeling or two")}
  </div>`;
}

export async function editRating(ctx, date) {
  const d = ctx.store.get(date) || {};
  const scale = d.rating_scale || ctx.prefs().rating_scale || 10;
  const nums = Array.from({ length: scale }, (_, i) => i + 1);
  const v = await sheet({
    title: "How was the day, overall?",
    body: html`<p class="muted small" style="margin-top:0">One number for the whole day — separate from its best and hardest moments. A great moment and an exhausting day can both be true.</p>
      <div class="rating-pick ${scale === 5 ? "five" : ""}">${nums.map((n) => html`<button type="button" data-v="${n}" class="${d.rating === n ? "on" : ""}">${n}</button>`)}</div>
      <p class="hint">1 = very hard · ${scale} = wonderful. Change the scale in Settings.</p>`,
    foot: html`${d.rating != null ? html`<button class="btn ghost" data-clear>Clear rating</button>` : ""}<button class="btn" data-close>Cancel</button>`,
    setup: (dlg, close) => {
      on(dlg, "click", "[data-v]", (e, el) => close(Number(el.dataset.v)));
      dlg.querySelector("[data-clear]")?.addEventListener("click", () => close(null));
    },
  });
  if (v === undefined) return;
  await setDayFields(ctx, date, { rating: v, rating_scale: v == null ? null : scale });
}

export async function editMoment(ctx, date, field) {
  const d = ctx.store.get(date) || {};
  const label = field === "best" ? "Best moment" : "Hardest moment";
  const v = await sheet({
    title: label,
    body: html`<textarea class="textarea" data-in autofocus placeholder="${field === "best" ? "A sentence is plenty." : "Only if you want to. A sentence is plenty."}">${d[field] || ""}</textarea>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    setup: (dlg, close) => dlg.querySelector("[data-ok]").addEventListener("click", () => close(dlg.querySelector("[data-in]").value)),
  });
  if (v === undefined) return;
  await setDayFields(ctx, date, { [field]: v.trim() || null });
}

export async function editFeelings(ctx, date) {
  const d = ctx.store.get(date) || {};
  const chosen = new Set(d.emotions || []);
  const all = [...new Set([...EMOTION_SUGGESTIONS, ...chosen])];
  const v = await sheet({
    title: "Feelings",
    body: html`<p class="muted small" style="margin-top:0">Pick any that fit, or add your own. Mixed feelings are normal.</p>
      <div class="chips" data-chips>${all.map((e) => html`<button type="button" class="chip ${chosen.has(e) ? "on" : ""}" data-e="${e}">${e}</button>`)}</div>
      <div class="row" style="margin-top:12px"><input class="input" data-custom placeholder="Another feeling…" autocomplete="off"><button class="btn" data-add>Add</button></div>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    setup: (dlg, close) => {
      on(dlg, "click", "[data-e]", (e, el) => {
        const k = el.dataset.e;
        if (chosen.has(k)) chosen.delete(k); else chosen.add(k);
        el.classList.toggle("on");
      });
      const add = () => {
        const inp = dlg.querySelector("[data-custom]");
        const k = inp.value.trim().toLowerCase();
        if (!k) return;
        chosen.add(k);
        inp.value = "";
        dlg.querySelector("[data-chips]").insertAdjacentHTML("beforeend", `<button type="button" class="chip on" data-e="${k.replace(/"/g, "&quot;").replace(/</g, "&lt;")}">${k.replace(/</g, "&lt;")}</button>`);
      };
      dlg.querySelector("[data-add]").addEventListener("click", add);
      dlg.querySelector("[data-custom]").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      dlg.querySelector("[data-ok]").addEventListener("click", () => close([...chosen]));
    },
  });
  if (v === undefined) return;
  await setDayFields(ctx, date, { emotions: v });
}

/** Wire clicks on a container rendered with dayPanelHtml. */
export function wireDayPanel(root, ctx, date, { onExpand } = {}) {
  return on(root, "click", "[data-day-act]", async (e, el) => {
    const act = el.dataset.dayAct;
    if (act === "expand") return onExpand?.();
    if (act === "rating") return editRating(ctx, date);
    if (act === "best" || act === "hardest") return editMoment(ctx, date, act);
    if (act === "emotions") return editFeelings(ctx, date);
  });
}
