// One entry, with every layer kept distinct: what you wrote; the exact
// transcript it came from; the conversation it was drafted from; for a
// document, what its author wrote vs. your thoughts vs. what an AI read into
// it. Nothing generated is ever shown as if you wrote it.

import { html, raw, on, sheet, toast, errorToast, confirmSheet, promptSheet, pickFiles, autosize, timeOf, bytes } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { renderMarkdown, extractConcepts, escapeHtml } from "../core/markdown.js";
import { formatDayLong, formatDay } from "../core/dates.js";
import { ENTRY_KINDS, PRIVACY_LEVELS, makeQuestion, aiReadable } from "../core/model.js";
import { privacyBadge, authorBadge, entryCard } from "../ui/components.js";
import { updateEntry, deleteEntryWithUndo, setPrivacy, storePhotos } from "../app/actions.js";
import { pathFor } from "../core/format.js";

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  let editing = route.query.edit === "1";
  const removed = new Set(); // photos marked for removal while editing
  ui.setTitle("Entry", { back: "history" });

  function render() {
    const e = ctx.store.get(id);
    if (!e) {
      el.innerHTML = String(html`<div class="empty"><h3>Entry not found</h3><p class="muted">It may have been deleted, or not synced to this device yet.</p><p><a href="#/today">Back to Today</a></p></div>`);
      return;
    }
    ui.setTitle(formatDay(e.day, { weekday: "short", day: "numeric", month: "short", year: e.day.slice(0, 4) === ctx.today().slice(0, 4) ? undefined : "numeric" }), { back: "history" });
    ui.setActions(editing ? "" : html`<button class="btn icon ghost" data-act="edit" aria-label="Edit">${raw(icon("edit"))}</button><button class="btn icon ghost" data-act="menu" aria-label="More">${raw(icon("more"))}</button>`);
    const sealedLocked = e.sealed && e.body == null;
    if (sealedLocked) {
      el.innerHTML = String(html`<div class="entry-view"><div class="card lock-card">${raw(icon("lock"))}<h3>Sealed entry</h3><p class="muted">Its text and photos are encrypted with your passphrase.</p><a class="btn primary" href="#/settings/privacy">Unlock</a></div></div>`);
      return;
    }
    el.innerHTML = String(editing ? editHtml(e) : viewHtml(e));
    ctx.media.hydrate(el);
    hydrateInline(e);
    if (editing) {
      const ta = el.querySelector("[data-body]");
      if (ta) { autosize(ta, 0.7); ta.focus(); }
    } else {
      renderAudio(e);
      renderRevisions(e);
    }
  }

  function hydrateInline(e) {
    for (const fig of el.querySelectorAll(".md-media[data-media-id]")) {
      const m = (e.media || []).find((x) => x.id === fig.dataset.mediaId);
      if (!m) continue;
      const ph = fig.querySelector(".md-media-ph");
      if (m.type === "photo") ph.outerHTML = `<img alt="" data-media="${escapeHtml(m.path)}" data-fallback="${escapeHtml(m.thumb || "")}">`;
      else ph.outerHTML = `<a class="btn small" href="#" data-act="open-file" data-path="${escapeHtml(m.path)}">${icon("file")}${escapeHtml(m.original_name || "file")}</a>`;
    }
    ctx.media.hydrate(el);
  }

  async function renderAudio(e) {
    const a = (e.media || []).find((m) => m.type === "audio");
    const box = el.querySelector("[data-audio]");
    if (!a || !box) return;
    const url = await ctx.media.url(a.path);
    box.innerHTML = url ? `<audio controls preload="metadata" src="${url}" style="width:100%"></audio>` : `<p class="small faint">Audio isn't on this device yet.</p>`;
  }

  async function renderRevisions(e) {
    const box = el.querySelector("[data-revisions]");
    if (!box) return;
    const revs = await ctx.store.revisions(e.id);
    box.innerHTML = revs.length ? String(html`<ul class="history">${revs.slice(0, 20).map((r) => html`<li class="self">
        <div class="when">${new Date(r.at).toLocaleString()} · ${({ edit: "your edit", conflict: "version from another device", "synced-change": "before a change synced from another device", merged: "before merging two devices' edits", privacy: "before a privacy change", deleted: "before deletion", "deleted-remotely": "before deletion on another device", "undo-delete": "before undo" })[r.reason] || r.reason}</div>
        <div class="st">${(r.record.body || r.record.title || "").slice(0, 220) || "(no text)"}</div>
        <button class="btn small ghost" data-act="restore" data-rid="${r.rid}">Restore this version</button></li>`)}</ul>`)
      : String(html`<p class="small faint">No earlier versions.</p>`);
    box._revs = revs;
  }

  function viewHtml(e) {
    const kind = e.kind || "text";
    const shown = (m) => !String(e.body || "").includes(`media:${m.id}`) && m.role !== "original";
    const photos = (e.media || []).filter((m) => m.type === "photo" && shown(m));
    const files = (e.media || []).filter((m) => m.type === "file" && shown(m));
    const q = e.question ? ctx.store.get(e.question) : null;
    const t = e.transcript;
    const related = ctx.derived.related(e.id, 5).map((r) => ({ ...r, e: ctx.store.get(r.id) })).filter((r) => r.e);
    const connections = ctx.store.all("interpretation").filter((i) => (i.of || []).includes(e.id));
    const concepts = extractConcepts(e.body);
    return html`<article class="entry-view">
      ${e.title ? html`<h2>${e.title}</h2>` : ""}
      <div class="entry-meta">
        <a href="#/day/${e.day}">${formatDayLong(e.day)}</a><span>${timeOf(e.created)}</span>
        <span class="badge">${ENTRY_KINDS[kind] || kind}</span>${authorBadge("self")}${privacyBadge(e.privacy)}
        ${(e.tags || []).map((tg) => html`<a class="tag" href="#/search?tag=${encodeURIComponent(tg)}">#${tg}</a>`)}
      </div>
      ${q || e.prompt ? html`<div class="notice" style="margin-bottom:14px">${raw(icon("question"))}<span>In answer to: <b>${q?.text || e.prompt}</b></span></div>` : ""}
      ${kind === "document" ? documentHtml(e) : ""}
      ${t && t.status !== "approved" ? html`<div class="notice warn" style="margin-bottom:14px">${raw(icon("mic"))}<div class="grow">${t.status === "pending" ? "This voice note hasn't been transcribed yet." : "The transcript is waiting for your review."}</div>
        ${t.status === "pending" ? html`<button class="btn small" data-act="transcribe">Transcribe</button>` : html`<button class="btn small primary" data-act="review">Review</button>`}</div>` : ""}
      ${kind === "document" ? html`<div class="section-title">Your thoughts ${raw(authorBadge("self"))}</div>` : ""}
      ${e.body ? html`<div class="prose">${raw(renderMarkdown(e.body))}</div>` : kind === "document" ? html`<p class="faint">You haven't written anything about this yet. <button class="btn small" data-act="edit">Add your thoughts</button></p>` : photos.length ? "" : html`<p class="faint">(no text)</p>`}
      ${photos.length ? html`<div class="gallery">${photos.map((m) => html`<figure><div class="ph" data-act="lightbox" data-mid="${m.id}"><img alt="${m.caption || ""}" data-media="${m.thumb || m.path}" data-fallback="${m.path}"></div>${m.caption ? html`<figcaption>${m.caption}</figcaption>` : ""}</figure>`)}</div>` : ""}
      ${files.length ? html`<div class="btn-row" style="margin:12px 0">${files.map((m) => html`<button class="btn small" data-act="open-file" data-path="${m.path}">${raw(icon("file"))}${m.original_name || "File"} <span class="faint">${bytes(m.bytes)}</span></button>`)}</div>` : ""}
      <div data-audio style="margin:12px 0"></div>
      ${concepts.length ? html`<div class="row wrap small" style="margin:10px 0">${raw(icon("link"))}<span class="muted">Linked ideas:</span>${concepts.map((c) => html`<a class="concept" href="#/concept/${c}">@${c}</a>`)}</div>` : ""}
      ${(e.links?.tasks || []).length ? html`<div class="row wrap small" style="margin:10px 0">${raw(icon("check"))}<span class="muted">Sent to tasks:</span>${e.links.tasks.map((tk) => html`<span class="badge">${tk.title}</span>`)}</div>` : ""}

      <div class="btn-row" style="margin:18px 0 6px">
        <button class="btn small" data-act="listen">${raw(icon("speaker"))}Listen</button>
        <button class="btn small" data-act="ask">${raw(icon("question"))}Save a question</button>
        <button class="btn small" data-act="add-photos">${raw(icon("camera"))}Add photos</button>
        ${ctx.ai.configured() && aiReadable(e) ? html`<a class="btn small" href="#/talk?entry=${e.id}">${raw(icon("chat"))}Talk about this</a>` : ""}
      </div>

      ${t?.raw ? html`<details class="layer" style="margin-top:18px"><summary>${raw(icon("mic"))}Exact transcript <span class="badge">${t.engine === "webspeech" ? "browser dictation" : t.engine === "api" ? t.model || "transcription API" : t.engine}</span></summary><div>
        <div class="raw-text">${t.raw}</div>
        <p class="small muted">${t.status === "approved" ? `You approved ${t.approved === "raw" ? "your exact words" : t.approved === "edited" ? "an edited version" : `the cleaned version (${String(t.cleaned_by || "rules").replace(/^ai:/, "AI · ")})`}.` : ""}${t.warnings?.length ? ` Cleanup flags at review: ${t.warnings.join(", ")}.` : ""}</p>
        <button class="btn small" data-act="review">Review again</button></div></details>` : ""}
      ${e.conversation?.turns?.length ? html`<details class="layer"><summary>${raw(icon("chat"))}The conversation this came from</summary><div class="chat">${e.conversation.turns.map((tn) => html`<div class="bubble ${tn.role === "self" ? "self" : "ai"}">${tn.text}</div>`)}</div>
        <p class="small muted">${e.conversation.drafted_by ? `The entry text was drafted from your side of this conversation by ${e.conversation.drafted_by.replace(/^ai:/, "AI · ")} and approved by you.` : ""}</p></details>` : ""}
      ${e.imported?.notion ? html`<details class="layer"><summary>${raw(icon("download"))}Imported from Notion</summary><div class="scroll-x"><table class="simple"><tbody>${Object.entries(e.imported.notion.original || e.imported.notion.properties || {}).map(([k, v]) => html`<tr><th>${k}</th><td>${String(v)}</td></tr>`)}</tbody></table>
        <p class="small muted">Kept exactly as exported${e.source?.path ? html` from <code>${e.source.path}</code>` : ""}.</p></div></details>` : ""}
      ${connections.length ? html`<details class="layer" open><summary>${raw(icon("link"))}Connections you accepted</summary><div>${connections.map((c) => html`<div class="small" style="margin-bottom:8px">${authorBadge(c.author)} ${c.body} — ${(c.of || []).filter((x) => x !== e.id).map((x) => { const o = ctx.store.get(x); return o ? html`<a href="#/entry/${o.id}">${formatDay(o.day, { day: "numeric", month: "short", year: "numeric" })}</a> ` : ""; })}</div>`)}</div></details>` : ""}
      <details class="layer"><summary>${raw(icon("history"))}Earlier versions</summary><div data-revisions><div class="spinner"></div></div></details>
      <details class="layer"><summary>${raw(icon("info"))}Where this came from</summary><div><dl class="provenance">
        <dt>Written</dt><dd>${e.created}${e.tz ? ` (${e.tz})` : ""}</dd>
        ${e.updated && e.updated !== e.created ? html`<dt>Last changed</dt><dd>${e.updated}</dd>` : ""}
        <dt>Source</dt><dd>${sourceLabel(e)}</dd>
        <dt>Privacy</dt><dd>${PRIVACY_LEVELS[e.privacy || "normal"].label} — ${PRIVACY_LEVELS[e.privacy || "normal"].hint}</dd>
        <dt>File</dt><dd><code>${pathFor(e) || "—"}</code></dd>
      </dl></div></details>

      ${related.length ? html`<div class="section-title">Related entries</div>${related.map((r) => html`<div style="margin-bottom:10px">${entryCard(r.e, { showDay: true, today: ctx.today() })}<div class="tiny faint" style="margin:4px 4px 0">Shares: ${r.shared.join(", ")}</div></div>`)}` : ""}
    </article>`;
  }

  function sourceLabel(e) {
    const s = e.source || {};
    if (s.system === "notion") return `Notion import${s.database ? ` · ${s.database}` : ""}${s.date_confidence && s.date_confidence !== "high" ? ` · date ${s.date_confidence}` : ""}${s.time_known === false ? " · time of day unknown" : ""}`;
    if (s.system === "living-journal") return `Written in the journal${s.device ? ` on ${s.device}` : ""}${s.method === "voice" ? " (voice)" : ""}`;
    if (s.system === "paste") return `Pasted${s.from ? ` from ${s.from}` : ""}`;
    if (s.system === "sample") return "Sample data (fictional)";
    return s.system || "—";
  }

  function documentHtml(e) {
    const d = e.document || {};
    const original = (e.media || []).find((m) => m.id === d.original);
    const readings = ctx.store.all("interpretation").filter((i) => (i.of || []).includes(e.id) && i.kind !== "connection" && i.status !== "dismissed");
    const docQuestions = ctx.store.all("question").filter((q) => q.source?.entry === e.id);
    return html`
      <div class="section-title">What ${d.author || "they"} wrote ${raw(html`<span class="badge other">by ${d.author || "someone else"}${d.author_role ? ` · ${d.author_role}` : ""}</span>`)}</div>
      <div class="card flat">
        ${d.title ? html`<h3>${d.title}</h3>` : ""}
        <div class="small muted">${[d.date && `Dated ${d.date}`, d.source && `From ${d.source}`].filter(Boolean).join(" · ")}</div>
        ${original ? html`<div class="btn-row" style="margin-top:10px"><button class="btn small" data-act="open-file" data-path="${original.path}">${raw(icon("file"))}Open original ${original.original_name ? `(${original.original_name})` : ""}</button></div>` : ""}
        ${d.text ? html`<blockquote class="prose" style="margin:12px 0 0;border-left:3px solid var(--ink-3);padding-left:12px">${raw(renderMarkdown(d.text, { tags: false, concepts: false }))}</blockquote>` : html`<p class="small faint">No text pasted — the original file is preserved as-is.</p>`}
      </div>
      <div class="section-title">An AI reading ${raw(html`<span class="badge ai">hypotheses, not facts</span>`)}</div>
      ${readings.length ? readings.map((r) => html`<div class="card flat proposal" style="margin-bottom:8px"><div class="row between small">${authorBadge(r.author)}<span class="faint">${formatDay(r.created.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</span></div>
          <div class="prose" style="font-size:1rem;margin-top:8px">${raw(renderMarkdown(r.body, { tags: false }))}</div>
          <div class="btn-row" style="margin-top:8px"><button class="btn small ghost" data-act="dismiss-reading" data-iid="${r.id}">Dismiss this reading</button></div></div>`)
        : html`<p class="small muted">${aiReadable(e) ? "No AI reading yet." : "AI reading is off for this document — it stays between you and its author."}</p>`}
      ${aiReadable(e) && ctx.ai.configured() ? html`<button class="btn small" data-act="ai-read">${raw(icon("sparkle"))}Ask AI to read this</button>` : ""}
      <div class="section-title">Questions to revisit</div>
      ${docQuestions.length ? docQuestions.map((q) => html`<div class="small" style="margin-bottom:6px">• ${q.text} <span class="faint">${q.status}${q.snooze_until ? ` · until ${q.snooze_until.slice(0, 10)}` : ""}</span></div>`) : html`<p class="small faint">None yet.</p>`}
      <button class="btn small" data-act="doc-question">${raw(icon("plus"))}Add a question to come back to</button>`;
  }

  function editHtml(e) {
    const photos = (e.media || []).filter((m) => m.type === "photo");
    return html`<div class="stack">
      <label class="field"><span>Title (optional)</span><input class="input" data-title value="${e.title || ""}" autocomplete="off"></label>
      <label class="field"><span>${e.kind === "document" ? "Your thoughts" : "Entry"}</span><textarea class="textarea" data-body style="font-family:var(--font-write);font-size:1.08rem;min-height:200px">${e.body || ""}</textarea></label>
      ${photos.length ? html`<div><span class="label">Photo captions</span>${photos.map((m) => html`<div class="row" style="margin-bottom:8px"><div style="width:64px;height:64px;border-radius:9px;overflow:hidden;flex:none;background:var(--surface-2)"><img alt="" data-media="${m.thumb || m.path}" style="width:100%;height:100%;object-fit:cover"></div><input class="input" data-cap="${m.id}" value="${m.caption || ""}" placeholder="Caption" autocomplete="off"><button class="btn icon small ghost" data-act="rm-photo" data-mid="${m.id}" aria-label="Remove photo">${raw(icon("trash"))}</button></div>`)}</div>` : ""}
      <p class="hint">Use #tags anywhere in the text. Link an idea from your knowledge system with @concept-id.</p>
      <div class="btn-row end"><button class="btn" data-act="cancel-edit">Cancel</button><button class="btn primary" data-act="save-edit">Save</button></div>
    </div>`;
  }

  render();
  ui.onStore((c) => { if (!editing && (c.ids?.includes(id) || c.op === "synced" || c.op === "unlock" || c.op === "lock")) render(); });

  on(el, "click", "[data-act]", (ev, btn) => handle(ev, btn));
  ui.onAction((ev, btn) => handle(ev, btn));

  async function handle(ev, btn) {
    const act = btn.dataset.act;
    const e = ctx.store.get(id);
    if (!e) return;
    try {
      if (act === "edit") { editing = true; return render(); }
      if (act === "cancel-edit") { editing = false; return render(); }
      if (act === "save-edit") {
        const media = (e.media || []).map((m) => {
          const inp = el.querySelector(`[data-cap="${CSS.escape(m.id)}"]`);
          return inp ? { ...m, caption: inp.value.trim() || undefined } : m;
        }).filter((m) => !removed.has(m.id));
        for (const m of (e.media || []).filter((x) => removed.has(x.id))) for (const p of [m.path, m.thumb]) if (p) await ctx.store.removeBlob(p);
        await updateEntry(ctx, e, { body: el.querySelector("[data-body]").value, title: el.querySelector("[data-title]").value.trim() || undefined, media });
        removed.clear();
        editing = false;
        toast("Saved");
        return render();
      }
      if (act === "rm-photo") { removed.add(btn.dataset.mid); btn.closest(".row").style.opacity = 0.35; return; }
      if (act === "menu") return menu(e);
      if (act === "listen") {
        const { speak, ttsSupported } = await import("../voice/tts.js");
        if (!ttsSupported()) return toast("This browser can't read aloud.");
        const ctl = speak([e.title, e.body].filter(Boolean).join(". "));
        const close = toast("Reading aloud…", { action: "Stop", onAction: () => ctl.stop(), timeout: 0 });
        ctl.done.then(close);
        return;
      }
      if (act === "transcribe") {
        const { transcribeEntry, reviewTranscript } = await import("../voice/capture.js");
        btn.setAttribute("disabled", "");
        const next = await transcribeEntry(ctx, e);
        if (next) await reviewTranscript(ctx, next);
        return;
      }
      if (act === "review") {
        const { reviewTranscript } = await import("../voice/capture.js");
        return reviewTranscript(ctx, e);
      }
      if (act === "ask") {
        const text = await promptSheet({ title: "A question to come back to", label: "Your question", placeholder: "e.g. What made this feel so different?", confirm: "Save question", hint: "It joins your questions in Reflect, linked to this entry." });
        if (!text?.trim()) return;
        await ctx.store.put(makeQuestion({ text: text.trim(), origin: "self", kind: "custom", evidence: [{ entry: e.id }] }, { now: ctx.now() }));
        return toast("Question saved", { action: "View", onAction: () => ctx.navigate("#/reflect/questions") });
      }
      if (act === "doc-question") {
        const v = await sheet({
          title: "A question to come back to",
          body: html`<label class="field"><span>Question</span><textarea class="textarea" data-q autofocus placeholder="e.g. What would it look like to try the exercise she suggested?"></textarea></label>
            <label class="field"><span>Bring it back</span><select class="select" data-when><option value="">Whenever I open Reflect</option><option value="7">In a week</option><option value="30">In a month</option><option value="90">In three months</option></select></label>
            <p class="hint">Questions from documents are marked sensitive: they only appear in Reflect, never on Today.</p>`,
          foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
          setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ q: d.querySelector("[data-q]").value, when: d.querySelector("[data-when]").value })),
        });
        if (!v?.q?.trim()) return;
        const snooze = v.when ? new Date(Date.now() + Number(v.when) * 86400_000).toISOString().slice(0, 10) : undefined;
        await ctx.store.put(makeQuestion({ text: v.q.trim(), origin: "document", kind: "document", sensitivity: "high", snooze_until: snooze, evidence: [{ entry: e.id }], source: { entry: e.id } }, { now: ctx.now() }));
        return toast("Saved");
      }
      if (act === "ai-read") {
        const { readDocument } = await import("../ai/flows.js");
        return readDocument(ctx, e);
      }
      if (act === "dismiss-reading") {
        const r = ctx.store.get(btn.dataset.iid);
        if (r) await ctx.store.put({ ...r, status: "dismissed" });
        return;
      }
      if (act === "add-photos") {
        const files = await pickFiles({ accept: "image/*", multiple: true });
        if (!files.length) return;
        const media = await storePhotos(ctx, { entryId: e.id, day: e.day, sealed: e.privacy === "sealed" }, files);
        await ctx.store.put({ ...e, media: [...(e.media || []), ...media.map(({ entry, ...m }) => m)] });
        return toast(`Added ${media.length} photo${media.length === 1 ? "" : "s"}`);
      }
      if (act === "open-file") {
        ev.preventDefault();
        const url = await ctx.media.url(btn.dataset.path);
        if (url) window.open(url, "_blank", "noopener"); else toast("That file isn't on this device yet.");
        return;
      }
      if (act === "lightbox") {
        const { openLightbox } = await import("../ui/lightbox.js");
        const photos = (e.media || []).filter((m) => m.type === "photo").map((m) => ({ ...m, entry: e }));
        return openLightbox(ctx, photos, photos.findIndex((m) => m.id === btn.dataset.mid));
      }
      if (act === "restore") {
        const rev = (el.querySelector("[data-revisions]")._revs || []).find((r) => r.rid === btn.dataset.rid);
        if (!rev) return;
        if (!(await confirmSheet("Replace the current text with this earlier version? The current version is kept in history too.", { confirm: "Restore" }))) return;
        const r = rev.record;
        if (r.sealed && ctx.store.isLocked()) throw new Error("Unlock sealed entries first.");
        const { openRecord } = await import("../core/crypto.js");
        const plain = r.sealed ? await openRecord(ctx.store.key, r) : r;
        await ctx.store.put({ ...e, body: plain.body, title: plain.title, media: plain.media || e.media }, { reason: "edit" });
        return toast("Restored");
      }
    } catch (err) { errorToast(err); }
  }

  async function menu(e) {
    const choice = await sheet({
      title: "Entry",
      body: html`<div class="stack-sm">
        <button class="day-field" data-m="privacy"><span class="k">Privacy</span><span class="v small" style="font-family:var(--font-ui)">${PRIVACY_LEVELS[e.privacy || "normal"].label} — change who (and what) can read this</span></button>
        <button class="day-field" data-m="day"><span class="k">Move</span><span class="v small" style="font-family:var(--font-ui)">File under a different day</span></button>
        <button class="day-field" data-m="task"><span class="k">To tasks</span><span class="v small" style="font-family:var(--font-ui)">Create a task from this (you choose the words)</span></button>
        <button class="day-field" data-m="delete"><span class="k" style="color:var(--danger)">Delete</span><span class="v small" style="font-family:var(--font-ui)">You can undo for a few seconds; earlier versions stay in history</span></button>
      </div>`,
      setup: (d, close) => on(d, "click", "[data-m]", (ev, b) => close(b.dataset.m)),
    });
    if (!choice) return;
    if (choice === "delete") {
      if (await confirmSheet("Delete this entry?", { confirm: "Delete", danger: true, detail: "It will also be removed from your sync repository (git history keeps old versions)." })) {
        await deleteEntryWithUndo(ctx, e);
        history.back();
      }
    }
    if (choice === "privacy") {
      const v = await sheet({
        title: "Privacy",
        body: html`<div class="stack-sm">${Object.entries(PRIVACY_LEVELS).map(([k, p]) => html`<button class="day-field" data-p="${k}"><span class="k">${p.label}${k === (e.privacy || "normal") ? " ✓" : ""}</span><span class="v small" style="font-family:var(--font-ui)">${p.hint}</span></button>`)}</div>`,
        setup: (d, close) => on(d, "click", "[data-p]", (ev, b) => close(b.dataset.p)),
      });
      if (!v) return;
      if (v === "sealed" && !ctx.store.config("sealing", null)?.salt) return ctx.navigate("#/settings/privacy");
      await setPrivacy(ctx, e, v);
      toast(`Privacy: ${PRIVACY_LEVELS[v].label}`);
    }
    if (choice === "day") {
      const v = await promptSheet({ title: "Move to another day", label: "Date", type: "date", value: e.day, confirm: "Move" });
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && v !== e.day) { await ctx.store.put({ ...e, day: v }); toast(`Moved to ${formatDay(v, { day: "numeric", month: "short", year: "numeric" })}`); }
    }
    if (choice === "task") {
      const { sendToTasks } = await import("../integrations/tasks.js");
      await sendToTasks(ctx, e);
    }
  }
}
