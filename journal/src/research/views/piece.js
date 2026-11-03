// One piece of writing: your draft (autosaved, only ever your words), its
// status, the sources it draws on, and its corkboard — opened from here, and
// made the first time you open it.

import { html, raw, on, debounce, autosize, sheet, toast, confirmSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { PIECE_STATUSES, wordCount } from "../../core/writing.js";
import { makeBoard, boardParts, boardSummary } from "../../core/boards.js";
import { searchSources } from "../../core/sources.js";

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  let p = ctx.store.get(id);
  if (!p) {
    ui.setTitle("Not found", { back: "#/writing" });
    el.innerHTML = String(html`<div class="empty"><h3>This piece isn't here</h3><p><a href="#/writing">All writing</a></p></div>`);
    return;
  }
  ui.setTitle(PIECE_STATUSES[p.status] || "Writing", { back: "#/writing" });
  ui.wide(true);
  ui.setActions(html`<button class="btn small primary" data-act="board">${raw(icon("map"))}Corkboard</button>`);

  const render = () => {
    const sum = p.board ? boardSummary(boardParts(ctx.records(), p.board)) : null;
    const sources = (p.sources || []).map((sid) => ctx.store.get(sid)).filter(Boolean);
    el.innerHTML = String(html`<div class="src-page piece-page">
      <div class="src-side">
        <textarea class="src-title-in" data-f="title" rows="1" aria-label="Title">${p.title}</textarea>
        <div class="status-seg" role="group" aria-label="Status">${Object.entries(PIECE_STATUSES).map(([k, label]) => html`<button type="button" data-status="${k}" class="${p.status === k ? "on" : ""}">${label}</button>`)}</div>
        ${p.task?.title ? html`<p class="small muted">From your task <b>${p.task.title}</b></p>` : ""}
        <a class="board-link" href="#/board/${p.board || ""}" data-act-inline="board">
          ${raw(icon("map"))}<span><b>Its corkboard</b><br><span class="small muted">${sum ? `${sum.pins} pins · ${sum.red} red string${sum.red === 1 ? "" : "s"} · ${sum.synthesised} synthesised` : "Make one: pin ideas, sources and cards, and connect them before you write them up."}</span></span></a>
        <div class="section-title">Sources</div>
        ${sources.length ? html`${sources.map((s) => html`<div class="piece-source"><a href="#/source/${s.id}">${s.title || s.url}</a><button class="btn icon small ghost" data-rm="${s.id}" aria-label="Remove">${raw(icon("close"))}</button></div>`)}` : html`<p class="small faint">Nothing linked yet.</p>`}
        <button class="btn small" data-act-inline="add-source">${raw(icon("plus"))}Link a source</button>
        <p class="small faint" style="margin-top:18px">${wordCount(p.body)} words · started ${String(p.created || "").slice(0, 10)}</p>
        <button class="btn small danger ghost" data-act-inline="delete">${raw(icon("trash"))}Delete piece</button>
      </div>
      <div class="src-notes"><label class="field"><span>Draft</span><textarea class="textarea notes draft" data-f="body" placeholder="Write here — Markdown works. Only you write here; Claude's notes go on the corkboard.">${p.body || ""}</textarea></label></div>
    </div>`);
    for (const t of el.querySelectorAll("textarea")) autosize(t, 0.85);
  };
  render();

  const save = async (patch) => { p = { ...ctx.store.get(id), ...patch, updated: ctx.now() }; await ctx.store.put(p); };
  let pending = {};
  const flush = debounce(async () => { const q = pending; pending = {}; if (Object.keys(q).length) await save(q); }, 600);
  ui.cleanup(() => flush.flush());
  on(el, "input", "[data-f]", (e, f) => { pending[f.dataset.f] = f.value; flush(); });
  on(el, "click", "[data-status]", async (e, b) => { await save({ status: b.dataset.status }); render(); ui.setTitle(PIECE_STATUSES[p.status], { back: "#/writing" }); });

  async function openBoard() {
    flush.flush();
    let boardId = p.board;
    if (!boardId || !ctx.store.get(boardId)) {
      const b = makeBoard({ title: p.title, piece: p.id, about: "The thinking behind this piece" }, { now: ctx.now() });
      await ctx.store.put(b);
      await save({ board: b.id });
      boardId = b.id;
    }
    ctx.navigate(`#/board/${boardId}`);
  }
  ui.onAction((e, b) => { if (b.dataset.act === "board") openBoard(); });
  on(el, "click", "[data-act-inline]", async (e, b) => {
    const act = b.dataset.actInline;
    if (act === "board") { e.preventDefault(); openBoard(); }
    if (act === "add-source") {
      let picked = null;
      await sheet({
        title: "Link a source",
        body: html`<input class="input" data-q placeholder="Search your library" autocomplete="off" autofocus><div class="pick-list" data-list></div>`,
        foot: html`<button class="btn" data-close>Cancel</button>`,
        setup: (d, close) => {
          const list = d.querySelector("[data-list]");
          const draw = () => {
            const q = d.querySelector("[data-q]").value.trim();
            const found = (q ? searchSources(ctx.sources(), q) : ctx.sources()).filter((s) => !(p.sources || []).includes(s.id)).slice(0, 30);
            list.innerHTML = String(html`${found.map((s) => html`<button type="button" class="pick" data-id="${s.id}"><b>${s.title || s.url}</b><span>${s.site || ""}</span></button>`)}`);
          };
          d.querySelector("[data-q]").addEventListener("input", draw);
          on(list, "click", "[data-id]", (ev, x) => { picked = x.dataset.id; close(true); });
          draw();
        },
      });
      if (picked) { await save({ sources: [...new Set([...(p.sources || []), picked])] }); render(); }
    }
    if (act === "delete") {
      if (!(await confirmSheet(`Delete “${p.title}”? Its draft goes too. Its corkboard stays under Boards.`, { confirm: "Delete", danger: true }))) return;
      const copy = structuredClone({ ...p, _sync: undefined, _rev: undefined });
      await ctx.store.remove(id, { reason: "deleted" });
      ctx.navigate("#/writing", { replace: true });
      toast("Deleted", { action: "Undo", timeout: 8000, onAction: () => ctx.store.put(copy) });
    }
  });
  on(el, "click", "[data-rm]", async (e, b) => { await save({ sources: (p.sources || []).filter((x) => x !== b.dataset.rm) }); render(); });
}
