// Today: "What would you like to capture or reflect on right now?"
// A writing area first; voice and photos one tap away; everything else
// (day rating, moments, a reflective question) optional and quiet.

import { html, raw, on, debounce, autosize, toast, sheet, pickFiles, errorToast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { entryCard, eventCard, whyList, privacyBadge } from "../ui/components.js";
import { dayPanelHtml, wireDayPanel } from "../ui/day-panel.js";
import { formatDayLong, formatDay, addDays, relativeDayLabel, compareDays, daysBetween } from "../core/dates.js";
import { todayPrompts, PROMPT_KINDS, withFeedback } from "../core/prompts.js";
import { onThisDay } from "../core/stats.js";
import { PRIVACY_LEVELS } from "../core/model.js";
import { plainExcerpt } from "../core/markdown.js";
import { loadDraft, blankDraft, saveDraft, clearDraft, saveDraftAsEntry, storePhotos } from "../app/actions.js";

const PROMPT_STATE = "prompt-state";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Today");
  const today = ctx.today();
  let draft = loadDraft(ctx) || blankDraft(ctx);
  if (route.query.q && !draft.body) draft = { ...draft, questionId: route.query.q };
  if (route.query.prefill && !draft.body) draft = { ...draft, body: route.query.prefill };
  if (route.query.prompt && !draft.body) draft = { ...draft, questionText: route.query.prompt };
  if (route.query.day && /^\d{4}-\d{2}-\d{2}$/.test(route.query.day) && !draft.body) draft = { ...draft, day: route.query.day === today ? null : route.query.day };
  const prefs = ctx.prefs();
  const simple = !!prefs.simple_today;
  const chapter = ctx.chapters().find((c) => c.from && c.to && compareDays(today, c.from) >= 0 && compareDays(today, c.to) <= 0);

  el.innerHTML = String(html`
    <div class="today-head">
      <div class="date">${formatDay(today, { weekday: "long", day: "numeric", month: "long" })}</div>
      <div class="sub">${chapter ? html`${chapter.name} · day ${daysBetween(chapter.from, today) + 1} · ` : ""}What would you like to capture or reflect on?</div>
    </div>
    <div class="composer" id="composer">
      <div id="qchip"></div>
      <label class="sr-only" for="compose">Write</label>
      <textarea id="compose" placeholder="What's on your mind?" autocomplete="off" spellcheck="true"></textarea>
      <div class="composer-media" id="cmedia"></div>
      <div class="composer-meta" id="cmeta"></div>
      <div class="composer-bar">
        <button class="btn ghost" data-act="speak" title="Record a voice note">${raw(icon("mic"))}<span>Speak</span></button>
        <button class="btn ghost" data-act="photos" title="Add photos">${raw(icon("camera"))}<span>Photos</span></button>
        <button class="btn ghost" data-act="talk" title="Talk it through">${raw(icon("chat"))}<span class="only-desktop">Talk</span></button>
        <div class="grow"></div>
        <button class="btn primary" data-act="save" id="save-btn">Save</button>
      </div>
    </div>
    <div id="nudge"></div>
    <div id="prompts" class="${simple ? "hidden" : ""}" style="margin-top:14px"></div>
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
    const day = draft.day || today;
    el.querySelector("#cmeta").innerHTML = String(html`<span>For</span><button type="button" data-act="day">${day === today ? "today" : relativeDayLabel(day, today)}</button>
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
      draft = blankDraft(ctx);
      await clearDraft(ctx);
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
    if (simple) return;
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
  function renderDay() {
    const evening = new Date().getHours() >= (ctx.prefs().prompts?.evening_hour ?? 19);
    el.querySelector("#daypanel").innerHTML = String(html`<div class="section-title">About today</div>${dayPanelHtml(ctx, today, { evening, simple: simple && !expanded })}`);
  }
  let expanded = false;

  function renderList() {
    const entries = ctx.store.entriesForDay(today);
    const events = ctx.store.all("event").filter((e) => e.day === today);
    const items = [...entries.map((e) => ({ t: e.created, h: entryCard(e) })), ...events.map((e) => ({ t: e.start, h: eventCard(e) }))]
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    el.querySelector("#list").innerHTML = items.length
      ? String(html`<div class="section-title">Moments from today</div>${items.map((i) => i.h)}`)
      : "";
    ctx.media.hydrate(el.querySelector("#list"));
  }

  function renderMemories() {
    const box = el.querySelector("#otd");
    if (ctx.prefs().prompts?.on_this_day === false) { box.innerHTML = ""; return; }
    const mem = onThisDay(ctx.store.all("entry"), today).filter((e) => !e.sealed).slice(0, 3);
    box.innerHTML = mem.length ? String(html`<div class="section-title">On this day</div>${mem.map((e) => html`<a class="entry-card" href="#/entry/${e.id}">
      <div class="meta">${raw(icon("history"))}<span>${Number(today.slice(0, 4)) - Number(e.day.slice(0, 4))} year${Number(today.slice(0, 4)) - Number(e.day.slice(0, 4)) === 1 ? "" : "s"} ago · ${formatDay(e.day, { year: "numeric" })}</span></div>
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

  renderQuestion(); renderMeta(); renderMedia(); renderPrompts(); renderDay(); renderList(); renderMemories(); renderNudge();
  wireDayPanel(el.querySelector("#daypanel"), ctx, today, { onExpand: () => { expanded = true; renderDay(); } });
  ui.onStore((c) => {
    if (c.op === "kv" && c.key?.startsWith("draft")) return;
    renderList(); renderDay(); renderNudge();
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
      if (act === "speak") {
        const { captureVoice } = await import("../voice/capture.js");
        const entry = await captureVoice(ctx, { day: draft.day || today, privacy: draft.privacy, questionId: draft.questionId });
        if (entry) toast("Voice note saved", { action: "Open", onAction: () => ctx.navigate(`#/entry/${entry.id}`) });
        return;
      }
      if (act === "photos") {
        const files = await pickFiles({ accept: "image/*", multiple: true });
        if (!files.length) return;
        if (draft.privacy === "sealed" && ctx.store.isLocked()) throw new Error("Unlock sealed entries first.");
        btn.setAttribute("disabled", "");
        const media = await storePhotos(ctx, { entryId: draft.id, day: draft.day || today, sealed: draft.privacy === "sealed" }, files);
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
    const cur = draft.day || today;
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
    if (!v) return;
    if ((draft.media || []).length && v !== (draft.day || today)) {
      toast("Photos already added stay filed under their original month; the entry moves to the new day.");
    }
    draft.day = v === today ? null : v;
    renderMeta(); persist();
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
