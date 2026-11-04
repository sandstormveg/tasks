// One source: where you're up to, ⭐, tags, why you saved it, what you
// expected before reading, what surprised you after, notes and exact quotes.
// Everything saves as you type. On a computer the notes sit beside the rest.

import { html, raw, on, debounce, autosize, sheet, toast } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { STATUSES, KINDS, statusPatch, formatAuthors, normalizeUrl, siteOf, findDoi } from "../../core/sources.js";
import { tagInput, deleteSource } from "../ui.js";
import { imageOf } from "../images.js";

const metaLine = (s) => [s.site, formatAuthors(s.authors), s.year, KINDS[s.kind]].filter(Boolean).join(" · ");
// What a field shows for a stored value (the inverse of valueOf below).
const shown = (k, s) => (k === "authors" ? (s.authors || []).join(", ") : s[k] == null ? "" : String(s[k]));

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  let s = ctx.store.get(id);
  if (!s || s.deleted) {
    ui.setTitle("Not found", { back: "history" });
    el.innerHTML = String(html`<div class="empty"><h3>This source isn't here</h3><p><a href="#/inbox">Back to the Inbox</a></p></div>`);
    return;
  }
  ui.setTitle(STATUSES[s.status], { back: "history" });
  ui.wide(true);
  ui.setActions(html`${s.url ? html`<a class="btn small" href="${s.url}" target="_blank" rel="noopener noreferrer">${raw(icon("external"))}Open</a>` : ""}`);

  const tagger = tagInput(ctx, s.tags || []);
  const field = (k, label, ph, { rows = 2, hint = "" } = {}) => html`<label class="field"><span>${label}${hint ? html` <span class="faint">${hint}</span>` : ""}</span>
    <textarea class="textarea" data-f="${k}" rows="${rows}" placeholder="${ph}">${s[k] || ""}</textarea></label>`;

  const pic = imageOf(s);
  el.innerHTML = String(html`<div class="src-page">
    ${pic ? html`<button type="button" class="src-picture" data-act="zoom" aria-label="Show the picture full size"><img data-media="${pic.path}" data-fallback="${pic.thumb || ""}" alt="${s.title || "Picture"}"></button>` : ""}
    <div class="src-side">
      <textarea class="src-title-in" data-f="title" rows="1" aria-label="Title" placeholder="Title">${s.title || ""}</textarea>
      <div class="src-meta">${metaLine(s)}</div>
      <div class="status-seg" role="group" aria-label="Status">${Object.entries(STATUSES).map(([k, label]) => html`<button type="button" data-status="${k}" class="${s.status === k ? "on" : ""}">${label}</button>`)}</div>
      <button type="button" class="btn small fav-btn ${s.favourite ? "on" : ""}" data-act="fav" aria-pressed="${String(!!s.favourite)}">${raw(icon("star"))}${s.favourite ? "Favourite" : "Mark as favourite"}</button>
      <div class="field"><span class="label">Tags</span>${tagger.markup}</div>
      <label class="field"><span>Why I saved it</span><input class="input" data-f="why" value="${s.why || ""}" placeholder="One line for future you" autocomplete="off"></label>
      ${field("expect", "Before reading", "What do you expect it to argue?", { hint: "— a guess helps you notice what changes" })}
      ${field("surprised", "After reading", "What surprised you?", { hint: "— where your thinking moved" })}
      <div class="section-title">Quotes</div>
      <div data-quotes></div>
      <button class="btn small" data-act="add-quote">${raw(icon("quote"))}Add a quote</button>
      <details class="layer src-details"><summary>${raw(icon("info"))}Details</summary>
        <label class="field"><span>Link</span><input class="input" data-f="url" value="${s.url || ""}" autocomplete="off" autocapitalize="off" inputmode="url"></label>
        <label class="field"><span>DOI</span><input class="input" data-f="doi" value="${s.doi || ""}" autocomplete="off" autocapitalize="off"></label>
        <label class="field"><span>Authors <span class="faint">(comma between names)</span></span><input class="input" data-f="authors" value="${(s.authors || []).join(", ")}" autocomplete="off"></label>
        <div class="row wrap"><label class="field grow"><span>Year</span><input class="input" data-f="year" value="${s.year || ""}" inputmode="numeric" autocomplete="off"></label>
          <label class="field grow"><span>Kind</span><select class="select" data-f="kind">${Object.entries(KINDS).map(([k, label]) => html`<option value="${k}" ${s.kind === k ? "selected" : ""}>${label}</option>`)}</select></label></div>
        <p class="small faint">Saved ${String(s.added || "").slice(0, 10)}${s.started ? ` · started ${String(s.started).slice(0, 10)}` : ""}${s.finished ? ` · finished ${String(s.finished).slice(0, 10)}` : ""}${s.captured?.via ? ` · via ${s.captured.via}` : ""}</p>
        <button class="btn small danger" data-act="delete">${raw(icon("trash"))}Delete</button>
      </details>
    </div>
    <div class="src-notes">
      <label class="field"><span>Notes</span><textarea class="textarea notes" data-f="body" placeholder="Your notes — Markdown works">${s.body || ""}</textarea></label>
    </div>
  </div>`);
  ctx.media.hydrate(el);
  el.querySelector("[data-act=zoom]")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("full"));

  for (const t of el.querySelectorAll("textarea")) autosize(t);
  const save = async (patch) => {
    s = { ...ctx.store.get(id), ...patch };
    await ctx.store.put(s);
  };
  // Typing saves after a pause; leaving the page saves anything still waiting.
  let pending = {};
  const flush = debounce(async () => { const p = pending; pending = {}; if (Object.keys(p).length) await save(p); }, 500);
  ui.cleanup(() => flush.flush());
  const valueOf = (k, v) => {
    if (k === "authors") return v.split(",").map((x) => x.trim()).filter(Boolean);
    if (k === "year") return /^\d{3,4}$/.test(v.trim()) ? Number(v.trim()) : undefined;
    if (k === "url") return normalizeUrl(v) || undefined;
    if (k === "doi") return findDoi(v) || undefined;
    return v.trim() ? v : undefined;
  };
  on(el, "input", "[data-f]", (e, f) => {
    const k = f.dataset.f;
    pending[k] = valueOf(k, f.value);
    if (k === "url" && pending.url) pending.site = siteOf(pending.url);
    flush();
  });
  on(el, "change", "select[data-f]", (e, f) => { pending[f.dataset.f] = f.value; flush(); });
  tagger.wire(el, async (tags) => { await save({ tags: [...tags] }); });

  function renderQuotes() {
    const qs = s.quotes || [];
    el.querySelector("[data-quotes]").innerHTML = String(qs.length
      ? html`${qs.map((q, i) => html`<blockquote class="src-quote"><p>${q.text}</p><footer>${q.where ? html`<span>${q.where}</span>` : ""}<button class="btn icon small ghost" data-act="rm-quote" data-i="${i}" aria-label="Remove quote">${raw(icon("trash"))}</button></footer></blockquote>`)}`
      : html`<p class="small faint">Exact words worth keeping, with where they are — so you can cite them later.</p>`);
    ui.setTitle(STATUSES[s.status], { back: "history" });
  }
  renderQuotes();

  // Details can arrive while you're here — the paper lookup after a share, or a sync from
  // another device. Show what changed, but never over a field you're in or haven't saved.
  let last = s;
  ui.onStore((ch) => {
    if (!ch.ids?.includes(id)) return;
    const now = ctx.store.get(id);
    if (!now || now.deleted) return;
    s = now;
    el.querySelector(".src-meta").textContent = metaLine(now);
    for (const f of el.querySelectorAll("[data-f]")) {
      const k = f.dataset.f;
      if (f === document.activeElement || k in pending || shown(k, now) === shown(k, last)) continue;
      f.value = shown(k, now);
      if (f.tagName === "TEXTAREA") autosize(f);
    }
    for (const x of el.querySelectorAll("[data-status]")) x.classList.toggle("on", x.dataset.status === now.status);
    last = now;
  });

  on(el, "click", "[data-status]", async (e, b) => {
    await save(statusPatch(ctx.store.get(id), b.dataset.status, ctx.now()));
    for (const x of el.querySelectorAll("[data-status]")) x.classList.toggle("on", x === b);
    ui.setTitle(STATUSES[s.status], { back: "history" });
  });
  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    if (act === "fav") {
      await save({ favourite: !s.favourite });
      b.classList.toggle("on", s.favourite);
      b.setAttribute("aria-pressed", String(s.favourite));
      b.lastChild.textContent = s.favourite ? "Favourite" : "Mark as favourite";
    }
    if (act === "add-quote") {
      const q = await sheet({
        title: "Add a quote",
        body: html`<label class="field"><span>The exact words</span><textarea class="textarea" data-q rows="4" autofocus placeholder="Paste or type it exactly"></textarea></label>
          <label class="field"><span>Where <span class="faint">(page, section or timestamp)</span></span><input class="input" data-w placeholder="p. 12 · §3 · 14:05" autocomplete="off"></label>`,
        foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add</button>`,
        setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ text: d.querySelector("[data-q]").value.trim(), where: d.querySelector("[data-w]").value.trim() })),
      });
      if (!q?.text) return;
      await save({ quotes: [...(s.quotes || []), q.where ? q : { text: q.text }] });
      renderQuotes();
    }
    if (act === "rm-quote") {
      const qs = [...(s.quotes || [])];
      const [gone] = qs.splice(Number(b.dataset.i), 1);
      await save({ quotes: qs.length ? qs : undefined });
      renderQuotes();
      toast("Quote removed", { action: "Undo", onAction: async () => { await save({ quotes: [...(s.quotes || []), gone] }); renderQuotes(); } });
    }
    if (act === "delete") {
      flush.cancel();
      await deleteSource(ctx, id);
      ctx.navigate("#/inbox", { replace: true });
    }
  });
}
