// One experiment. A proposition shows its question, why, method, cost and
// sources, with Select (only you select). Once Active it asks for your
// hypothesis and what you expect — written before you start, like a source's
// "expect" — and keeps a dated log of steps and its own corkboard ("Start a
// board" makes one the usual way and links it). Done adds the result, what
// surprised you, a verdict and the sources it produced. Claude's steps in the
// log are marked as Claude's; the hypothesis, expectation, result, surprise and
// verdict are only ever yours.

import { html, raw, on, debounce, autosize, toast } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { fmtButton, formatted, wireFormat } from "../../ui/textformat.js";
import { EXP_STATUSES, VERDICTS, COSTS, addLogStep } from "../../core/experiments.js";
import { makeBoard, boardParts, boardSummary } from "../../core/boards.js";
import { pickSource } from "../ui.js";
import { moveExperiment } from "./experiments.js";

const who = (a) => (a === "claude" || a === "claude-code" ? "Claude" : !a || a === "self" ? "You" : a);
const day = (iso) => String(iso || "").slice(0, 10);

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  let x = ctx.store.get(id);
  if (!x || x.type !== "experiment") {
    ui.setTitle("Not found", { back: "#/experiments" });
    el.innerHTML = String(html`<div class="empty"><h3>This experiment isn't here</h3><p><a href="#/experiments">All experiments</a></p></div>`);
    return;
  }
  ui.wide(true);
  const title = () => ui.setTitle(EXP_STATUSES[x.status] || "Experiment", { back: "#/experiments" });
  title();

  const field = (k, label, ph, { rows = 2, hint = "" } = {}) => html`<div class="fmt-scope"><label class="field"><span>${label}${hint ? html` <span class="faint">${hint}</span>` : ""}</span>
    <textarea class="textarea" data-f="${k}" data-fmtable rows="${rows}" placeholder="${ph}">${x[k] || ""}</textarea></label>${fmtButton(label)}</div>`;
  const links = (key, empty) => {
    const list = (x[key] || []).map((sid) => ctx.store.get(sid) || { id: sid, missing: true });
    return html`${list.length ? list.map((s) => html`<div class="piece-source">${s.missing ? html`<span class="faint">${s.id} (not on this device)</span>` : html`<a href="#/source/${s.id}">${s.title || s.url}</a>`}<button class="btn icon small ghost" data-rm="${key}:${s.id}" aria-label="Remove">${raw(icon("close"))}</button></div>`) : html`<p class="small faint">${empty}</p>`}
      <button class="btn small" data-link="${key}">${raw(icon("plus"))}Link a source</button>`;
  };

  const render = () => {
    x = ctx.store.get(id) || x;
    const sum = x.board && ctx.store.get(x.board) ? boardSummary(boardParts(ctx.records(), x.board)) : null;
    const started = x.status === "active" || x.status === "done";
    const byAi = x.author === "claude" || x.author === "claude-code";
    el.innerHTML = String(html`<div class="src-page exp-page" data-status="${x.status}">
      <div class="src-side">
        <textarea class="src-title-in" data-f="title" rows="1" aria-label="Short name" placeholder="A short name">${x.title || ""}</textarea>
        <div class="exp-moves">
          <span class="exp-status s-${x.status}">${EXP_STATUSES[x.status]}</span>
          ${x.status === "proposed" ? html`<button class="btn small primary" data-move="active">${raw(icon("check"))}Select</button><button class="btn small ghost" data-move="shelved">Set aside</button>` : ""}
          ${x.status === "active" ? html`<button class="btn small primary" data-move="done">${raw(icon("check"))}Mark done</button><button class="btn small ghost" data-move="proposed">Back to propositions</button>` : ""}
          ${x.status === "done" ? html`<button class="btn small ghost" data-move="active">Reopen</button>` : ""}
          ${x.status === "shelved" ? html`<button class="btn small" data-move="proposed">Bring back</button>` : ""}
        </div>
        ${byAi ? html`<p class="small muted by-ai-note">${raw(icon("sparkle"))} Proposed by Claude${x.created ? ` on ${day(x.created)}` : ""}. Only you select it, and only you write the hypothesis, expectation, result and verdict.</p>` : ""}
        ${field("question", "Question", "What would this answer?", { rows: 2 })}
        ${field("why", "Why", "Why it matters, or what it would change", { rows: 2 })}
        ${field("method", "Method", "In a line or two", { rows: 2 })}
        <div class="section-title">Cost</div>
        <div class="exp-cost-in">${COSTS.map(([k, l]) => html`<label class="field"><span>${l}</span><input class="input" data-cost="${k}" value="${x.cost?.[k] || ""}" placeholder="${k === "hours" ? "e.g. a weekend" : k === "money" ? "e.g. free" : "e.g. none"}" autocomplete="off"></label>`)}</div>
        <div class="section-title">Sources</div>
        ${links("sources", "Nothing linked yet.")}
        ${started ? html`<a class="board-link" href="#/board/${x.board || ""}" data-act-inline="board">${raw(icon("map"))}<span><b>${sum ? "Its corkboard" : "Start a board"}</b><br><span class="small muted">${sum ? `${sum.pins} pins · ${sum.red} red string${sum.red === 1 ? "" : "s"} · ${sum.synthesised} synthesised` : "Pin what you find and connect it as you go."}</span></span></a>` : ""}
        <p class="small faint" style="margin-top:18px">${[`added ${day(x.created)}`, x.selected ? `selected ${day(x.selected)}` : "", x.finished ? `finished ${day(x.finished)}` : ""].filter(Boolean).join(" · ")}</p>
      </div>
      <div class="src-notes exp-main">
        ${started ? html`
          <div class="exp-before ${x.hypothesis || x.expected ? "" : "nudge"}">
            ${field("hypothesis", "Hypothesis", "What you think is true, before you start", { rows: 2, hint: "— yours, before you start" })}
            ${field("expected", "Expected result", "What you expect to see if you're right", { rows: 2 })}
          </div>
          <div class="section-title">Log</div>
          <ol class="exp-log">${(x.log || []).map((s) => html`<li class="${s.author && s.author !== "self" ? "by-ai" : ""}"><span class="exp-log-when">${day(s.date)}${s.author && s.author !== "self" ? html` · ${who(s.author)}` : ""}</span><span>${formatted(s.text)}</span></li>`)}</ol>
          ${x.log?.length ? "" : html`<p class="small faint">No steps yet.</p>`}
          <div class="exp-step"><input class="input" data-step placeholder="What you did, or what happened" autocomplete="off" aria-label="A step for the log"><button class="btn small" data-act-inline="step">${raw(icon("plus"))}Add step</button></div>
        ` : html`<div class="empty small-empty">${raw(icon("flask"))}<h3>${x.status === "shelved" ? "Set aside" : "Not started"}</h3><p>${x.status === "shelved" ? "Kept here in case you want it back." : "Select it to start: you'll write your hypothesis and what you expect, then log steps and work on its own corkboard."}</p></div>`}
        ${x.status === "done" ? html`
          <div class="section-title">Outcome</div>
          ${field("result", "Result", "What happened", { rows: 3 })}
          ${field("surprised", "What surprised you", "Anything you didn't expect", { rows: 2 })}
          <div class="field"><span>Verdict</span><div class="status-seg" role="group" aria-label="Verdict">${Object.entries(VERDICTS).map(([k, l]) => html`<button type="button" data-verdict="${k}" class="${x.verdict === k ? "on" : ""}">${l}</button>`)}</div></div>
          <div class="section-title">Sources it produced</div>
          ${links("produced", "None yet — link anything you wrote or saved from it.")}
        ` : ""}
      </div>
    </div>`);
    for (const t of el.querySelectorAll("textarea")) autosize(t, 0.6);
    ui.cleanup(wireFormat(el));
  };
  render();

  const save = async (patch) => {
    const cur = ctx.store.get(id) || x;
    x = { ...cur, ...patch, updated: ctx.now() };
    for (const [k, v] of Object.entries(patch)) if (v === undefined || v === "") delete x[k];
    await ctx.store.put(x);
  };
  let pending = {};
  const flush = debounce(async () => { const q = pending; pending = {}; if (Object.keys(q).length) await save(q); }, 600);
  ui.cleanup(() => flush.flush());
  // Redraw on changes from elsewhere (a sync, Claude's log step) — not while you're typing here.
  ui.onStore((c) => {
    if (!c?.ids?.some((i) => i === id || i === x.board) || !c.fromSync) return;
    if (Object.keys(pending).length || (el.contains(document.activeElement) && document.activeElement.matches("textarea, input, [contenteditable]"))) return;
    render();
  });
  on(el, "input", "[data-f]", (e, f) => { pending[f.dataset.f] = f.value.trim() ? f.value : ""; flush(); });
  on(el, "input", "[data-cost]", (e, f) => {
    const cost = { ...(x.cost || {}), ...(pending.cost || {}) };
    if (f.value.trim()) cost[f.dataset.cost] = f.value; else delete cost[f.dataset.cost];
    pending.cost = Object.keys(cost).length ? cost : "";
    flush();
  });
  on(el, "click", "[data-move]", async (e, b) => {
    flush.flush();
    const next = await moveExperiment(ctx, id, b.dataset.move);
    if (!next) return;
    x = next;
    title();
    render();
    if (b.dataset.move === "active" && !x.hypothesis) { toast("Before you start: your hypothesis and what you expect."); el.querySelector('.fmt-scope:has([data-f="hypothesis"]) .rich-field, [data-f="hypothesis"]')?.focus(); }
  });
  on(el, "click", "[data-verdict]", async (e, b) => { await save({ verdict: x.verdict === b.dataset.verdict ? undefined : b.dataset.verdict }); render(); });
  const addStep = async () => {
    const input = el.querySelector("[data-step]");
    if (!input?.value.trim()) return;
    flush.flush();
    await save({ log: addLogStep(ctx.store.get(id) || x, input.value, { now: ctx.now() }) });
    render();
    el.querySelector("[data-step]")?.focus();
  };
  on(el, "keydown", "[data-step]", (e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } });
  on(el, "click", "[data-link]", async (e, b) => {
    const key = b.dataset.link;
    const sid = await pickSource(ctx, { exclude: x[key] || [] });
    if (sid) { await save({ [key]: [...new Set([...(x[key] || []), sid])] }); render(); }
  });
  on(el, "click", "[data-rm]", async (e, b) => {
    const [key, sid] = b.dataset.rm.split(":");
    const left = (x[key] || []).filter((s) => s !== sid);
    await save({ [key]: left.length ? left : undefined });
    render();
  });
  async function openBoard() {
    flush.flush();
    let boardId = x.board;
    if (!boardId || !ctx.store.get(boardId)) {
      const b = makeBoard({ title: x.title || String(x.question || "Experiment").slice(0, 80), experiment: x.id, about: "Working on this experiment" }, { now: ctx.now() });
      await ctx.store.put(b);
      await save({ board: b.id });
      boardId = b.id;
    }
    ctx.navigate(`#/board/${boardId}`);
  }
  on(el, "click", "[data-act-inline]", async (e, b) => {
    if (b.dataset.actInline === "board") { e.preventDefault(); openBoard(); }
    if (b.dataset.actInline === "step") addStep();
  });
}
