// One source: where you're up to, ⭐, tags, why you saved it, what you
// expected before reading, what surprised you after, notes and exact quotes.
// Everything saves as you type. On a computer the notes sit beside the rest.
//
// Notes are Markdown, with an Edit / Preview switch (the Journal's renderer). Assist lets an
// agent work with this one source, like Assist on a task: you write the prompt; its answers
// arrive as its own dated notes underneath — it never writes in your fields.

import { html, raw, on, debounce, autosize, sheet, toast } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { STATUSES, KINDS, statusPatch, formatAuthors, normalizeUrl, siteOf, findDoi, assistWaiting } from "../../core/sources.js";
import { renderMarkdown } from "../../core/markdown.js";
import { companionSettings, COMPANIONS } from "../../core/companions.js";
import { portrait } from "../../ui/companion.js";
import { tagInput, deleteSource, mdHead, mdPreview, mdSwitch } from "../ui.js";
import { imageOf } from "../images.js";
import { attachFiles } from "../donut.js";
import { fmtButton, wireFormat } from "../../ui/textformat.js";

const metaLine = (s) => [s.site, formatAuthors(s.authors), s.year, KINDS[s.kind]].filter(Boolean).join(" · ");
// What a field shows for a stored value (the inverse of valueOf below).
const when = (iso) => String(iso || "").slice(0, 16).replace("T", " ");
const whoIs = (a) => (/^claude/.test(a || "") ? "Claude" : a || "Agent");
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
  // Your own fields take the Aa button (bold, italic, size, colour), with a formatted line under them.
  const field = (k, label, ph, { rows = 2, hint = "" } = {}) => html`<div class="fmt-scope"><label class="field"><span>${label}${hint ? html` <span class="faint">${hint}</span>` : ""}</span>
    <textarea class="textarea" data-f="${k}" data-fmtable rows="${rows}" placeholder="${ph}">${s[k] || ""}</textarea></label>${fmtButton(label)}</div>`;

  const pic = imageOf(s);
  el.innerHTML = String(html`<div class="src-page">
    ${pic ? html`<button type="button" class="src-picture" data-act="zoom" aria-label="Show the picture full size"><img data-media="${pic.path}" data-fallback="${pic.thumb || ""}" alt="${s.title || "Picture"}"></button>` : ""}
    <div class="src-side">
      <div class="src-files" data-files></div>
      <textarea class="src-title-in" data-f="title" rows="1" aria-label="Title" placeholder="Title">${s.title || ""}</textarea>
      <div class="src-meta">${metaLine(s)}</div>
      <div class="status-seg" role="group" aria-label="Status">${Object.entries(STATUSES).map(([k, label]) => html`<button type="button" data-status="${k}" class="${s.status === k ? "on" : ""}">${label}</button>`)}</div>
      <button type="button" class="btn small fav-btn ${s.favourite ? "on" : ""}" data-act="fav" aria-pressed="${String(!!s.favourite)}">${raw(icon("star"))}${s.favourite ? "Favourite" : "Mark as favourite"}</button>
      <div class="field"><span class="label">Tags</span>${tagger.markup}</div>
      <div class="fmt-scope"><label class="field"><span>Why I saved it</span><input class="input" data-f="why" data-fmtable value="${s.why || ""}" placeholder="One line for future you" autocomplete="off"></label>${fmtButton("Why I saved it")}</div>
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
      <div class="md-box fmt-scope">${mdHead("Notes")}
      <textarea class="textarea notes" data-f="body" data-md data-fmtable aria-label="Notes" placeholder="Your notes — Markdown works: # heading, **bold**, *italic*, - lists, > quotes, [links](https://…)">${s.body || ""}</textarea>
      ${mdPreview}</div>
      <section class="src-assist" aria-label="Assist">
        <label class="assist-toggle"><input type="checkbox" data-assist ${s.assist === true ? "checked" : ""}><span><b>Assist</b> — let an agent work with this</span></label>
        <div class="assist-body">
          <label class="check corkboard-toggle"><input type="checkbox" data-corkboard ${s.corkboard === true ? "checked" : ""}> Turn into a corkboard <span class="faint">— the agent builds a board from this and links it here</span></label>
          <p class="small" data-board-link></p>
          <div class="fmt-scope"><label class="field"><span>Your prompt <span class="faint">— what you'd like it to do</span></span><textarea class="textarea" data-f="prompt" data-fmtable rows="3" placeholder="e.g. Find the strongest critique of this and say where it lands">${s.prompt || ""}</textarea></label>${fmtButton("Your prompt")}</div>
          <p class="small faint" data-assist-state></p>
        </div>
        <div data-agent-notes></div>
      </section>
    </div>
  </div>`);
  ctx.media.hydrate(el);
  el.querySelector("[data-act=zoom]")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("full"));
  // A kept file opens from this device's copy (fetched from the data repo the first time on a new device).
  on(el, "click", "[data-file]", async (e, b) => {
    const u = await ctx.media.url(b.dataset.file);
    if (!u) { toast("That file isn't on this device yet — it downloads when you're online and synced.", { error: true }); return; }
    const a = Object.assign(document.createElement("a"), { href: u, target: "_blank", rel: "noopener", download: b.dataset.name || "" });
    if (/^(application\/pdf|image\/|text\/|audio\/|video\/)/.test(ctx.store.blobMeta.get(b.dataset.file)?.mime || "")) a.removeAttribute("download");
    a.click();
  });

  for (const t of el.querySelectorAll("textarea")) autosize(t);
  ui.cleanup(wireFormat(el));

  // Notes: Edit or Preview, remembered on this device.
  const md = mdSwitch(el.querySelector(".md-box"), ctx, { empty: "No notes yet.", autosize });

  // Kept files: open one, or attach more (a PDF that goes with this, say).
  function renderFiles() {
    const kept = (s.media || []).filter((m) => m.type === "file");
    el.querySelector("[data-files]").innerHTML = String(html`${kept.map((m) => html`<button type="button" class="btn small src-file" data-file="${m.path}" data-name="${m.original_name || ""}">${raw(icon("file"))}Open ${m.original_name || "the file"}${m.size ? html` <span class="faint">· ${Math.max(1, Math.round(m.size / 1024))} KB</span>` : ""}</button>`)}
      <button type="button" class="btn small ghost src-file" data-act="attach">${raw(icon("upload"))}Attach a file</button><input type="file" multiple hidden data-attach-in>`);
  }
  renderFiles();
  on(el, "click", "[data-act=attach]", () => el.querySelector("[data-attach-in]").click());
  on(el, "change", "[data-attach-in]", async (e, inp) => {
    const files = [...inp.files];
    inp.value = "";
    if (!files.length) return;
    await flush.flush();
    const n = await attachFiles(ctx, s, files);
    s = ctx.store.get(id) || s;
    renderFiles();
    if (n) toast(`Attached ${n} file${n === 1 ? "" : "s"}.`);
  });

  // Assist: the toggle, whether it's waiting, and the agent's notes.
  function renderAssist() {
    const on_ = s.assist === true;
    el.querySelector(".src-assist").classList.toggle("on", on_);
    el.querySelector("[data-assist]").checked = on_;
    el.querySelector("[data-corkboard]").checked = s.corkboard === true;
    const board = s.board && ctx.store.get(s.board);
    el.querySelector("[data-board-link]").innerHTML = String(board && !board.deleted ? html`Its corkboard: <a href="#/board/${board.id}">${board.title}</a>`
      : s.corkboard === true ? html`<span class="faint">An agent builds the board on its next pass.</span>` : "");
    el.querySelector("[data-assist-state]").textContent = !on_ ? "" : s.corkboard === true && !s.board ? (String(s.prompt || "").trim() ? "Waiting — an agent builds the board (with your prompt in mind) on its next pass." : "Waiting for the board. Add a prompt if you'd like it shaped a particular way.")
      : !String(s.prompt || "").trim() ? "Write what you'd like and an agent picks it up on its next pass."
      : assistWaiting(s) ? "Waiting — an agent picks this up on its next pass." : "Answered. Change the prompt to ask again.";
    const ns = s.agent_notes || [];
    const cs = companionSettings(ctx.settings());
    el.querySelector("[data-agent-notes]").innerHTML = String(ns.length ? html`${[...ns].reverse().map((n) => html`<article class="agent-note">
        <header>${cs.on ? html`${portrait("marginalia", { label: cs.name || COMPANIONS.marginalia.name, still: true })}<b class="small">${cs.name || COMPANIONS.marginalia.name}</b>` : ""}<span class="badge ai" title="Written by">${whoIs(n.author)}</span><span class="faint small">${when(n.date)}</span><span class="grow"></span><button type="button" class="btn icon small ghost" data-act="rm-agent-note" data-id="${n.id}" aria-label="Remove this agent note">${raw(icon("trash"))}</button></header>
        <div class="prose">${raw(renderMarkdown(n.text, { tags: false, concepts: false }))}</div></article>`)}` : "");
  }
  renderAssist();
  el.querySelector("[data-assist]").addEventListener("change", async (e) => {
    await flush.flush();
    await save({ assist: e.target.checked ? true : undefined });
    renderAssist();
    if (e.target.checked) el.querySelector("[data-f=prompt]").focus();
  });
  el.querySelector("[data-corkboard]").addEventListener("change", async (e) => {
    await flush.flush();
    await save({ corkboard: e.target.checked ? true : undefined });
    renderAssist();
  });
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
    if (k === "prompt") pending.prompted = ctx.now();
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
    renderFiles();
    renderAssist();
    if (shown("body", now) !== shown("body", last)) md.refresh();
    renderAssist();
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
    if (act === "rm-agent-note") {
      const ns = [...(s.agent_notes || [])];
      const i = ns.findIndex((n) => n.id === b.dataset.id);
      if (i < 0) return;
      const [gone] = ns.splice(i, 1);
      await save({ agent_notes: ns.length ? ns : undefined });
      renderAssist();
      toast("Agent note removed", { action: "Undo", onAction: async () => { await save({ agent_notes: [...(s.agent_notes || []), gone].sort((x, y) => String(x.date).localeCompare(String(y.date))) }); renderAssist(); } });
    }
    if (act === "delete") {
      flush.cancel();
      await deleteSource(ctx, id);
      ctx.navigate("#/inbox", { replace: true });
    }
  });
}
