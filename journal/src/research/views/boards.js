// All your corkboards: how much is pinned, how much red string is still waiting
// to be synthesised, and which piece of writing a board belongs to.
// View options (per device): a drawn preview of each board's pins and strings, and
// descriptions on or off. Each board also has a MindPrimer switch: on means the board
// may appear in the game (its scrying glass opens #/boards?mindprimer=1, which lists only those).

import { html, raw, on, promptSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { makeBoard, boardParts, boardSummary, boardPreview } from "../../core/boards.js";

const VIEW_KEY = "research.boards-view";
const loadView = () => { try { return { preview: true, desc: true, ...JSON.parse(localStorage.getItem(VIEW_KEY) || "{}") }; } catch { return { preview: true, desc: true }; } };
const saveView = (v) => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* per-device convenience only */ } };

function previewSvg(p) {
  if (!p) return "";
  return `<svg class="bt-preview" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${
    p.frames.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" class="bt-frame"/>`).join("")}${
    p.strings.map((s) => `<line x1="${s.a.x}" y1="${s.a.y}" x2="${s.b.x}" y2="${s.b.y}" class="${s.red ? "bt-red-line" : "bt-thread"}"/>`).join("")}${
    p.notes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.5" class="bt-note"/>`).join("")}</svg>`;
}

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

  let view = loadView();
  const onlyPrimer = route?.query?.mindprimer === "1";

  function render() {
    const records = ctx.records();
    const pieces = Object.fromEntries(ctx.pieces().map((p) => [p.id, p]));
    const boards = ctx.boards().filter((b) => !onlyPrimer || b.mindprimer).map((b) => { const parts = boardParts(records, b.id); return { b, parts, sum: boardSummary(parts) }; })
      .sort((x, y) => String(y.b.updated || "").localeCompare(String(x.b.updated || "")));
    el.innerHTML = String(boards.length
      ? html`${onlyPrimer ? "" : html`<p class="small muted list-hint">Red string is a connection you've noticed but not worked out yet. Synthesise it and it turns to thread.</p>
        <div class="row wrap board-view-opts">
          <button class="chip ${view.preview ? "on" : ""}" data-view="preview">Preview</button>
          <button class="chip ${view.desc ? "on" : ""}" data-view="desc">Descriptions</button>
          <a class="chip" href="#/boards?mindprimer=1">◈ MindPrimer only</a>
        </div>`}
        <div class="board-grid ${view.preview ? "" : "no-preview"}">${boards.map(({ b, parts, sum }) => html`<a class="board-tile" href="#/board/${b.id}">
          <div class="board-tile-cork">${view.preview ? raw(previewSvg(boardPreview(parts))) : ""}<span class="bt-pins">${sum.pins}</span>${sum.red ? html`<span class="bt-red">〰 ${sum.red}</span>` : ""}${sum.synthesised ? html`<span class="bt-syn">━ ${sum.synthesised}</span>` : ""}
            ${onlyPrimer ? "" : html`<button class="bt-primer ${b.mindprimer ? "on" : ""}" data-primer="${b.id}" title="${b.mindprimer ? "Shown in MindPrimer. Tap to hide" : "Not in MindPrimer. Tap to show it in the game"}" aria-pressed="${b.mindprimer ? "true" : "false"}">◈ ${b.mindprimer ? "In MindPrimer" : "MindPrimer"}</button>`}</div>
          <div class="board-tile-title">${b.title}</div>
          ${view.desc ? html`<div class="src-meta">${[b.piece && pieces[b.piece] ? `for “${pieces[b.piece].title}”` : "", b.about, b.author && b.author !== "self" ? "kept by Claude" : ""].filter(Boolean).join(" · ")}</div>` : ""}
        </a>`)}</div>`
      : onlyPrimer ? html`<div class="empty"><h3>No boards in MindPrimer yet</h3><p>Switch on ◈ MindPrimer on a board in <a href="#/boards">Boards</a> to show it here.</p></div>`
      : html`<div class="empty">${raw(icon("map"))}<h3>No boards yet</h3><p>A board is a corkboard for one question or project: pin notes, sources and Infodex cards, and tie red string between what connects.</p><p><button class="btn primary" data-act-inline="new">${raw(icon("plus"))}New board</button></p></div>`);
  }
  render();
  ui.onStore(() => render());
  on(el, "click", "[data-view]", (e, b) => { e.preventDefault(); view = { ...view, [b.dataset.view]: !view[b.dataset.view] }; saveView(view); render(); });
  on(el, "click", "[data-primer]", async (e, b) => {
    e.preventDefault(); e.stopPropagation();
    const board = ctx.boards().find((x) => x.id === b.dataset.primer);
    if (!board) return;
    await ctx.store.put({ ...board, mindprimer: board.mindprimer ? undefined : true, updated: ctx.now() });
  });
  on(el, "click", "[data-act-inline=new]", () => document.querySelector('#topbar-actions [data-act="new"]')?.click());
}
