// Experiments: three columns — Propositions to choose from, Active ones you're
// running, and Done ones with their verdict — side by side on a wide screen and
// stacked on a phone. Only you select a proposition (it then asks for your
// hypothesis before you start). Ideas you don't want are set aside, not deleted,
// and wait at the bottom. The first time the tab opens (after your first sync, so
// another device's copy arrives first) it's seeded with Claude's starter ideas.

import { html, raw, on, promptSheet, toast } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { formatted } from "../../ui/textformat.js";
import { EXP_STATUSES, VERDICTS, COSTS, makeExperiment, movePatch, columns, starterRecords } from "../../core/experiments.js";
import { boardParts, boardSummary } from "../../core/boards.js";

const SEEDED = "experiments-seeded";
const byline = (x) => (x.author === "claude" || x.author === "claude-code" ? "Claude" : x.author && x.author !== "self" ? x.author : "");

/** One experiment as a card; `actions` are its column's buttons. */
export function expCard(ctx, x, records = ctx.records()) {
  const sum = x.board ? boardSummary(boardParts(records, x.board)) : null;
  const who = byline(x);
  const costs = COSTS.filter(([k]) => x.cost?.[k]).map(([k, l]) => html`<span class="exp-cost" title="${l}">${l}: ${x.cost[k]}</span>`);
  const steps = x.log?.length || 0;
  const meta = [who ? `Proposed by ${who}` : "", x.sources?.length ? `${x.sources.length} source${x.sources.length === 1 ? "" : "s"}` : "",
    x.status !== "proposed" && steps ? `${steps} step${steps === 1 ? "" : "s"}` : "", sum ? `board: ${sum.pins} pins${sum.red ? `, ${sum.red} red` : ""}` : ""].filter(Boolean).join(" · ");
  return html`<article class="exp-card src-card ${who ? "by-ai" : ""}" data-exp="${x.id}">
    <a class="src-main" href="#/experiment/${x.id}">
      ${x.title ? html`<div class="src-title">${formatted(x.title)}</div>` : ""}
      <div class="exp-q">${formatted(x.question || "")}</div>
      ${x.status === "proposed" && x.why ? html`<div class="src-why">${formatted(x.why)}</div>` : ""}
      ${x.status === "proposed" && x.method ? html`<div class="exp-method"><span class="faint">Method</span> ${formatted(x.method)}</div>` : ""}
      ${x.status === "active" && x.hypothesis ? html`<div class="exp-method"><span class="faint">Hypothesis</span> ${formatted(x.hypothesis)}</div>` : ""}
      ${x.status === "done" && x.result ? html`<div class="exp-method"><span class="faint">Result</span> ${formatted(x.result)}</div>` : ""}
      ${costs.length && x.status === "proposed" ? html`<div class="exp-costs">${costs}</div>` : ""}
      ${x.status === "done" ? html`<span class="exp-verdict v-${x.verdict || "none"}">${VERDICTS[x.verdict] || "No verdict yet"}</span>` : ""}
      ${meta ? html`<div class="src-meta">${meta}</div>` : ""}
    </a>
    ${x.status === "proposed" ? html`<div class="src-actions"><button class="btn small primary" data-select="${x.id}">${raw(icon("check"))}Select</button><button class="btn small ghost" data-shelve="${x.id}">Set aside</button></div>` : ""}
    ${x.status === "shelved" ? html`<div class="src-actions"><button class="btn small" data-unshelve="${x.id}">Bring back</button></div>` : ""}
  </article>`;
}

/** Move an experiment as its owner (the app is the owner's hand). */
export async function moveExperiment(ctx, id, to) {
  const x = ctx.store.get(id);
  if (!x) return null;
  const patch = movePatch(x, to, { now: ctx.now(), byOwner: true });
  if (patch.error) { toast(patch.error, { error: true }); return null; }
  const next = { ...x, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
  await ctx.store.put(next);
  return next;
}

/** Claude's starter ideas, once: after the first sync (or with no sync), and only if no experiment has ever been here. */
async function seedStarters(ctx) {
  if (ctx.store.getKv(SEEDED, false)) return;
  const any = [...ctx.store.records.values()].some((r) => r.type === "experiment");
  if (any) { await ctx.store.setKv(SEEDED, true); return; }
  if (ctx.sync.configured?.() && !ctx.sync.status?.lastSync) return; // wait: the first sync may bring them
  await ctx.store.setKv(SEEDED, true);
  // A starter links only the sources that are in this library; anyone else's copy gets none.
  for (const r of starterRecords({ now: ctx.now() })) {
    const sources = (r.sources || []).filter((id) => ctx.store.get(id));
    const rec = { ...r, sources };
    if (!sources.length) delete rec.sources;
    await ctx.store.put(rec);
  }
}

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Experiments");
  ui.wide(true);
  ui.setActions(html`<button class="btn small primary" data-act="new" title="New proposition" aria-label="New proposition">${raw(icon("plus"))}New</button>`);
  ui.onAction(async (e, b) => {
    if (b.dataset.act !== "new") return;
    const q = await promptSheet({ title: "New proposition", label: "The question it would answer", placeholder: "e.g. Does a small model track whether it's on the right track?", multiline: true, confirm: "Add it" });
    if (!q?.trim()) return;
    const x = makeExperiment({ question: q }, { now: ctx.now() });
    await ctx.store.put(x);
    ctx.navigate(`#/experiment/${x.id}`);
  });

  let showShelved = false;
  function render() {
    const records = ctx.records();
    const col = columns(ctx.experiments());
    const section = (k, hint, empty) => html`<section class="exp-col" data-col="${k}">
      <div class="section-title">${EXP_STATUSES[k]}${k === "proposed" ? "s" : ""} <span class="faint">· ${col[k].length}</span></div>
      <p class="small muted exp-hint">${hint}</p>
      ${col[k].length ? col[k].map((x) => expCard(ctx, x, records)) : html`<p class="small faint">${empty}</p>`}
    </section>`;
    el.innerHTML = String(html`<div class="exp-cols">
        ${section("proposed", "Ideas to choose from. Select one to start it.", "No ideas waiting. Add one, or ask Claude to propose some.")}
        ${section("active", "Write your hypothesis and what you expect before you start; log steps as you go.", "Nothing running. Select a proposition to start.")}
        ${section("done", "The result, what surprised you, and the verdict.", "Nothing finished yet.")}
      </div>
      ${col.shelved.length ? html`<div class="exp-shelved"><button class="btn small ghost" data-act-inline="shelved" aria-expanded="${showShelved}">${showShelved ? "Hide" : "Show"} set aside (${col.shelved.length})</button>
        ${showShelved ? html`<div class="exp-shelf">${col.shelved.map((x) => expCard(ctx, x, records))}</div>` : ""}</div>` : ""}`);
  }
  await seedStarters(ctx);
  render();
  ui.onStore(() => render());
  const offSync = ctx.sync.on?.(() => seedStarters(ctx));
  if (offSync) ui.cleanup(offSync);
  on(el, "click", "[data-select]", async (e, b) => {
    const x = await moveExperiment(ctx, b.dataset.select, "active");
    if (x) { toast("Started — write your hypothesis and what you expect first."); ctx.navigate(`#/experiment/${x.id}`); }
  });
  on(el, "click", "[data-shelve]", async (e, b) => { if (await moveExperiment(ctx, b.dataset.shelve, "shelved")) toast("Set aside — it's kept at the bottom of the tab."); });
  on(el, "click", "[data-unshelve]", async (e, b) => { await moveExperiment(ctx, b.dataset.unshelve, "proposed"); });
  on(el, "click", "[data-act-inline=shelved]", () => { showShelved = !showShelved; render(); });
}
