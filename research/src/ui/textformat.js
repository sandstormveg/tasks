// The Aa button: bold, italic, size and colour for the words you've selected in a text box.
// What you see is what you get: the box shows the words formatted as you write, never the
// codes. Underneath, what's saved stays plain text with light markup (core/textformat.js), so
// the CLI, agents and any editor can still read it.
//
// How: each field marked data-fmtable is kept (hidden) as the place the value lives, so the
// page's own save code works unchanged; a live editor (contenteditable, plain-text only) is
// drawn in its place and kept in step with it both ways. Setting field.value from code
// repaints the editor, unless you're typing in it.
//
// Markup: wrap a label and its field in an element with class "fmt-scope", give the field
// data-fmtable and put fmtButton() in the scope. Then wireFormat(container) once: fields drawn
// later are upgraded too.

import { html, raw, on } from "./dom.js";
import { SIZES, COLOURS, SPAN_RE, isFormatClass, applyFormat } from "../core/textformat.js";
import { renderInline } from "../core/markdown.js";

export const fmtButton = (label = "Text format") => html`<button type="button" class="fmt-btn" data-fmt aria-label="${label}: bold, italic, size, colour" aria-expanded="false" title="Bold, italic, size, colour">A<small>a</small></button>`;

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
  <div class="fmt-hint" data-fmt-hint>Select some words, then choose how they look.</div>
</div>`;

// ── markup ⇄ live editor ─────────────────────────────────────────────────────────────

// The pieces the editor draws formatted: [words]{.red .large}, **bold**, *italic*.
const TOKEN_RE = new RegExp(`${SPAN_RE.source}|\\*\\*([^*\\n]+)\\*\\*|(^|[^\\w*])\\*([^*\\n]+)\\*(?!\\w)`, "g");
const classesOf = (attr) => attr.trim().split(/\s+/).map((c) => c.replace(/^\./, "")).filter(Boolean);

/** DOM nodes for a piece of markup. Anything that isn't one of the pieces stays as text. */
function nodesOf(text) {
  const out = [];
  let i = 0;
  const textNode = (t) => { if (t) out.push(document.createTextNode(t)); };
  for (const m of text.matchAll(TOKEN_RE)) {
    let at = m.index;
    let node;
    if (m[1] !== undefined) {
      if (!classesOf(m[2]).some(isFormatClass)) continue;
      node = document.createElement("span");
      node.dataset.fmt = "s";
      node.dataset.attr = m[0].slice(m[0].lastIndexOf("{") + 1, -1);
      node.className = classesOf(m[2]).filter(isFormatClass).map((c) => `fmt-${c}`).join(" ");
      node.append(...nodesOf(m[1]));
    } else if (m[3] !== undefined) {
      node = document.createElement("strong");
      node.dataset.fmt = "b";
      node.textContent = m[3];
    } else {
      at += m[4].length;
      node = document.createElement("em");
      node.dataset.fmt = "i";
      node.textContent = m[5];
    }
    textNode(text.slice(i, at));
    out.push(node);
    i = m.index + m[0].length;
  }
  textNode(text.slice(i));
  return out;
}

const OPEN = { s: () => "[", b: () => "**", i: () => "*" };
const CLOSE = { s: (n) => `]{${n.dataset.attr}}`, b: () => "**", i: () => "*" };

/**
 * Walk the editor in order and lay it out as markup: the markup text, where each text node
 * starts in it, and where each element opens and its inside ends (for mapping the cursor).
 */
function layout(ed) {
  let text = "";
  const segs = [];
  const at = new Map();
  (function go(node) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { segs.push({ n, m: text.length }); text += n.data; continue; }
      if (n.nodeName === "BR" && n.dataset.tail !== undefined) continue;
      if (n.nodeName === "BR") { at.set(n, { open: text.length, inner: text.length }); text += "\n"; continue; }
      if (n.nodeType !== 1) continue;
      const kind = n.dataset?.fmt;
      if (kind && !n.textContent) continue; // an emptied span leaves no marks behind
      // A line the browser put in a block of its own starts on a new line.
      if (!kind && /^(DIV|P)$/.test(n.nodeName) && text && !text.endsWith("\n")) text += "\n";
      const open = text.length;
      if (kind) text += OPEN[kind](n);
      const inner = text.length;
      go(n);
      at.set(n, { open, inner, end: text.length });
      if (kind) text += CLOSE[kind](n);
    }
  })(ed);
  return { text, segs, at };
}

const serialize = (ed) => layout(ed).text;

/** The markup offset of a DOM point (node, offset) inside the editor. */
function offsetOf(ed, L, node, offset) {
  if (node.nodeType === 3) { const s = L.segs.find((x) => x.n === node); return s ? s.m + offset : L.text.length; }
  const kids = node.childNodes;
  if (offset < kids.length) {
    const k = kids[offset];
    if (k.nodeType === 3) return L.segs.find((x) => x.n === k)?.m ?? L.text.length;
    return L.at.get(k)?.open ?? L.text.length;
  }
  return node === ed ? L.text.length : L.at.get(node)?.end ?? L.text.length;
}

/** The DOM point for a markup offset: inside the text that holds it, or the nearest text after it. */
function pointOf(ed, L, m) {
  let best = null;
  for (const s of L.segs) {
    const len = s.n.data.length;
    if (m >= s.m && m < s.m + len) return [s.n, m - s.m];
    if (m === s.m + len && !best) best = [s.n, len];
    if (s.m >= m) return best || [s.n, 0];
  }
  return best || [ed, ed.childNodes.length];
}

function paint(ed, value) {
  ed.replaceChildren(...nodesOf(String(value ?? "")));
  tail(ed);
}

// A newline at the very end only shows as a new line with something after it.
function tail(ed) {
  for (const b of ed.querySelectorAll("br[data-tail]")) b.remove();
  if (serialize(ed).endsWith("\n")) { const b = document.createElement("br"); b.dataset.tail = ""; ed.append(b); }
}

const hideField = (f) => { f.style.display = "none"; f.tabIndex = -1; f.setAttribute("aria-hidden", "true"); };

/** Draw the live editor for one field and keep the two in step. */
function upgrade(f) {
  if (f._rich) return f._rich;
  const multi = f.tagName === "TEXTAREA";
  const ed = document.createElement("div");
  ed.className = `rich-field ${f.className}`.trim();
  ed.contentEditable = "plaintext-only";
  if (ed.contentEditable !== "plaintext-only") ed.contentEditable = "true"; // older browsers: paste is made plain below
  ed.setAttribute("role", "textbox");
  if (multi) ed.setAttribute("aria-multiline", "true");
  const label = f.getAttribute("aria-label") || f.closest("label")?.querySelector("span")?.firstChild?.textContent?.trim();
  if (label) ed.setAttribute("aria-label", label);
  if (f.placeholder) ed.dataset.placeholder = f.placeholder;
  ed.spellcheck = true;
  if (multi) ed.style.minHeight = `${Math.max(2, Number(f.getAttribute("rows")) || 3) * 1.5 + 1.2}em`;
  ed._field = f;
  f.after(ed);
  hideField(f);
  f._rich = ed;

  const proto = Object.getPrototypeOf(f);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setRaw = (v) => desc.set.call(f, v);
  Object.defineProperty(f, "value", {
    configurable: true,
    get() { return desc.get.call(f); },
    set(v) { setRaw(v); if (document.activeElement !== ed) paint(ed, v); },
  });
  f.focus = (o) => ed.focus(o);
  paint(ed, desc.get.call(f));

  ed.addEventListener("input", () => {
    let v = serialize(ed);
    if (!multi && v.includes("\n")) { v = v.replace(/\n+/g, " "); paint(ed, v); placeCaret(ed, v.length); }
    if (!v) ed.replaceChildren(); // so the placeholder shows again
    else tail(ed);
    setRaw(v);
    f.dispatchEvent(new Event("input", { bubbles: true }));
  });
  ed.addEventListener("blur", () => f.dispatchEvent(new Event("change", { bubbles: true })));
  ed.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    if (multi) insertText(ed, "\n");
  });
  ed.addEventListener("paste", (e) => {
    e.preventDefault();
    let t = e.clipboardData?.getData("text/plain") || "";
    if (!multi) t = t.replace(/\s*\n\s*/g, " ");
    insertText(ed, t);
  });
  return ed;
}

/** Put text in at the cursor as plain text, then tell the field. */
function insertText(ed, t) {
  const sel = getSelection();
  if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return;
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const node = document.createTextNode(t);
  r.insertNode(node);
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  ed.normalize();
  ed.dispatchEvent(new Event("input", { bubbles: true }));
}

function placeCaret(ed, m) {
  const L = layout(ed);
  const [n, o] = pointOf(ed, L, m);
  const r = document.createRange();
  r.setStart(n, o);
  r.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Wire every Aa button and formattable field inside `root`. */
export function wireFormat(root) {
  if (!root || root._fmtWired) return () => {};
  root._fmtWired = true;
  const upgradeAll = () => { for (const f of root.querySelectorAll("[data-fmtable]")) upgrade(f); };
  upgradeAll();
  const mo = new MutationObserver(upgradeAll);
  mo.observe(root, { childList: true, subtree: true });

  // The last selection inside each editor, so a tap on the panel acts on it even if focus moved.
  const lastRange = new WeakMap();
  const onSel = () => {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const ed = sel.anchorNode?.parentElement?.closest?.(".rich-field") || (sel.anchorNode?.classList?.contains("rich-field") ? sel.anchorNode : null);
    if (ed && root.contains(ed)) lastRange.set(ed, sel.getRangeAt(0).cloneRange());
  };
  document.addEventListener("selectionchange", onSel);

  const close = (scope) => {
    scope?.querySelector(".fmt-panel")?.remove();
    scope?.querySelector("[data-fmt]")?.setAttribute("aria-expanded", "false");
  };
  const editorOf = (scope) => { const f = scope?.querySelector("[data-fmtable]"); return f ? upgrade(f) : null; };
  // Keep the editor's selection: buttons don't take focus on press.
  on(root, "pointerdown", ".fmt-panel button, [data-fmt]", (e) => e.preventDefault());
  on(root, "mousedown", ".fmt-panel button, [data-fmt]", (e) => e.preventDefault());
  on(root, "click", "[data-fmt]", (e, b) => {
    e.preventDefault();
    const scope = b.closest(".fmt-scope");
    if (scope.querySelector(".fmt-panel")) return close(scope);
    for (const s of root.querySelectorAll(".fmt-scope")) if (s !== scope) close(s);
    const ed = editorOf(scope);
    (ed?.closest("label") || ed)?.insertAdjacentHTML("afterend", String(panel()));
    b.setAttribute("aria-expanded", "true");
  });
  on(root, "click", ".fmt-panel button", (e, b) => {
    e.preventDefault();
    const scope = b.closest(".fmt-scope");
    const ed = editorOf(scope);
    if (!ed) return;
    const f = ed._field;
    const d = b.dataset;
    const fmt = d.fmtOp === "bold" ? { bold: true } : d.fmtOp === "italic" ? { italic: true } : d.fmtOp === "clear" ? { clear: true }
      : d.fmtSize !== undefined ? { size: d.fmtSize } : { colour: d.fmtColour };
    const sel = getSelection();
    const range = sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0) : lastRange.get(ed);
    const L = layout(ed);
    const a = range ? offsetOf(ed, L, range.startContainer, range.startOffset) : L.text.length;
    const z = range ? offsetOf(ed, L, range.endContainer, range.endOffset) : a;
    const r = applyFormat(L.text, Math.min(a, z), Math.max(a, z), fmt);
    const hint = scope.querySelector("[data-fmt-hint]");
    if (r.empty || r.value === L.text) {
      if (hint) { hint.textContent = "Select some words first, then choose how they look."; hint.classList.remove("nudge"); void hint.offsetWidth; hint.classList.add("nudge"); }
      return;
    }
    paint(ed, r.value);
    ed.focus({ preventScroll: true });
    const L2 = layout(ed);
    const [sn, so] = pointOf(ed, L2, r.start), [en, eo] = pointOf(ed, L2, r.end);
    const rr = document.createRange();
    rr.setStart(sn, so);
    rr.setEnd(en, eo);
    sel.removeAllRanges();
    sel.addRange(rr);
    lastRange.set(ed, rr.cloneRange());
    // Let the page's own save and preview code see the change, as if typed.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f), "value").set.call(f, r.value);
    f.dispatchEvent(new Event("input", { bubbles: true }));
    f.dispatchEvent(new Event("change", { bubbles: true }));
  });
  on(root, "keydown", ".fmt-scope", (e, scope) => { if (e.key === "Escape" && scope.querySelector(".fmt-panel")) { e.stopPropagation(); close(scope); } });
  return () => { mo.disconnect(); document.removeEventListener("selectionchange", onSel); };
}

/** Formatted inline HTML for a short field shown read-only (cards, pins). */
export const formatted = (text) => raw(renderInline(text));
