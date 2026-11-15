// A long-form writing box, shared by the journal (Today, editing an entry) and Research (notes,
// drafts): an Edit / Preview switch for Markdown, the CodeMirror editor (codeeditor.js) in place
// of the textarea, and focus mode (zen.js), where the box takes the whole screen.
//
// The textarea stays the place the value lives, so each page's own save code, word count and
// focus calls keep working; the editor only ever holds what the user typed.
//
// Markup: an element with classes "md-box fmt-scope" holding mdHead(label), a
// textarea[data-md][data-fmtable][data-code], and mdPreview. Styles: styles/writing.css.

import { html, on } from "./dom.js";
import { renderMarkdown } from "../core/markdown.js";
import { fmtButton } from "./textformat.js";
import { upgradeCode } from "./codeeditor.js";
import { wireZen } from "./zen.js";

/** The head row: a label, the Aa button, the switch and the focus-mode button. `preview: false` leaves the switch out (the box is always the editor); `fmt: false` the Aa button (pages without wireFormat). */
export const mdHead = (label, { extra = "", preview = true, fmt = true } = {}) => html`<div class="notes-head"><span class="label">${label}</span>${extra ? html`<span class="small faint notes-extra">${extra}</span>` : ""}${fmt ? fmtButton(label) : ""}
  ${preview ? html`<div class="status-seg small" role="group" aria-label="${label}: edit or preview"><button type="button" data-md-mode="edit">Edit</button><button type="button" data-md-mode="preview">Preview</button></div>` : html`<span class="notes-gap"></span>`}
  <button type="button" class="btn icon small ghost zen-btn" data-zen></button></div>`;
export const mdPreview = html`<div class="prose notes-preview" data-md-preview title="Tap to edit"></div>`;

/**
 * The Edit / Preview switch. Starts on the preview when there's something written (or on
 * `start`). `render(text)` draws the preview (default: Markdown without #tags or @concepts).
 */
export function mdSwitch(box, ctx, { empty = "Nothing written yet.", autosize: grow, render, start, stayInEdit = false } = {}) {
  const ta = box.querySelector("textarea[data-md]");
  const draw = render || ((t) => renderMarkdown(t, { tags: false, concepts: false }));
  const set = (m) => {
    box.dataset.mode = m;
    for (const b of box.querySelectorAll("[data-md-mode]")) { b.classList.toggle("on", b.dataset.mdMode === m); b.setAttribute("aria-pressed", String(b.dataset.mdMode === m)); }
    if (m === "preview") {
      box.querySelector("[data-md-preview]").innerHTML = ta.value.trim() ? draw(ta.value) : String(html`<p class="faint">${empty}</p>`);
      ctx.media?.hydrate?.(box);
    } else grow?.(ta);
  };
  const edit = () => { set("edit"); ta.focus(); }; // ta.focus reaches the live editor once it's drawn
  // Nothing written yet: open straight onto the editor so its placeholder shows.
  set(start || (ta.value.trim() ? "preview" : "edit"));
  on(box, "click", "[data-md-mode]", (e, b) => { if (b.dataset.mdMode === "edit") edit(); else set("preview"); });
  // Tap the formatted text to write (but let links in it work).
  on(box, "click", "[data-md-preview]", (e) => { if (!e.target.closest("a")) edit(); });
  // Leaving the box shows the preview again (not when focus only moved to its own Aa panel).
  if (!stayInEdit) box.addEventListener("focusout", () => setTimeout(() => {
    if (box.contains(document.activeElement) || box.querySelector(".fmt-panel") || box.classList.contains("zen")) return;
    if (box.dataset.mode === "edit" && ta.value.trim()) set("preview");
  }, 0));
  return { refresh: () => { if (box.dataset.mode === "preview") set("preview"); }, set };
}

/**
 * mdSwitch, plus the CodeMirror editor (for a textarea with data-code) and focus mode.
 * `autoZen()` true: starting to write goes straight to focus mode (the Writing setting), until
 * you leave it on this page. `links()` feeds the [[ suggestions; `keys` adds key bindings
 * (CodeMirror's { key, run }); `repaint: "always"` lets code set the value while you're in the
 * editor (the journal clears the box after Save). Returns { refresh, set, zen, ready, dispose } (ready: the editor, or null).
 */
export function writingBox(box, ctx, ui, { empty, autosize: grow, autoZen, links, keys, render, start, stayInEdit, repaint } = {}) {
  const md = box.querySelector("[data-md-preview]") ? mdSwitch(box, ctx, { empty, autosize: grow, render, start, stayInEdit }) : { refresh() {}, set() {} };
  const ta = box.querySelector("textarea[data-md], textarea[data-code]");
  let leftZen = false;
  const zen = wireZen(box, { onChange: (on) => { if (!on) leftZen = true; } });
  ui.cleanup(() => zen.destroy());
  const ready = ta?.dataset.code !== undefined ? upgradeCode(ta, { links, keys, repaint }) : Promise.resolve(null);
  ready.then((view) => {
    if (!view) return;
    ui.cleanup(() => view.destroy()); // its listeners on the document go with the page
    // Starting to write, with "Open writing in focus mode" on.
    view.contentDOM.addEventListener("focus", () => { if (autoZen?.() && !leftZen && !zen.active) zen.enter(); });
    // Shown again after Preview: let it measure itself.
    new MutationObserver(() => { if (box.dataset.mode === "edit") view.requestMeasure(); }).observe(box, { attributes: true, attributeFilter: ["data-mode"] });
  });
  // A page that redraws the box (the entry view, between view and edit) lets the old one go now.
  const dispose = () => { zen.destroy(); ready.then((v) => v?.destroy()); };
  return { ...md, zen, ready, dispose };
}
