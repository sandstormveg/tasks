// One day: its optional ratings and moments, what you wrote, and imported
// calendar context (shown as context, not as your recollection).

import { html, raw, on } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { entryCard, eventCard } from "../ui/components.js";
import { dayPanelHtml, wireDayPanel } from "../ui/day-panel.js";
import { formatDayLong, addDays, compareDays, daysBetween } from "../core/dates.js";

export async function mount(el, ctx, route, ui) {
  const date = route.params[0];
  const today = ctx.today();
  ui.setTitle(formatDayLong(date), { back: "#/timeline" });
  ui.setActions(html`<a class="btn icon ghost" href="#/day/${addDays(date, -1)}" aria-label="Previous day">${raw(icon("back"))}</a>${compareDays(date, today) < 0 ? html`<a class="btn icon ghost" href="#/day/${addDays(date, 1)}" aria-label="Next day">${raw(icon("chevron"))}</a>` : ""}`);

  function render() {
    const chapter = ctx.chapters().find((c) => c.from && c.to && compareDays(date, c.from) >= 0 && compareDays(date, c.to) <= 0);
    const entries = ctx.store.entriesForDay(date);
    const events = ctx.store.all("event").filter((e) => e.day === date);
    const items = [...entries.map((e) => ({ t: e.created, h: entryCard(e) })), ...events.map((e) => ({ t: e.start, h: eventCard(e) }))].sort((a, b) => String(a.t).localeCompare(String(b.t)));
    el.innerHTML = String(html`
      <h2 class="view-title">${formatDayLong(date)}</h2>
      <p class="view-sub">${date === today ? "Today" : `${daysBetween(date, today)} day${daysBetween(date, today) === 1 ? "" : "s"} ago`}</p>
      ${chapter ? html`<div class="chapter-band">${raw(icon("map"))}${chapter.name} · day ${daysBetween(chapter.from, date) + 1}</div>` : ""}
      <div class="day-panel" data-panel>${dayPanelHtml(ctx, date)}</div>
      <div class="section-title">Moments</div>
      ${items.length ? items.map((i) => i.h) : html`<p class="muted">Nothing written for this day${compareDays(date, today) <= 0 ? " — and that's fine." : "."}</p>`}
      ${compareDays(date, today) <= 0 ? html`<div class="btn-row" style="margin-top:16px"><a class="btn" href="#/today?day=${date}">${raw(icon("edit"))}Write about this day</a></div>` : ""}
    `);
    ctx.media.hydrate(el);
  }
  render();
  wireDayPanel(el, ctx, date);
  ui.onStore(() => render());
}
