// Today: "What would you like to capture or reflect on right now?"
// A writing area first; voice and photos one tap away; everything else
// (day rating, moments, a reflective question) optional and quiet.
//
// The same page serves any past day (#/day/2026-10-23) for catching up: then
// everything on it — heading, composer, rating and moments — is about that day,
// and it helps you remember: what your records say (tasks, calendar, the days
// either side) and a short walk through the day, morning to night (core/recall.js).

import { html, raw, on, debounce, autosize, toast, sheet, pickFiles, errorToast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { entryCard, eventCard, whyList, privacyBadge } from "../ui/components.js";
import { dayPanelHtml, wireDayPanel } from "../ui/day-panel.js";
import { formatDay, addDays, relativeDayLabel, compareDays, daysBetween } from "../core/dates.js";
import { todayPrompts, PROMPT_KINDS, withFeedback } from "../core/prompts.js";
import { onThisDay } from "../core/stats.js";
import { PRIVACY_LEVELS } from "../core/model.js";
import { plainExcerpt } from "../core/markdown.js";
import { loadDraft, blankDraft, saveDraft, clearDraft, saveDraftAsEntry, storePhotos, draftHasContent } from "../app/actions.js";
import { RECALL_STEPS, assembleWalkthrough, taskCuesForDay, neighbourCues } from "../core/recall.js";
import { addPhotosForDays } from "../ui/photo-days.js";

const PROMPT_STATE = "prompt-state";

/** "today", "yesterday", "Friday" (this past week) or "23 Oct". */
export function dayWord(day, today) {
  const label = relativeDayLabel(day, today);
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : label;
}

export async function mount(el, ctx, route, ui) {
  const today = ctx.today();
  // #/day/<today> is just Today; old links (#/today?day=…) open the day's own page.
  const routed = route.params?.[0] || null;
  const legacy = !routed && /^\d{4}-\d{2}-\d{2}$/.test(route.query.day || "") ? route.query.day : null;
  if (routed === today || (legacy && legacy !== today)) {
    const keep = new URLSearchParams(Object.entries(route.query).filter(([k]) => k !== "day")).toString();
    ctx.navigate(`${routed === today ? "#/today" : `#/day/${legacy}`}${keep ? `?${keep}` : ""}`, { replace: true });
    return;
  }
  const day = routed || today;
  const isToday = day === today;
  const future = compareDays(day, today) > 0;
  const word = dayWord(day, today);
  if (isToday) ui.setTitle("Today");
  else {
    ui.setTitle(relativeDayLabel(day, today), { back: "history" });
    // Named neighbours ("‹ Wed", "Fri ›") so they can't be mistaken for the back button.
    const prev = addDays(day, -1);
    const next = addDays(day, 1);
    const short = (d) => (d === today ? "Today" : formatDay(d, { weekday: "short" }));
    ui.setActions(html`<a class="btn ghost small day-step" href="#/day/${prev}" aria-label="Previous day">${raw(icon("back"))}${short(prev)}</a><a class="btn ghost small day-step" href="${next === today ? "#/today" : `#/day/${next}`}" aria-label="Next day">${short(next)}${raw(icon("chevron"))}</a>`);
  }

  let draft = loadDraft(ctx, isToday ? null : day);
  if (isToday && draft?.day && draft.day !== today) {
    // An unfinished entry for another day (from before days had their own pages): move it
    // there — joined to that day's own draft if it has one, so nothing is lost.
    const other = draft.day;
    if (draftHasContent(draft)) {
      const there = loadDraft(ctx, other);
      const merged = draftHasContent(there)
        ? { ...there, body: [there.body, draft.body].map((b) => String(b || "").trim()).filter(Boolean).join("\n\n"), media: [...(there.media || []), ...(draft.media || [])] }
        : draft;
      await saveDraft(ctx, { ...merged, day: other });
      toast(`Your unfinished entry for ${dayWord(other, today)} is waiting on its own page.`, { action: "Open", onAction: () => ctx.navigate(`#/day/${other}`), timeout: 8000 });
    }
    await clearDraft(ctx);
    draft = null;
  }
  draft = draft || blankDraft(ctx, { day: isToday ? null : day });
  if (route.query.q && !draft.body) draft = { ...draft, questionId: route.query.q };
  if (route.query.prefill && !draft.body) draft = { ...draft, body: route.query.prefill };
  if (route.query.prompt && !draft.body) draft = { ...draft, questionText: route.query.prompt };
  const prefs = ctx.prefs();
  const simple = !!prefs.simple_today && isToday;
  const chapter = ctx.chapters().find((c) => c.from && c.to && compareDays(day, c.from) >= 0 && compareDays(day, c.to) <= 0);
  const ago = daysBetween(day, today);

  if (future) {
    // A day still to come: only what's planned (imported calendar events).
    const events = ctx.store.all("event").filter((e) => e.day === day);
    el.innerHTML = String(html`<div class="today-head"><div class="date">${formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div class="sub">In ${-ago} day${ago === -1 ? "" : "s"}</div></div>
      ${events.length ? html`<div class="section-title">Planned</div>${events.map((e) => eventCard(e))}` : html`<p class="muted">Nothing here yet.</p>`}`);
    return;
  }

  el.innerHTML = String(html`
    <div class="today-head">
      <div class="date">${formatDay(day, { weekday: "long", day: "numeric", month: "long", year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" })}</div>
      <div class="sub">${chapter ? html`${chapter.name} · day ${daysBetween(chapter.from, day) + 1} · ` : ""}${isToday ? "What would you like to capture or reflect on?" : html`${ago === 1 ? "Yesterday" : `${ago} days ago`} · What do you remember?`}</div>
    </div>
    ${isToday ? "" : html`<div class="recall card flat" id="cues"></div>`}
    <div class="composer" id="composer">
      <div id="qchip"></div>
      <label class="sr-only" for="compose">Write</label>
      <textarea id="compose" placeholder="What's on your mind?" autocomplete="off" spellcheck="true"></textarea>
      <div class="composer-media" id="cmedia"></div>
      <div class="composer-meta" id="cmeta"></div>
      <div class="composer-bar">
        <button class="btn ghost" data-act="speak" title="Record a voice note">${raw(icon("mic"))}<span>Speak</span></button>
        <button class="btn ghost" data-act="photos" title="Add photos">${raw(icon("camera"))}<span>Photos</span></button>
        ${isToday ? html`<button class="btn ghost" data-act="talk" title="Talk it through">${raw(icon("chat"))}<span class="only-desktop">Talk</span></button>` : ""}
        <div class="grow"></div>
        <button class="btn primary" data-act="save" id="save-btn">Save</button>
      </div>
    </div>
    <div id="nudge"></div>
    <div id="prompts" class="${simple || !isToday ? "hidden" : ""}" style="margin-top:14px"></div>
    <div id="walk"></div>
    <div class="day-panel" id="daypanel"></div>
    <div id="list"></div>
    <div id="otd"></div>
  `);

  const ta = el.querySelector("#compose");
  ta.value = draft.body || "";
  const fit = autosize(ta);
  const persist = debounce(() => saveDraft(ctx, draft), 350);
  ta.addEventListener("input", () => { draft.body = ta.value; persist(); updateSave(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } });
  ui.cleanup(() => persist.flush());
  window.addEventListener("pagehide", () => persist.flush(), { once: true });

  function updateSave() {
    const has = (draft.body || "").trim() || (draft.media || []).length;
    el.querySelector("#save-btn").toggleAttribute("disabled", !has);
  }

  function renderQuestion() {
    const q = draft.questionId ? ctx.store.get(draft.questionId) : null;
    const text = q?.text || draft.questionText;
    el.querySelector("#qchip").innerHTML = text ? String(html`<div class="question-chip">${raw(icon("question"))}<span class="grow">Answering: <b>${text}</b></span><button class="btn icon ghost small" data-act="drop-q" aria-label="Not answering this">${raw(icon("close"))}</button></div>`) : "";
    ta.placeholder = text ? "Answer in a word, a sentence, or a page…" : "What's on your mind?";
  }

  function renderMeta() {
    el.querySelector("#cmeta").innerHTML = String(html`<span>For</span><button type="button" data-act="day">${word}</button>
      <span>·</span><button type="button" data-act="privacy">${PRIVACY_LEVELS[draft.privacy || "normal"].label}</button>${privacyBadge(draft.privacy)}`);
  }

  function renderMedia() {
    const box = el.querySelector("#cmedia");
    box.innerHTML = String(html`${(draft.media || []).map((m) => html`<div class="thumb"><img alt="" data-media="${m.thumb || m.path}" data-fallback="${m.path}"><button type="button" data-act="rm-media" data-id="${m.id}" aria-label="Remove photo">×</button></div>`)}`);
    ctx.media.hydrate(box);
    updateSave();
  }

  async function save() {
    persist.cancel();
    draft.body = ta.value;
    try {
      const entry = await saveDraftAsEntry(ctx, draft);
      if (!entry) return;
      draft = blankDraft(ctx, { day: isToday ? null : day });
      await clearDraft(ctx, isToday ? null : day);
      ta.value = "";
      fit();
      renderQuestion(); renderMeta(); renderMedia();
      toast("Saved", { action: "Open", onAction: () => ctx.navigate(`#/entry/${entry.id}`) });
    } catch (err) { errorToast(err); }
  }

  // ---------- prompts ----------
  function promptState() {
    const s = ctx.store.getKv(PROMPT_STATE, null);
    return s && s.date === today ? s : { date: today, dismissed: [] };
  }
  function renderPrompts() {
    const box = el.querySelector("#prompts");
    if (simple || !isToday) return;
    const entries = ctx.store.entriesBetween(addDays(today, -21), today);
    const cards = todayPrompts({
      today, nowHour: new Date().getHours(), entries, questions: ctx.store.all("question"),
      events: ctx.store.all("event").filter((e) => compareDays(e.day, addDays(today, -1)) >= 0 && compareDays(e.day, today) <= 0),
      chapters: ctx.chapters(), prefs: ctx.prefs(), state: promptState(),
    });
    box.innerHTML = String(html`${cards.map((c) => html`<div class="prompt-card" data-card="${c.id}">
      <div class="kind">${PROMPT_KINDS[c.kind] || "A thought"}</div>
      <div class="q">${c.text}</div>
      <div class="btn-row">
        ${c.action.type === "open-entry" ? html`<a class="btn small primary" href="#/entry/${c.action.id}">Add words</a>` : html`<button class="btn small primary" data-act="answer" data-card="${c.id}">Write</button>`}
        ${ctx.ai.configured() && c.kind !== "photo-context" ? html`<a class="btn small" href="#/talk?about=${encodeURIComponent(c.text)}">Talk it through</a>` : ""}
        <button class="btn small ghost" data-act="dismiss" data-card="${c.id}">Not now</button>
        ${c.topic ? html`<button class="btn small ghost" data-act="mute" data-topic="${c.topic}">Mute #${c.topic}</button>` : ""}
        <span class="grow"></span>
        <button class="btn icon small ghost" data-act="why" data-card="${c.id}" aria-label="Why this appeared" title="Why this appeared">${raw(icon("info"))}</button>
        <button class="btn icon small ghost" data-act="fb-up" data-kind="${c.kind}" data-card="${c.id}" aria-label="Helpful" title="Helpful">${raw(icon("thumbUp"))}</button>
        <button class="btn icon small ghost" data-act="fb-down" data-kind="${c.kind}" data-card="${c.id}" aria-label="Not helpful" title="Not helpful">${raw(icon("thumbDown"))}</button>
      </div>
      <div class="hidden" data-why="${c.id}">${whyList(c.reasons)}</div>
    </div>`)}`);
    box._cards = cards;
  }
  async function dismissCard(id) {
    const s = promptState();
    await ctx.store.setKv(PROMPT_STATE, { ...s, dismissed: [...new Set([...s.dismissed, id])] });
    renderPrompts();
  }

  // ---------- day panel, list, memories ----------
  function isEvening() { return new Date().getHours() >= (ctx.prefs().prompts?.evening_hour ?? 19); }
  function renderDay() {
    el.querySelector("#daypanel").innerHTML = String(html`<div class="section-title">About ${word}</div>${dayPanelHtml(ctx, day, { evening: isToday && isEvening(), simple: simple && !expanded })}`);
  }
  let expanded = false;

  function renderList() {
    const entries = ctx.store.entriesForDay(day);
    const events = ctx.store.all("event").filter((e) => e.day === day);
    const items = [...entries.map((e) => ({ t: e.created, h: entryCard(e) })), ...events.map((e) => ({ t: e.start, h: eventCard(e) }))]
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    el.querySelector("#list").innerHTML = items.length
      ? String(html`<div class="section-title">Moments from ${word}</div>${items.map((i) => i.h)}`)
      : isToday ? "" : String(html`<div class="section-title">Moments from ${word}</div><p class="muted small">Nothing written for this day yet — and that's fine.</p>`);
    ctx.media.hydrate(el.querySelector("#list"));
  }

  function renderMemories() {
    const box = el.querySelector("#otd");
    if (ctx.prefs().prompts?.on_this_day === false) { box.innerHTML = ""; return; }
    const mem = onThisDay(ctx.store.all("entry"), day).filter((e) => !e.sealed).slice(0, 3);
    const yrs = (e) => Number(day.slice(0, 4)) - Number(e.day.slice(0, 4));
    box.innerHTML = mem.length ? String(html`<div class="section-title">On this day</div>${mem.map((e) => html`<a class="entry-card" href="#/entry/${e.id}">
      <div class="meta">${raw(icon("history"))}<span>${yrs(e)} year${yrs(e) === 1 ? "" : "s"} ${isToday ? "ago" : "before"} · ${formatDay(e.day, { year: "numeric" })}</span></div>
      <div class="excerpt">${plainExcerpt(e.body || e.title || "", 180) || "(photos)"}</div></a>`)}`) : "";
  }

  function renderNudge() {
    const box = el.querySelector("#nudge");
    const dismissed = ctx.store.getKv("nudge-sync-dismissed", false);
    const n = ctx.store.all("entry").length;
    if (!ctx.sync.configured() && !dismissed && n >= 3) {
      box.innerHTML = String(html`<div class="notice" style="margin-top:12px">${raw(icon("shield"))}<div class="grow">Your ${n} entries are saved on this device only. <a href="#/settings/sync">Set up a private backup</a> so they're safe if you lose your phone.</div><button class="btn icon small ghost" data-act="nudge-x" aria-label="Dismiss">${raw(icon("close"))}</button></div>`);
    } else box.innerHTML = "";
  }

  // ---------- helping you remember (past days) ----------
  let cues = { tasks: [], neighbours: [], events: [], loading: !isToday, failed: 0 };
  function cueQuestion(c) {
    if (c.kind === "done") return `You finished “${c.title}” that day. How did it go?`;
    if (c.kind === "added") return `You added “${c.title}” to your tasks that day. What brought it up?`;
    if (c.kind === "note") return `You noted something about “${c.title}”. What was going on?`;
    if (c.kind === "event") return `“${c.title}” — how was it?`;
    return null;
  }
  function renderCues() {
    const box = el.querySelector("#cues");
    if (!box) return;
    const events = ctx.store.all("event").filter((e) => e.day === day).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const hasPhotos = ctx.store.entriesForDay(day).some((e) => (e.media || []).some((m) => m.type === "photo"));
    const rows = [
      ...cues.tasks.map((c, i) => html`<li><button type="button" class="cue" data-act="cue" data-cue="t${i}">${raw(icon(c.kind === "done" ? "check" : c.kind === "note" ? "edit" : "plus"))}<span>${c.kind === "done" ? "Finished" : c.kind === "note" ? "Note on" : "Added"} <b>${c.title}</b>${c.kind === "note" && c.text ? html`: “${c.text}”` : ""}${c.kind === "done" && c.text ? html` — “${c.text}”` : ""}${c.category ? html` <span class="faint">· ${c.category}</span>` : ""}</span></button></li>`),
      ...events.map((e, i) => html`<li><button type="button" class="cue" data-act="cue" data-cue="e${i}">${raw(icon("calendar"))}<span>${e.all_day ? "" : html`${String(e.start || "").slice(11, 16)} `}<b>${e.title || "Event"}</b>${e.location ? html` <span class="faint">· ${e.location}</span>` : ""}</span></button></li>`),
      ...cues.neighbours.map((n) => html`<li><a class="cue" href="#/day/${n.day}">${raw(icon("history"))}<span>${n.when === "before" ? "The day before" : "The day after"} (${dayWord(n.day, today)}) you wrote: ${n.bits.map((b, k) => html`${k ? " · " : ""}“${b}”`)}</span></a></li>`),
    ];
    box.innerHTML = String(html`<div class="section-title" style="margin-top:0">To help you remember</div>
      ${rows.length ? html`<ul class="cue-list">${rows}</ul>` : cues.loading ? "" : html`<p class="small muted" style="margin:0">No records for this day — start wherever you woke up, or walk through it below.</p>`}
      ${cues.loading ? html`<p class="small faint" style="margin:6px 0 0">Looking in your tasks…</p>` : ""}
      ${!hasPhotos ? html`<p class="small muted" style="margin:8px 0 0">${raw(icon("camera"))} Your camera roll from ${word} is often the quickest way back — add a few with <b>Photos</b> below, or the first photo of each day you're catching up on: <button type="button" class="linkish" data-act="photo-days">Photos for several days</button>.</p>` : ""}
      ${cues.tasks.length || cues.failed ? html`<p class="tiny faint" style="margin:8px 0 0">${cues.tasks.length ? "From your tasks — records, not memories: use what helps. Tasks dates are in UTC, so something done before 7am may show a day early. " : ""}${cues.failed ? "Couldn't reach your tasks just now." : ""}</p>` : ""}`);
    box._events = events;
  }
  async function loadCues() {
    if (isToday) return;
    cues.neighbours = neighbourCues(day, { entries: ctx.store.all("entry"), days: ctx.store.all("day") });
    renderCues();
    try {
      const { loadTaskSources } = await import("../integrations/tasks.js");
      const { sources, failed } = await loadTaskSources(ctx);
      if (!ui.alive()) return;
      cues.tasks = taskCuesForDay(day, sources, { tz: ctx.tz(), rolloverHour: ctx.prefs().rollover_hour ?? 4 }).slice(0, 12);
      cues.failed = failed;
    } catch { cues.failed = 1; }
    cues.loading = false;
    renderCues();
  }

  function renderWalk() {
    const box = el.querySelector("#walk");
    const show = !isToday || isEvening();
    const started = ctx.store.getKv(`walk:${day}`, null);
    box.innerHTML = show ? String(html`<div class="walk-card">
      <div class="grow"><div class="title">${started ? "Continue walking through" : "Walk through"} ${word}</div>
      <div class="small muted">A few short questions, from waking up to the evening. Your answers land in the box above for you to read over and save.</div></div>
      <button class="btn small ${isToday ? "" : "primary"}" data-act="walk">${started ? "Continue" : "Start"}</button></div>`) : "";
  }

  async function walkThrough() {
    const key = `walk:${day}`;
    const saved = ctx.store.getKv(key, null) || {};
    const answers = { ...(saved.answers || {}) };
    let i = Math.min(saved.step || 0, RECALL_STEPS.length - 1);
    const last = RECALL_STEPS.length - 1;
    const hints = [...new Set([...cues.tasks.map((c) => c.title), ...(el.querySelector("#cues")?._events || []).map((e) => e.title)].filter(Boolean))].slice(0, 6);
    const result = await sheet({
      title: `Walk through ${word}`,
      body: html`<div data-walk></div>`,
      foot: html`<button class="btn ghost" data-back>Back</button><span class="grow"></span><button class="btn" data-finish>Finish now</button><button class="btn primary" data-next>Next</button>`,
      setup: (d, close) => {
        const box = d.querySelector("[data-walk]");
        // Read the box into the current step's answer, then remember where you are.
        const keep = () => {
          const a = box.querySelector("[data-a]");
          if (a) answers[RECALL_STEPS[i].id] = a.value;
          ctx.store.setKv(key, { answers, step: i });
        };
        const go = (to) => { keep(); i = to; ctx.store.setKv(key, { answers, step: i }); render(); };
        const render = () => {
          const s = RECALL_STEPS[i];
          box.innerHTML = String(html`<div class="tiny faint">${i + 1} of ${RECALL_STEPS.length} · ${s.label}</div>
            <p class="walk-q">${s.q}</p>
            <textarea class="textarea" data-a rows="4" placeholder="A few words is plenty — or leave it empty.">${answers[s.id] || ""}</textarea>
            ${hints.length ? html`<p class="tiny faint">From your records: ${hints.join(" · ")}</p>` : ""}`);
          d.querySelector("[data-next]").textContent = i === last ? "Finish" : "Next";
          d.querySelector("[data-finish]").classList.toggle("hidden", i === last);
          d.querySelector("[data-back]").toggleAttribute("disabled", i === 0);
          const a = box.querySelector("[data-a]");
          a.addEventListener("input", debounce(keep, 300));
          setTimeout(() => a.focus(), 30);
        };
        d.querySelector("[data-next]").addEventListener("click", () => { if (i === last) { keep(); close(answers); } else go(i + 1); });
        d.querySelector("[data-finish]").addEventListener("click", () => { keep(); close(answers); });
        d.querySelector("[data-back]").addEventListener("click", () => { if (i > 0) go(i - 1); });
        render();
      },
    });
    renderWalk();
    if (!result) return; // closed early: your answers wait for "Continue"
    const text = assembleWalkthrough(result);
    await ctx.store.deleteKv(key);
    renderWalk();
    if (!text) return;
    // Into the composer, in your words only, to read over before saving.
    ta.value = ta.value.trim() ? `${ta.value.trim()}\n\n${text}` : text;
    draft.body = ta.value;
    if (!draft.questionId && !draft.questionText) draft.questionText = `Walk through ${word}`;
    persist(); fit(); updateSave(); renderQuestion();
    ta.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Your walk-through is in the box — read it over, then Save.");
  }

  renderQuestion(); renderMeta(); renderMedia(); renderPrompts(); renderWalk(); renderDay(); renderList(); renderMemories(); renderNudge();
  loadCues();
  wireDayPanel(el.querySelector("#daypanel"), ctx, day, { onExpand: () => { expanded = true; renderDay(); } });
  ui.onStore((c) => {
    if (c.op === "kv" && c.key?.startsWith("draft")) return;
    renderList(); renderDay(); renderNudge();
    if (!isToday && (c.types?.includes("entry") || c.types?.includes("event") || c.op === "synced")) { cues.neighbours = neighbourCues(day, { entries: ctx.store.all("entry"), days: ctx.store.all("day") }); renderCues(); }
    if (c.types?.includes("question") || c.types?.includes("config") || c.op === "synced") renderPrompts();
  });

  // ---------- actions ----------
  on(el, "click", "[data-act]", async (e, btn) => {
    const act = btn.dataset.act;
    try {
      if (act === "save") return save();
      if (act === "talk") return ctx.navigate("#/talk");
      if (act === "drop-q") { draft.questionId = null; draft.questionText = null; renderQuestion(); persist(); return; }
      if (act === "nudge-x") { await ctx.store.setKv("nudge-sync-dismissed", true); return renderNudge(); }
      if (act === "walk") return walkThrough();
      if (act === "photo-days") return addPhotosForDays(ctx); // straight away: the file picker needs the tap
      if (act === "cue") {
        const ref = btn.dataset.cue;
        const c = ref[0] === "t" ? cues.tasks[Number(ref.slice(1))] : { kind: "event", title: (el.querySelector("#cues")._events || [])[Number(ref.slice(1))]?.title || "" };
        const q = c && cueQuestion(c);
        if (!q) return;
        draft.questionText = q; draft.questionId = null;
        renderQuestion(); persist();
        ta.focus();
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (act === "speak") {
        const { captureVoice } = await import("../voice/capture.js");
        const entry = await captureVoice(ctx, { day, privacy: draft.privacy, questionId: draft.questionId });
        if (entry) toast("Voice note saved", { action: "Open", onAction: () => ctx.navigate(`#/entry/${entry.id}`) });
        return;
      }
      if (act === "photos") {
        const files = await pickFiles({ accept: "image/*", multiple: true });
        if (!files.length) return;
        if (draft.privacy === "sealed" && ctx.store.isLocked()) throw new Error("Unlock sealed entries first.");
        btn.setAttribute("disabled", "");
        const media = await storePhotos(ctx, { entryId: draft.id, day, sealed: draft.privacy === "sealed" }, files);
        btn.removeAttribute("disabled");
        draft.media = [...(draft.media || []), ...media];
        await saveDraft(ctx, draft);
        renderMedia();
        return;
      }
      if (act === "rm-media") {
        const m = draft.media.find((x) => x.id === btn.dataset.id);
        draft.media = draft.media.filter((x) => x.id !== btn.dataset.id);
        for (const p of [m?.path, m?.thumb]) if (p) await ctx.store.forgetBlob(p);
        await saveDraft(ctx, draft);
        return renderMedia();
      }
      if (act === "day") return pickDay();
      if (act === "privacy") return pickPrivacy();
      const card = (el.querySelector("#prompts")._cards || []).find((c) => c.id === btn.dataset.card);
      if (act === "why") return el.querySelector(`[data-why="${CSS.escape(btn.dataset.card)}"]`)?.classList.toggle("hidden");
      if (act === "dismiss") return dismissCard(btn.dataset.card);
      if (act === "mute") {
        const p = ctx.prefs();
        const until = addDays(today, 30);
        await ctx.savePrefs({ ...p, muted_topics: [...(p.muted_topics || []).filter((m) => (m.topic || m) !== btn.dataset.topic), { topic: btn.dataset.topic, until }] });
        toast(`#${btn.dataset.topic} muted until ${formatDay(until, { day: "numeric", month: "short" })}. Change in Settings → Prompts.`);
        return renderPrompts();
      }
      if (act === "fb-up" || act === "fb-down") {
        await ctx.savePrefs(withFeedback(ctx.prefs(), btn.dataset.kind, act === "fb-up"));
        if (act === "fb-down") { await dismissCard(btn.dataset.card); toast("Thanks — you'll see fewer like that."); }
        else toast("Thanks — noted.");
        return;
      }
      if (act === "answer" && card) {
        if (card.action.type === "answer") { draft.questionId = card.action.question; draft.questionText = null; }
        else if (card.action.question) { draft.questionText = card.action.question; draft.questionId = null; }
        if (card.action.prefill && !ta.value) { ta.value = card.action.prefill; draft.body = ta.value; }
        renderQuestion(); persist();
        ta.focus();
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
        const q = card.action.question && ctx.store.get(card.action.question);
        if (q) await ctx.store.put({ ...q, last_shown: ctx.now(), shown_count: (q.shown_count || 0) + 1 }, { keepUpdated: true });
      }
    } catch (err) { errorToast(err); }
  });

  async function pickDay() {
    const cur = day;
    const v = await sheet({
      title: "Which day is this for?",
      body: html`<div class="chips" style="margin-bottom:12px">
          <button class="chip ${cur === today ? "on" : ""}" data-d="${today}">Today</button>
          <button class="chip ${cur === addDays(today, -1) ? "on" : ""}" data-d="${addDays(today, -1)}">Yesterday</button></div>
        <label class="field"><span>Or pick a date</span><input class="input" type="date" data-date value="${cur}" max="${today}"></label>
        <p class="hint">Writing after midnight counts toward the previous day until ${ctx.prefs().rollover_hour ?? 4}am (change in Settings).</p>`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Use this day</button>`,
      setup: (d, close) => {
        on(d, "click", "[data-d]", (e, b) => close(b.dataset.d));
        d.querySelector("[data-ok]").addEventListener("click", () => close(d.querySelector("[data-date]").value));
      },
    });
    if (!v || v === day) return;
    if (compareDays(v, today) > 0) return toast("That day hasn't happened yet.");
    // The page follows the day: take what you've written along, unless that day has its own unfinished entry.
    const target = v === today ? null : v;
    persist.cancel();
    draft.body = ta.value;
    if (draftHasContent(draft)) {
      if (draftHasContent(loadDraft(ctx, target))) {
        toast(`${dayWord(v, today)[0].toUpperCase()}${dayWord(v, today).slice(1)} already has an unfinished entry — opening it; this one stays here.`, { timeout: 6000 });
        await saveDraft(ctx, draft);
      } else {
        if ((draft.media || []).length) toast("Photos already added stay filed under their original month; the entry moves to the new day.");
        await clearDraft(ctx, isToday ? null : day);
        await saveDraft(ctx, { ...draft, day: target });
      }
    }
    ctx.navigate(target ? `#/day/${target}` : "#/today");
  }

  async function pickPrivacy() {
    const cur = draft.privacy || "normal";
    const sealingSet = !!ctx.store.config("sealing", null)?.salt;
    const v = await sheet({
      title: "Who can read this entry?",
      body: html`<div class="stack-sm">${Object.entries(PRIVACY_LEVELS).map(([k, p]) => html`<button class="day-field" data-p="${k}" ${k === "sealed" && (!sealingSet || ctx.store.isLocked()) ? raw("data-needs-unlock") : ""}>
          <span class="k">${p.label}${k === cur ? " ✓" : ""}</span><span class="v small" style="font-family:var(--font-ui)">${p.hint}${k === "sealed" && !sealingSet ? " Set up a passphrase in Settings → Privacy first." : k === "sealed" && ctx.store.isLocked() ? " Unlock first (Settings → Privacy)." : ""}</span></button>`)}</div>`,
      setup: (d, close) => on(d, "click", "[data-p]", (e, b) => { if (b.hasAttribute("data-needs-unlock")) { close("settings"); } else close(b.dataset.p); }),
    });
    if (!v) return;
    if (v === "settings") return ctx.navigate("#/settings/privacy");
    if ((draft.media || []).length && (v === "sealed") !== (cur === "sealed")) {
      toast("Change privacy after saving when photos are attached (the photos need re-encrypting).", { timeout: 6000 });
      return;
    }
    draft.privacy = v;
    renderMeta(); persist();
  }

  if (!draft.body && !route.query.q) setTimeout(() => { if (matchMedia("(min-width: 960px)").matches) ta.focus(); }, 50);
  if (route.query.q || route.query.prompt) ta.focus();
}
