// The Aa button: bold, italic, size and colour for the words you've selected in a
// text box. It writes light markup into the text (core/textformat.js), so what's
// saved stays plain text. Short fields that have no Preview of their own show a
// one-line formatted preview under them once they contain any formatting.
//
// Markup: wrap a label (or anything) and its field in an element with class
// "fmt-scope"; give the field data-fmtable; put fmtButton() and, for short fields,
// fmtPreview in the scope. Then wireFormat(container) once — it's delegated, so
// fields drawn later work too.

import { html, raw, on } from "./dom.js";
import { SIZES, COLOURS, applyFormat, hasFormat } from "../core/textformat.js";
import { renderInline } from "../core/markdown.js";

export const fmtButton = (label = "Text format") => html`<button type="button" class="fmt-btn" data-fmt aria-label="${label}: bold, italic, size, colour" aria-expanded="false" title="Bold, italic, size, colour">A<small>a</small></button>`;
export const fmtPreview = html`<div class="fmt-preview" data-fmt-preview hidden></div>`;

const panel = () => html`<div class="fmt-panel" role="toolbar" aria-label="Format the selected words">
  <div class="fmt-row">
    <button type="button" data-fmt-op="bold" aria-label="Bold"><b>B</b></button>
    <button type="button" data-fmt-op="italic" aria-label="Italic"><i>I</i></button>
    <span class="fmt-sep"></span>
    ${SIZES.map(([k, l]) => html`<button type="button" data-fmt-size="${k}" aria-label="Size ${l}" class="fmt-size-${k || "m"}">${l}</button>`)}
  </div>
  <div class="fmt-row">
    ${COLOURS.map(([k, l]) => html`<button type="button" class="fmt-dot fmt-${k}" data-fmt-colour="${k}" aria-label="${l}" title="${l}"><span></span></button>`)}
    <button type="button" class="fmt-dot" data-fmt-colour="" aria-label="No colour" title="No colour"><span class="none"></span></button>
    <span class="fmt-sep"></span>
    <button type="button" data-fmt-op="clear" aria-label="Clear formatting">Clear</button>
  </div>
  <div class="fmt-hint">Select some words first, or pick a style and type over “text”.</div>
</div>`;

const fieldOf = (scope) => scope?.querySelector("[data-fmtable]");

/** Redraw the formatted preview line under a short field. */
export function refreshPreview(field) {
  const box = field?.closest(".fmt-scope")?.querySelector("[data-fmt-preview]");
  if (!box) return;
  const show = hasFormat(field.value);
  box.hidden = !show;
  box.innerHTML = show ? renderInline(field.value) : "";
}

/** Wire every Aa button inside `root` (delegated). Returns a function that refreshes all previews. */
export function wireFormat(root) {
  if (!root || root._fmtWired) return () => {};
  root._fmtWired = true;
  const close = (scope) => {
    scope?.querySelector(".fmt-panel")?.remove();
    scope?.querySelector("[data-fmt]")?.setAttribute("aria-expanded", "false");
  };
  // Keep the text box's selection: buttons in the panel don't take focus on press.
  on(root, "pointerdown", ".fmt-panel button, [data-fmt]", (e) => e.preventDefault());
  on(root, "mousedown", ".fmt-panel button, [data-fmt]", (e) => e.preventDefault());
  on(root, "click", "[data-fmt]", (e, b) => {
    e.preventDefault();
    const scope = b.closest(".fmt-scope");
    if (scope.querySelector(".fmt-panel")) return close(scope);
    for (const s of root.querySelectorAll(".fmt-scope")) if (s !== scope) close(s);
    const f = fieldOf(scope);
    (f?.closest("label") || f)?.insertAdjacentHTML("afterend", String(panel()));
    b.setAttribute("aria-expanded", "true");
  });
  on(root, "click", ".fmt-panel button", (e, b) => {
    e.preventDefault();
    const scope = b.closest(".fmt-scope");
    const f = fieldOf(scope);
    if (!f) return;
    const d = b.dataset;
    const fmt = d.fmtOp === "bold" ? { bold: true } : d.fmtOp === "italic" ? { italic: true } : d.fmtOp === "clear" ? { clear: true }
      : d.fmtSize !== undefined ? { size: d.fmtSize } : { colour: d.fmtColour };
    const r = applyFormat(f.value, f.selectionStart, f.selectionEnd, fmt);
    if (r.value === f.value && r.start === f.selectionStart && r.end === f.selectionEnd) return;
    f.value = r.value;
    f.focus({ preventScroll: true });
    f.setSelectionRange(r.start, r.end);
    // Let the page's own save and preview code see the change, as if typed.
    f.dispatchEvent(new Event("input", { bubbles: true }));
    f.dispatchEvent(new Event("change", { bubbles: true }));
  });
  on(root, "input", "[data-fmtable]", (e, f) => refreshPreview(f));
  on(root, "keydown", ".fmt-scope", (e, scope) => { if (e.key === "Escape" && scope.querySelector(".fmt-panel")) { e.stopPropagation(); close(scope); } });
  const refreshAll = () => { for (const f of root.querySelectorAll("[data-fmtable]")) refreshPreview(f); };
  refreshAll();
  return refreshAll;
}

/** Formatted inline HTML for a short field shown read-only (cards, pins). */
export const formatted = (text) => raw(renderInline(text));
