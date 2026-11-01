// Small DOM toolkit: an escaping `html` template, event delegation, toasts and
// sheets. Views build strings with `html` (interpolations are escaped unless
// wrapped in `raw`), so user text can never become markup by accident.

import { escapeHtml } from "../core/markdown.js";
import { icon } from "./icons.js";

class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

function render(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated listener: on(root, "click", "[data-act]", (e, el) => …). Returns off(). */
export function on(root, type, selector, handler, opts) {
  const fn = (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}

export function debounce(fn, ms) {
  let t;
  let pending = null; // the arguments of a call still waiting, or null
  const d = (...a) => { clearTimeout(t); pending = a; t = setTimeout(() => { pending = null; fn(...a); }, ms); };
  // Run a waiting call now; nothing to do if none is waiting (e.g. it was cancelled).
  d.flush = () => { clearTimeout(t); if (pending) { const a = pending; pending = null; fn(...a); } };
  d.cancel = () => { clearTimeout(t); pending = null; };
  return d;
}

export function autosize(ta, max = 0.55) {
  const fit = () => {
    ta.style.height = "auto";
    const limit = window.innerHeight * max;
    ta.style.height = Math.min(limit, ta.scrollHeight + 2) + "px";
  };
  ta.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return fit;
}

// ---------- toasts ----------

let toastRoot;
export function toast(message, { action, onAction, timeout = 4200, error = false } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toasts";
    toastRoot.setAttribute("role", "status");
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ""}`;
  const close = () => { el.remove(); };
  if (action) el.querySelector("button").addEventListener("click", () => { close(); onAction?.(); });
  toastRoot.appendChild(el);
  if (timeout) setTimeout(close, timeout);
  return close;
}

export function errorToast(err, fallback = "Something went wrong") {
  console.error(err);
  return toast(err?.message || fallback, { error: true, timeout: 7000 });
}

// ---------- sheets (modal dialogs) ----------

/**
 * Open a sheet. content: html string; setup(dialog, close) wires behaviour.
 * Resolves with whatever close(value) is called with (undefined on dismiss).
 */
export function sheet({ title, body, foot, setup, wide = false, dismissable = true }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "sheet";
    if (wide) d.style.maxWidth = "820px";
    d.innerHTML = `
      <div class="sheet-head"><h3>${escapeHtml(title || "")}</h3>${dismissable ? `<button class="btn icon ghost small" data-close aria-label="Close">${icon("close")}</button>` : ""}</div>
      <div class="sheet-body">${render(body)}</div>
      ${foot ? `<div class="sheet-foot">${render(foot)}</div>` : ""}`;
    document.body.appendChild(d);
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      d.close();
      d.remove();
      resolve(value);
    };
    d.addEventListener("cancel", (e) => { if (!dismissable) e.preventDefault(); else { e.preventDefault(); close(undefined); } });
    d.addEventListener("click", (e) => {
      if (e.target === d && dismissable) close(undefined);
      if (e.target.closest("[data-close]")) close(undefined);
    });
    d.showModal();
    setup?.(d, close);
    const first = d.querySelector("[autofocus]");
    if (first) setTimeout(() => first.focus(), 30);
  });
}

export function confirmSheet(message, { title = "Are you sure?", confirm = "Confirm", danger = false, detail = "" } = {}) {
  return sheet({
    title,
    body: html`<p style="margin-top:0">${message}</p>${detail ? html`<p class="muted small">${detail}</p>` : ""}`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${confirm}</button>`,
    setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close(true)),
  }).then((v) => v === true);
}

export function promptSheet({ title, label = "", value = "", placeholder = "", multiline = false, confirm = "Save", hint = "", type = "text" }) {
  const field = multiline
    ? html`<textarea class="textarea" data-in placeholder="${placeholder}" autofocus>${value}</textarea>`
    : html`<input class="input" data-in type="${type}" value="${value}" placeholder="${placeholder}" autofocus autocomplete="off">`;
  return sheet({
    title,
    body: html`<label class="field">${label ? html`<span>${label}</span>` : ""}${field}</label>${hint ? html`<div class="hint">${hint}</div>` : ""}`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${confirm}</button>`,
    setup: (d, close) => {
      const input = d.querySelector("[data-in]");
      const ok = () => close(input.value);
      d.querySelector("[data-ok]").addEventListener("click", ok);
      if (!multiline) input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
    },
  });
}

// ---------- formatting ----------

export function timeOf(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? `${m[1]}:${m[2]}` : "";
}

export function plural(n, one, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export function bytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function agoLabel(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function download(filename, blobOrText, type = "application/octet-stream") {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function pickFiles({ accept = "", multiple = false, capture } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.capture = capture;
    input.style.display = "none";
    input.addEventListener("change", () => { resolve([...input.files]); input.remove(); }, { once: true });
    input.addEventListener("cancel", () => { resolve([]); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
