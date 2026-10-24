// Timeline: browse days, months, chapters (trips, life periods) — as a list,
// or as a calendar where days with photos show one.

import { html, raw, on, sheet, toast, confirmSheet } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { ratingDot } from "../ui/components.js";
import { plainExcerpt } from "../core/markdown.js";
import { formatDay, formatMonth, monthKey, compareDays, dayRange, weekdayIndex, addDays } from "../core/dates.js";
import { newId } from "../core/ids.js";

const PAGE_MONTHS = 6;

function buildDays(ctx, chapter) {
  const map = new Map();
  const get = (d) => { if (!map.has(d)) map.set(d, { date: d, entries: [], events: [], day: null }); return map.get(d); };
  for (const e of ctx.store.all("entry")) get(e.day).entries.push(e);
  for (const ev of ctx.store.all("event")) get(ev.day).events.push(ev);
  for (const d of ctx.store.all("day")) {
    if (d.rating != null || d.best || d.hardest || (d.emotions || []).length || d.body) get(d.date).day = d;
  }
  let days = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (chapter) days = days.filter((d) => compareDays(d.date, chapter.from) >= 0 && compareDays(d.date, chapter.to) <= 0);
  for (const d of days) d.entries.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  return days;
}

function firstLine(d) {
  if (d.day?.best) return d.day.best;
  for (const e of d.entries) {
    if (e.sealed && e.body == null) continue;
    const t = e.title || plainExcerpt(e.body || "", 200);
    if (t) return t;
  }
  if (d.entries.some((e) => e.sealed && e.body == null)) return "Sealed entry";
  if (d.events.length) return d.events.map((e) => e.title).join(" · ");
  return d.entries.length ? "Photos" : "";
}

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Timeline");
  let mode = route.query.mode === "calendar" ? "calendar" : "list";
  let chapterId = route.query.chapter || "";
  let months = PAGE_MONTHS;
  let calMonth = route.query.month || monthKey(ctx.today());
  ui.setActions(html`<button class="btn small" data-act="chapters">${raw(icon("map"))}<span class="only-desktop">Chapters</span></button>`);

  function render() {
    const chapters = ctx.chapters();
    const chapter = chapters.find((c) => c.id === chapterId) || null;
    const days = buildDays(ctx, chapter);
    const head = html`
      <div class="row between" style="margin:6px 0 12px">
        <div class="chips">
          <button class="chip ${mode === "list" ? "on" : ""}" data-act="mode" data-mode="list">${raw(icon("timeline"))}List</button>
          <button class="chip ${mode === "calendar" ? "on" : ""}" data-act="mode" data-mode="calendar">${raw(icon("calendar"))}Calendar</button>
        </div>
      </div>
      ${chapters.length ? html`<div class="chips scroll" style="margin-bottom:10px">
        <button class="chip ${!chapter ? "on" : ""}" data-act="chapter" data-id="">All time</button>
        ${chapters.map((c) => html`<button class="chip ${c.id === chapterId ? "on" : ""}" data-act="chapter" data-id="${c.id}">${c.name}</button>`)}</div>` : ""}`;
    el.innerHTML = String(html`${head}<div data-body></div>`);
    const body = el.querySelector("[data-body]");
    if (!days.length && mode === "list") {
      body.innerHTML = String(html`<div class="empty">${raw(icon("timeline"))}<h3>Nothing here yet</h3><p>Your days appear here as you write. You can also <a href="#/import">bring in your Notion journal</a>.</p></div>`);
      return;
    }
    body.innerHTML = String(mode === "calendar" ? calendarHtml(days, chapters) : listHtml(days, chapters, chapter));
    ctx.media.hydrate(body);
  }

  function listHtml(days, chapters, chapter) {
    const byMonth = new Map();
    for (const d of days) {
      const m = monthKey(d.date);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(d);
    }
    const monthKeys = [...byMonth.keys()];
    const shown = monthKeys.slice(0, months);
    const startsChapter = new Map();
    for (const c of chapters) {
      const inC = days.filter((d) => compareDays(d.date, c.from) >= 0 && compareDays(d.date, c.to) <= 0);
      if (inC.length) startsChapter.set(inC[0].date, c);
    }
    return html`${chapter ? html`<p class="view-sub">${chapter.name}: ${formatDay(chapter.from, { day: "numeric", month: "short", year: "numeric" })} – ${formatDay(chapter.to, { day: "numeric", month: "short", year: "numeric" })}${chapter.note ? ` · ${chapter.note}` : ""}</p>` : ""}
      ${shown.map((m) => {
        const list = byMonth.get(m);
        const nEntries = list.reduce((n, d) => n + d.entries.length, 0);
        return html`<div class="month-head"><span>${formatMonth(m)}</span><span class="faint">${nEntries} entr${nEntries === 1 ? "y" : "ies"} · ${list.length} day${list.length === 1 ? "" : "s"}</span></div>
        ${list.map((d) => {
          const c = !chapter && startsChapter.get(d.date);
          const photos = d.entries.filter((e) => !(e.sealed && e.body == null)).flatMap((e) => (e.media || []).filter((x) => x.type === "photo")).slice(0, 2);
          const nPhotos = d.entries.reduce((n, e) => n + (e.media || []).filter((x) => x.type === "photo").length, 0);
          return html`${c ? html`<div class="chapter-band">${raw(icon("map"))}${c.name} <span class="faint" style="font-weight:500">until ${formatDay(c.to, { day: "numeric", month: "short" })}</span></div>` : ""}
          <a class="day-row" href="#/day/${d.date}">
            <div class="d"><div class="n">${Number(d.date.slice(8))}</div><div class="w">${formatDay(d.date, { weekday: "short" })}</div></div>
            <div class="body"><div class="line">${firstLine(d) || html`<span class="faint">—</span>`}</div>
              <div class="sub">${ratingDot(d.day)}${d.entries.length ? html`<span>${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"}</span>` : ""}${nPhotos ? html`<span>${nPhotos} photo${nPhotos === 1 ? "" : "s"}</span>` : ""}${(d.day?.emotions || []).length ? html`<span>${d.day.emotions.slice(0, 3).join(", ")}</span>` : ""}${d.events.length ? html`<span>${raw(icon("calendar"))} ${d.events.length}</span>` : ""}</div></div>
            ${photos.length ? html`<div class="ph">${photos.map((p) => html`<div class="t"><img alt="" data-media="${p.thumb || p.path}" data-fallback="${p.path}"></div>`)}</div>` : ""}
          </a>`;
        })}`;
      })}
      ${monthKeys.length > months ? html`<div class="center" style="margin:18px 0"><button class="btn" data-act="more">Show earlier months</button></div>` : html`<p class="center faint small" style="margin:24px 0">The beginning${days.length ? ` · ${formatDay(days[days.length - 1].date, { day: "numeric", month: "long", year: "numeric" })}` : ""}</p>`}`;
  }

  function calendarHtml(days, chapters) {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const first = `${calMonth}-01`;
    const [y, m] = calMonth.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const lead = (weekdayIndex(first) + 6) % 7; // Monday-first
    const today = ctx.today();
    const prev = monthKey(addDays(first, -1));
    const next = monthKey(addDays(last, 1));
    const cells = dayRange(first, last).map((date) => {
      const d = byDate.get(date);
      const photo = d && d.entries.filter((e) => !(e.sealed && e.body == null)).flatMap((e) => (e.media || []).filter((x) => x.type === "photo"))[0];
      return html`<a href="#/day/${date}" class="${photo ? "has-photo" : ""} ${date === today ? "today" : ""}" aria-label="${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}">
        ${photo ? html`<img alt="" data-media="${photo.thumb || photo.path}" data-fallback="${photo.path}">` : ""}
        <span class="n">${Number(date.slice(8))}</span>
        ${d?.day?.rating != null ? html`<span class="r">${d.day.rating}</span>` : ""}
        ${d && d.entries.length && !photo ? html`<span class="dot"></span>` : ""}</a>`;
    });
    const chaptersThisMonth = chapters.filter((c) => compareDays(c.to, first) >= 0 && compareDays(c.from, last) <= 0);
    return html`<div class="row between" style="margin-bottom:10px">
        <button class="btn icon ghost" data-act="cal" data-m="${prev}" aria-label="Previous month">${raw(icon("back"))}</button>
        <b>${formatMonth(calMonth)}</b>
        <button class="btn icon ghost" data-act="cal" data-m="${next}" aria-label="Next month" ${compareDays(first, today) > 0 ? "disabled" : ""}>${raw(icon("chevron"))}</button></div>
      <div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => html`<div class="wd">${w}</div>`)}${Array.from({ length: lead }, () => html`<span class="blank"></span>`)}${cells}</div>
      ${chaptersThisMonth.map((c) => html`<div class="chapter-band">${raw(icon("map"))}${c.name}: ${formatDay(c.from, { day: "numeric", month: "short" })} – ${formatDay(c.to, { day: "numeric", month: "short" })}</div>`)}
      <p class="small faint" style="margin-top:10px">Numbers in the corner are day ratings; a dot means you wrote something.</p>`;
  }

  async function manageChapters() {
    const list = ctx.chapters();
    const v = await sheet({
      title: "Chapters",
      body: html`<p class="small muted" style="margin-top:0">Name a stretch of time — a trip, a job, a season of life. Chapters are just labels over your days; nothing is moved.</p>
        <div class="stack-sm">${list.map((c) => html`<div class="row"><div class="grow"><b>${c.name}</b><div class="small muted">${c.from} → ${c.to}</div></div><button class="btn small ghost" data-edit="${c.id}">Edit</button></div>`)}</div>
        ${list.length ? "" : html`<p class="faint">No chapters yet.</p>`}`,
      foot: html`<button class="btn" data-close>Done</button><button class="btn primary" data-new>New chapter</button>`,
      setup: (d, close) => {
        d.querySelector("[data-new]").addEventListener("click", () => close({ edit: null }));
        on(d, "click", "[data-edit]", (e, b) => close({ edit: b.dataset.edit }));
      },
    });
    if (!v) return;
    const cur = list.find((c) => c.id === v.edit) || { id: newId("ch", ctx.now()), name: "", from: ctx.today(), to: ctx.today(), note: "" };
    const res = await sheet({
      title: v.edit ? "Edit chapter" : "New chapter",
      body: html`<label class="field"><span>Name</span><input class="input" data-name value="${cur.name}" placeholder="e.g. Vietnam, autumn 2026" autofocus autocomplete="off"></label>
        <div class="row"><label class="field grow"><span>From</span><input class="input" type="date" data-from value="${cur.from}"></label><label class="field grow"><span>To</span><input class="input" type="date" data-to value="${cur.to}"></label></div>
        <label class="field"><span>Note (optional)</span><input class="input" data-note value="${cur.note || ""}" autocomplete="off"></label>`,
      foot: html`${v.edit ? html`<button class="btn danger" data-del>Delete</button>` : ""}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => {
        d.querySelector("[data-ok]").addEventListener("click", () => close({ ...cur, name: d.querySelector("[data-name]").value.trim(), from: d.querySelector("[data-from]").value, to: d.querySelector("[data-to]").value, note: d.querySelector("[data-note]").value.trim() || undefined }));
        d.querySelector("[data-del]")?.addEventListener("click", () => close({ del: true }));
      },
    });
    if (!res) return;
    if (res.del) {
      if (await confirmSheet(`Delete the chapter "${cur.name}"? Your days are not affected.`, { danger: true, confirm: "Delete" })) await ctx.saveChapters(list.filter((c) => c.id !== cur.id));
      return render();
    }
    if (!res.name || !res.from || !res.to) return toast("A chapter needs a name and dates.");
    const [from, to] = compareDays(res.from, res.to) <= 0 ? [res.from, res.to] : [res.to, res.from];
    await ctx.saveChapters([...list.filter((c) => c.id !== res.id), { ...res, from, to }]);
    render();
  }

  render();
  ui.onStore(() => render());
  on(el, "click", "[data-act]", (e, b) => {
    const act = b.dataset.act;
    if (act === "mode") { mode = b.dataset.mode; history.replaceState(null, "", `#/timeline?mode=${mode}`); return render(); }
    if (act === "chapter") { chapterId = b.dataset.id; months = PAGE_MONTHS; return render(); }
    if (act === "more") { months += PAGE_MONTHS; return render(); }
    if (act === "cal") { calMonth = b.dataset.m; return render(); }
  });
  ui.onAction((e, b) => { if (b.dataset.act === "chapters") manageChapters(); });
}
