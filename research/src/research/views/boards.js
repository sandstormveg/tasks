// All your corkboards: how much is pinned, how much red string is still waiting
// to be synthesised, and which piece of writing a board belongs to.

import { html, raw, on, promptSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { makeBoard, boardParts, boardSummary } from "../../core/boards.js";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Boards");
  ui.setActions(html`<button class="btn small primary" data-act="new">${raw(icon("plus"))}New board</button>`);
  ui.onAction(async (e, b) => {
    if (b.dataset.act !== "new") return;
    const title = await promptSheet({ title: "New board", label: "What's it about?", placeholder: "e.g. Fanaticism and AI", confirm: "Make board" });
    if (!title?.trim()) return;
    const board = makeBoard({ title }, { now: ctx.now() });
    await ctx.store.put(board);
    ctx.navigate(`#/board/${board.id}`);
  });

  function render() {
    const records = ctx.records();
    const pieces = Object.fromEntries(ctx.pieces().map((p) => [p.id, p]));
    const boards = ctx.boards().map((b) => ({ b, sum: boardSummary(boardParts(records, b.id)) }))
      .sort((x, y) => String(y.b.updated || "").localeCompare(String(x.b.updated || "")));
    el.innerHTML = String(boards.length
      ? html`<p class="small muted list-hint">Red string is a connection you've noticed but not worked out yet. Synthesise it and it turns to thread.</p>
        <div class="board-grid">${boards.map(({ b, sum }) => html`<a class="board-tile" href="#/board/${b.id}">
          <div class="board-tile-cork"><span class="bt-pins">${sum.pins}</span>${sum.red ? html`<span class="bt-red">〰 ${sum.red}</span>` : ""}${sum.synthesised ? html`<span class="bt-syn">━ ${sum.synthesised}</span>` : ""}</div>
          <div class="board-tile-title">${b.title}</div>
          <div class="src-meta">${[b.piece && pieces[b.piece] ? `for “${pieces[b.piece].title}”` : "", b.about, b.author && b.author !== "self" ? "kept by Claude" : ""].filter(Boolean).join(" · ")}</div>
        </a>`)}</div>`
      : html`<div class="empty">${raw(icon("map"))}<h3>No boards yet</h3><p>A board is a corkboard for one question or project: pin notes, sources and Infodex cards, and tie red string between what connects.</p><p><button class="btn primary" data-act-inline="new">${raw(icon("plus"))}New board</button></p></div>`);
  }
  render();
  ui.onStore(() => render());
  on(el, "click", "[data-act-inline=new]", () => document.querySelector('#topbar-actions [data-act="new"]')?.click());
}
