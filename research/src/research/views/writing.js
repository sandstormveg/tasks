// Your writing: the pieces you're working on — a grant proposal, an essay, a
// post — each with its own corkboard. In progress first, then ideas, then done.

import { html, raw, promptSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { PIECE_STATUSES, makePiece, wordCount } from "../../core/writing.js";
import { boardParts, boardSummary } from "../../core/boards.js";

const ORDER = ["drafting", "review", "idea", "done"];

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Writing");
  ui.setActions(html`<button class="btn small primary" data-act="new">${raw(icon("plus"))}New piece</button>`);
  ui.onAction(async (e, b) => {
    if (b.dataset.act !== "new") return;
    const title = await promptSheet({ title: "New piece", label: "Working title", placeholder: "e.g. Grant proposal: fanaticism and AI", confirm: "Start it" });
    if (!title?.trim()) return;
    const piece = makePiece({ title }, { now: ctx.now() });
    await ctx.store.put(piece);
    ctx.navigate(`#/piece/${piece.id}`);
  });

  function render() {
    const records = ctx.records();
    const pieces = ctx.pieces().sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || String(b.updated).localeCompare(String(a.updated)));
    el.innerHTML = String(pieces.length
      ? html`${pieces.map((p) => {
        const sum = p.board ? boardSummary(boardParts(records, p.board)) : null;
        return html`<a class="src-card piece-card" href="#/piece/${p.id}"><div class="src-main">
          <div class="src-title">${p.title}</div>
          <div class="src-meta">${[PIECE_STATUSES[p.status], `${wordCount(p.body)} words`, p.sources?.length ? `${p.sources.length} sources` : "", sum ? `board: ${sum.pins} pins${sum.red ? `, ${sum.red} red` : ""}` : "", p.task?.title ? `task: ${p.task.title}` : ""].filter(Boolean).join(" · ")}</div>
        </div></a>`;
      })}`
      : html`<div class="empty">${raw(icon("edit"))}<h3>No writing yet</h3><p>Start a piece for anything you're working towards — it gets its own corkboard for the thinking that goes into it.</p></div>`);
  }
  render();
  ui.onStore(() => render());
}
