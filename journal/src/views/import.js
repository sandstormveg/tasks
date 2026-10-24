// Bring your past in: a Notion journal export (with a dry run and a
// verification report), calendar events from an .ics file (selectively), or a
// backup made by this app.

import { html, raw, on, toast, errorToast, pickFiles, bytes } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openZip } from "../core/zip.js";
import { indexExport, guessMapping, planImport, reportMarkdown, MAPPABLE_FIELDS } from "../core/notion.js";
import { icsToEventRecords } from "../core/ics.js";
import { makeEvent } from "../core/model.js";
import { mediaPath, MIME_EXT } from "../core/format.js";
import { plainExcerpt } from "../core/markdown.js";
import { addDays, formatDay } from "../core/dates.js";
import { newId } from "../core/ids.js";
import { processPhoto } from "../media/images.js";

export async function mount(el, ctx, route, ui) {
  const kind = route.params[0] || "";
  ui.setTitle("Import", { back: kind ? "#/import" : "#/settings" });
  if (kind === "notion") return notion(el, ctx, ui);
  if (kind === "ics") return ics(el, ctx);
  if (kind === "backup") return backup(el, ctx);
  el.innerHTML = String(html`
    <h2 class="view-title">Import</h2>
    <p class="view-sub">Everything you import keeps a note of where it came from. Nothing is deleted from the source.</p>
    <div class="stack-sm">
      <a class="entry-card row" href="#/import/notion">${raw(icon("download"))}<div class="grow"><div class="title">Notion journal</div><div class="small muted">Entries, dates, ratings, best/hardest moments, categories, tags and photos — with a preview first and a verification report after.</div></div>${raw(icon("chevron"))}</a>
      <a class="entry-card row" href="#/import/ics">${raw(icon("calendar"))}<div class="grow"><div class="title">Calendar events (.ics)</div><div class="small muted">Pick a date range and the events you want. They sit beside your days as context, never mixed into what you wrote.</div></div>${raw(icon("chevron"))}</a>
      <a class="entry-card row" href="#/library">${raw(icon("chat"))}<div class="grow"><div class="title">Pasted text or AI conversation</div><div class="small muted">From the Library: paste writing, or a ChatGPT/Claude conversation with each voice kept separate.</div></div>${raw(icon("chevron"))}</a>
      <a class="entry-card row" href="#/import/backup">${raw(icon("upload"))}<div class="grow"><div class="title">Restore a backup</div><div class="small muted">An export .zip from this app. Existing entries are kept; only missing ones are added.</div></div>${raw(icon("chevron"))}</a>
    </div>`);
}

// ---------------- Notion ----------------

async function openNotionExport(file) {
  const outer = await openZip(file);
  const files = new Map();
  const add = (zip, entry) => { if (!entry.dir) files.set(entry.name, { zip, entry }); };
  for (const e of outer.entries) {
    if (e.name.toLowerCase().endsWith(".zip")) {
      const inner = await openZip(await outer.read(e));
      for (const ie of inner.entries) add(inner, ie);
    } else add(outer, e);
  }
  return {
    files,
    list: [...files.entries()].map(([path, f]) => ({ path, size: f.entry.size })),
    readText: async (p) => { const f = files.get(p); if (!f) throw new Error(`missing ${p}`); return f.zip.readText(f.entry); },
    readBytes: async (p) => { const f = files.get(p); if (!f) throw new Error(`missing ${p}`); return f.zip.read(f.entry); },
  };
}

function notion(el, ctx) {
  const state = { step: "pick", file: null, exp: null, index: null, dbs: [], loose: true, includeUndated: false, preferDayFirst: true, ratingScale: "", from: "", to: "", compress: true, plan: null };

  function render() {
    if (state.step === "pick") {
      el.innerHTML = String(html`<h2 class="view-title">Import from Notion</h2>
        <div class="card flat stack-sm">
          <div><b>1. Export from Notion</b> — open your journal database (or its parent page) → ••• → Export → <b>Markdown &amp; CSV</b>, with <b>Include subpages</b> and <b>Create folders for subpages</b> on.</div>
          <div><b>2. Choose the .zip here.</b> It's read on this device; nothing is uploaded until you sync.</div>
          <div><b>3. Check the preview</b>, then import. A verification report is saved with your journal.</div>
        </div>
        <p class="small muted">Large exports with many photos are easiest on a computer. You can import the same export again later — pages already imported are skipped.</p>
        <button class="btn primary" data-act="pick">${raw(icon("upload"))}Choose export .zip</button>`);
    }
    if (state.step === "scanning") el.innerHTML = String(html`<div class="empty"><div class="spinner"></div><p>Reading ${state.file.name} (${bytes(state.file.size)})…</p></div>`);
    if (state.step === "configure") renderConfigure();
    if (state.step === "preview") renderPreview();
    if (state.step === "importing") el.innerHTML = String(html`<h2 class="view-title">Importing…</h2><div class="progress"><span data-bar style="width:0%"></span></div><p class="small muted" data-msg>Starting</p><p class="small faint">Keep this tab open.</p>`);
  }

  function renderConfigure() {
    const { index } = state;
    el.innerHTML = String(html`<h2 class="view-title">What to import</h2>
      <p class="view-sub">${state.file.name}: ${index.databases.length} database${index.databases.length === 1 ? "" : "s"}, ${index.loosePages.length} other page${index.loosePages.length === 1 ? "" : "s"}.</p>
      ${state.dbs.map((d, i) => html`<div class="card" style="margin-bottom:12px">
        <label class="switch" style="padding-top:0"><input type="checkbox" data-db="${i}" ${d.on ? "checked" : ""}><span><span class="t">${d.db.name}</span><br><span class="d">${d.db.pagePaths.length} pages · ${d.db.rows.length} rows in the CSV</span></span></label>
        <div class="scroll-x"><table class="simple"><thead><tr><th>Notion property</th><th>Becomes</th><th>Example</th></tr></thead><tbody>
          <tr><td><b>${d.titleColumn}</b></td><td>Entry title</td><td class="small faint">${d.db.rows[0]?.[d.titleColumn] || ""}</td></tr>
          ${d.db.columns.filter((c) => c !== d.titleColumn).map((c) => html`<tr><td>${c}</td><td><select class="select" data-map="${i}" data-col="${c}">${Object.entries(MAPPABLE_FIELDS).map(([k, v]) => html`<option value="${k}" ${d.mapping[c] === k ? "selected" : ""}>${v}</option>`)}</select></td><td class="small faint">${String(d.db.rows.find((r) => r[c])?.[c] || "").slice(0, 40)}</td></tr>`)}
        </tbody></table></div>
        <p class="hint">Anything set to “Keep as imported property” is preserved on each entry exactly as exported.</p></div>`)}
      <div class="card flat stack-sm">
        ${index.loosePages.length ? html`<label class="switch"><input type="checkbox" data-opt="loose" ${state.loose ? "checked" : ""}><span><span class="t">Also import ${index.loosePages.length} pages outside a database</span><br><span class="d">Dated from their title if it's a date</span></span></label>` : ""}
        <label class="switch"><input type="checkbox" data-opt="includeUndated" ${state.includeUndated ? "checked" : ""}><span><span class="t">Import pages with no date</span><br><span class="d">Filed under the import date, tagged #undated-import (otherwise listed in the report and skipped)</span></span></label>
        <label class="switch"><input type="checkbox" data-opt="compress" ${state.compress ? "checked" : ""}><span><span class="t">Resize photos to 1600px</span><br><span class="d">Keeps your sync repository small. Turn off to keep originals.</span></span></label>
        <div class="row wrap">
          <label class="field grow"><span>Dates like 03/04/2026 mean</span><select class="select" data-opt-sel="preferDayFirst"><option value="1" ${state.preferDayFirst ? "selected" : ""}>3 April (day first)</option><option value="0" ${!state.preferDayFirst ? "selected" : ""}>March 4 (month first)</option></select></label>
          <label class="field grow"><span>Rating scale</span><select class="select" data-opt-sel="ratingScale"><option value="">Detect from values</option><option value="5">1–5</option><option value="10">1–10</option><option value="100">0–100</option></select></label></div>
        <div class="row wrap"><label class="field grow"><span>Only from (optional)</span><input class="input" type="date" data-opt-date="from" value="${state.from}"></label><label class="field grow"><span>Until (optional)</span><input class="input" type="date" data-opt-date="to" value="${state.to}"></label></div>
      </div>
      <div class="btn-row end" style="margin-top:14px"><button class="btn" data-act="restart">Choose another file</button><button class="btn primary" data-act="preview">Preview import</button></div>`);
  }

  function renderPreview() {
    const { plan } = state;
    const r = plan.report;
    const sample = plan.entries.slice().sort((a, b) => b.day.localeCompare(a.day)).slice(0, 12);
    const warn = r.issues.filter((i) => i.severity !== "info");
    el.innerHTML = String(html`<h2 class="view-title">Preview</h2>
      <p class="view-sub">Nothing has been imported yet.</p>
      <div class="stat-grid">
        <div class="stat"><div class="v">${r.pagesPlanned}</div><div class="k">entries to import</div></div>
        <div class="stat"><div class="v">${r.daysUpdated}</div><div class="k">days with ratings or moments</div></div>
        <div class="stat"><div class="v">${plan.attachments.length}</div><div class="k">attachments</div></div>
        <div class="stat"><div class="v">${r.skippedDuplicate}</div><div class="k">already imported</div></div>
      </div>
      <p class="small muted" style="margin-top:10px">Found ${r.pagesFound} pages: ${r.pagesPlanned} to import, ${r.skippedDuplicate} already imported, ${r.skippedOutOfRange} outside the date range, ${r.undated - (state.includeUndated ? r.undated : 0)} undated and skipped. Ratings read: ${r.ratingsParsed}${r.ratingsUnparsed ? `, unreadable: ${r.ratingsUnparsed} (kept as text)` : ""}.</p>
      ${warn.length ? html`<details class="layer" open><summary>${raw(icon("warn"))}${warn.length} thing${warn.length === 1 ? "" : "s"} to check</summary><div><ul class="warnings">${warn.slice(0, 60).map((i) => html`<li class="warn">${raw(icon("warn"))}<span><code class="tiny">${i.page.split("/").pop()}</code> ${i.message}</span></li>`)}</ul>${warn.length > 60 ? html`<p class="small faint">…and ${warn.length - 60} more in the saved report.</p>` : ""}</div></details>` : html`<div class="notice ok">${raw(icon("check"))}<span>No problems found.</span></div>`}
      <div class="section-title">A few of the entries</div>
      ${sample.map((e) => { const d = plan.dayUpdates.get(e.day); return html`<div class="entry-card"><div class="meta"><span>${formatDay(e.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>${d?.rating != null ? html`<span class="rating-dot" style="--r:.6">${d.rating}/${d.rating_scale}</span>` : ""}${(e.tags || []).slice(0, 3).map((t) => html`<span class="tag">#${t}</span>`)}${e.media.length ? html`<span>${e.media.length} file${e.media.length === 1 ? "" : "s"}</span>` : ""}</div>${e.title ? html`<div class="title">${e.title}</div>` : ""}<div class="excerpt">${plainExcerpt(e.body, 200) || html`<span class="faint">(no text)</span>`}</div>${d?.best ? html`<div class="small muted" style="margin-top:4px">Best: ${d.best}</div>` : ""}</div>`; })}
      <div class="btn-row end" style="margin-top:16px"><button class="btn" data-act="back">Back</button><button class="btn primary" data-act="import" ${r.pagesPlanned ? "" : "disabled"}>Import ${r.pagesPlanned} entries</button></div>`);
  }

  async function doPreview() {
    const existingSourceIds = new Set(ctx.store.all("entry").map((e) => e.source?.id).filter(Boolean));
    const existingDays = new Map(ctx.store.all("day").map((d) => [d.id, d]));
    state.plan = await planImport(state.index, {
      readText: state.exp.readText,
      databases: state.dbs.filter((d) => d.on).map((d) => ({ db: d.db, mapping: d.mapping, titleColumn: d.titleColumn })),
      loosePages: state.loose ? state.index.loosePages : [],
      from: state.from || undefined, to: state.to || undefined,
      existingSourceIds, existingDays, preferDayFirst: state.preferDayFirst,
      ratingScale: state.ratingScale ? Number(state.ratingScale) : undefined,
      includeUndated: state.includeUndated, undatedDay: ctx.today(),
    });
    state.step = "preview";
    render();
  }

  async function doImport() {
    const { plan } = state;
    state.step = "importing";
    render();
    const bar = () => el.querySelector("[data-bar]");
    const msg = (t) => { const m = el.querySelector("[data-msg]"); if (m) m.textContent = t; };
    const byMedia = new Map(plan.attachments.map((a) => [a.mediaId, a]));
    const total = plan.entries.length;
    let done = 0, mediaDone = 0, mediaFailed = 0;
    try {
      for (const entry of plan.entries) {
        const media = [];
        for (const m of entry.media) {
          const a = byMedia.get(m.id);
          try {
            const bytesIn = await state.exp.readBytes(a.zipPath);
            if (a.isImage && state.compress) {
              const p = await processPhoto(new File([bytesIn], m.original_name || "image", { type: a.mime }));
              const path = mediaPath(entry.day, m.id, "jpg");
              const thumb = mediaPath(entry.day, m.id, "jpg", { thumb: true });
              await ctx.store.putBlob(path, p.blob, { mime: "image/jpeg" });
              await ctx.store.putBlob(thumb, p.thumb, { mime: "image/jpeg" });
              media.push({ ...m, mime: "image/jpeg", path, thumb, width: p.width, height: p.height, bytes: p.blob.size, taken: p.taken || undefined, original_bytes: bytesIn.length });
            } else {
              const ext = MIME_EXT[a.mime] || (a.zipPath.split(".").pop() || "bin").toLowerCase();
              const path = mediaPath(entry.day, m.id, ext);
              await ctx.store.putBlob(path, new Blob([bytesIn], { type: a.mime }), { mime: a.mime });
              media.push({ ...m, path, bytes: bytesIn.length });
            }
            mediaDone++;
          } catch (err) {
            mediaFailed++;
            plan.report.issues.push({ severity: "warn", page: entry.source.path, message: `Attachment ${m.original_name} couldn't be imported (${err.message}).` });
          }
        }
        await ctx.store.put({ ...entry, media }, { keepUpdated: true, silent: true, revision: false });
        done++;
        if (done % 10 === 0 || done === total) { bar().style.width = `${(done / total) * 100}%`; msg(`${done} of ${total} entries · ${mediaDone} attachments`); }
      }
      for (const d of plan.dayUpdates.values()) await ctx.store.put(d, { keepUpdated: true, silent: true });
      const when = ctx.now();
      const reportId = `notion-${when.slice(0, 10)}-${newId("r", when).slice(-4)}`;
      plan.report.attachmentsImported = mediaDone;
      plan.report.attachmentsFailed = mediaFailed;
      await ctx.store.put({ id: reportId, type: "report", kind: "notion-import", created: when, summary: { pagesFound: plan.report.pagesFound, imported: plan.report.pagesPlanned, duplicates: plan.report.skippedDuplicate, undated: plan.report.undated, attachments: mediaDone, attachmentsFailed: mediaFailed }, body: reportMarkdown(plan.report, { exportName: state.file.name, when: when.slice(0, 10) }) });
      ctx.store.emit({ op: "put", ids: [], types: ["entry", "day", "report"], bulk: true });
      el.innerHTML = String(html`<div class="empty">${raw(icon("check"))}<h3>Imported ${done} entries</h3>
        <p>${mediaDone} attachments${mediaFailed ? `, ${mediaFailed} couldn't be read (listed in the report)` : ""}. The verification report is saved as <code>imports/${reportId}.md</code> in your journal.</p>
        <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/timeline">See your timeline</a>${ctx.sync.configured() ? html`<button class="btn" data-act="sync">Sync now</button>` : html`<a class="btn" href="#/settings/sync">Set up backup</a>`}</div></div>`);
    } catch (err) {
      errorToast(err);
      el.innerHTML = String(html`<div class="empty"><h3>The import stopped</h3><p>${done} of ${total} entries were saved before: ${err.message}. Importing the same file again skips what's already in.</p><a class="btn" href="#/import/notion">Try again</a></div>`);
    }
  }

  render();
  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    try {
      if (act === "pick") {
        const [f] = await pickFiles({ accept: ".zip,application/zip" });
        if (!f) return;
        state.file = f;
        state.step = "scanning";
        render();
        state.exp = await openNotionExport(f);
        state.index = await indexExport(state.exp.list, state.exp.readText);
        state.dbs = state.index.databases.map((db) => { const g = guessMapping(db); return { db, on: Object.values(g.mapping).includes("date") || db.pagePaths.length > 0, ...g }; });
        if (!state.index.databases.length && !state.index.loosePages.length) { toast("No Notion pages found in that zip.", { error: true }); state.step = "pick"; }
        else state.step = "configure";
        return render();
      }
      if (act === "restart") { state.step = "pick"; return render(); }
      if (act === "preview") { b.setAttribute("disabled", ""); return doPreview(); }
      if (act === "back") { state.step = "configure"; return render(); }
      if (act === "import") return doImport();
      if (act === "sync") { await ctx.sync.syncNow(); return toast("Synced"); }
    } catch (err) { errorToast(err); state.step = state.index ? "configure" : "pick"; render(); }
  });
  on(el, "change", "[data-db],[data-map],[data-opt],[data-opt-sel],[data-opt-date]", (e, t) => {
    if (t.dataset.db != null) state.dbs[Number(t.dataset.db)].on = t.checked;
    if (t.dataset.map != null) state.dbs[Number(t.dataset.map)].mapping[t.dataset.col] = t.value;
    if (t.dataset.opt) state[t.dataset.opt] = t.checked;
    if (t.dataset.optSel === "preferDayFirst") state.preferDayFirst = t.value === "1";
    if (t.dataset.optSel === "ratingScale") state.ratingScale = t.value;
    if (t.dataset.optDate) state[t.dataset.optDate] = t.value;
  });
}

// ---------------- ICS ----------------

function ics(el, ctx) {
  let events = [];
  let text = "";
  let fileName = "";
  const today = ctx.today();
  let from = addDays(today, -30), to = today, calName = "";

  function render() {
    el.innerHTML = String(html`<h2 class="view-title">Calendar events</h2>
      <p class="view-sub">Export a calendar as .ics (Google Calendar: Settings → Import &amp; export; Apple Calendar: File → Export). Only events in the range you choose, and only the ones you tick, are imported.</p>
      <div class="row wrap"><button class="btn" data-act="pick">${raw(icon("upload"))}${fileName ? `Change file (${fileName})` : "Choose .ics file"}</button></div>
      ${text ? html`<div class="row wrap" style="margin-top:12px"><label class="field grow"><span>From</span><input class="input" type="date" data-from value="${from}"></label><label class="field grow"><span>To</span><input class="input" type="date" data-to value="${to}"></label><label class="field grow"><span>Calendar name</span><input class="input" data-cal value="${calName}" placeholder="e.g. Personal" autocomplete="off"></label></div>
        <div class="btn-row" style="margin:10px 0"><button class="btn small" data-act="all">Select all</button><button class="btn small" data-act="none">Select none</button><span class="small muted">${events.filter((x) => x.on).length} of ${events.length} selected</span></div>
        <div class="stack-sm">${events.map((ev, i) => html`<label class="switch" style="padding:6px 0"><input type="checkbox" data-ev="${i}" ${ev.on ? "checked" : ""} ${ev.dupe ? "disabled" : ""}><span><span class="t">${ev.rec.title}</span><br><span class="d">${formatDay(ev.rec.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${ev.rec.all_day ? " · all day" : ` · ${String(ev.rec.start).slice(11, 16)}`}${ev.rec.location ? ` · ${ev.rec.location}` : ""}${ev.dupe ? " · already imported" : ""}</span></span></label>`)}</div>
        ${events.length ? html`<div class="btn-row end" style="margin-top:14px"><button class="btn primary" data-act="import">Import selected</button></div>` : html`<p class="muted">No events in that range.</p>`}` : ""}`);
  }
  function load() {
    const existing = new Set(ctx.store.all("event").map((e) => `${e.source?.uid}|${e.source?.occurrence}`));
    events = icsToEventRecords(text, { from, to, tz: ctx.tz(), calendarName: calName || undefined }).map((rec) => {
      const dupe = existing.has(`${rec.source.uid}|${rec.source.occurrence}`);
      return { rec, on: !dupe, dupe };
    });
    render();
  }
  render();
  on(el, "click", "[data-act]", async (e, b) => {
    try {
      const act = b.dataset.act;
      if (act === "pick") {
        const [f] = await pickFiles({ accept: ".ics,text/calendar" });
        if (!f) return;
        text = await f.text();
        fileName = f.name;
        return load();
      }
      if (act === "all" || act === "none") { for (const x of events) if (!x.dupe) x.on = act === "all"; return render(); }
      if (act === "import") {
        const chosen = events.filter((x) => x.on).map((x) => makeEvent({ ...x.rec, calendar: calName || x.rec.calendar }));
        await ctx.store.putMany(chosen);
        toast(`Imported ${chosen.length} event${chosen.length === 1 ? "" : "s"}`);
        return ctx.navigate("#/timeline");
      }
    } catch (err) { errorToast(err); }
  });
  on(el, "change", "[data-from],[data-to],[data-cal],[data-ev]", (e, t) => {
    if (t.dataset.ev != null) { events[Number(t.dataset.ev)].on = t.checked; return; }
    from = el.querySelector("[data-from]").value || from;
    to = el.querySelector("[data-to]").value || to;
    calName = el.querySelector("[data-cal]").value;
    load();
  });
}

// ---------------- backup ----------------

function backup(el, ctx) {
  el.innerHTML = String(html`<h2 class="view-title">Restore a backup</h2>
    <p class="view-sub">Choose an export .zip made by this app. Entries already on this device are kept as they are; only missing ones are added.</p>
    <button class="btn primary" data-act="pick">${raw(icon("upload"))}Choose backup .zip</button><div data-out style="margin-top:14px"></div>`);
  on(el, "click", "[data-act=pick]", async () => {
    const [f] = await pickFiles({ accept: ".zip,application/zip" });
    if (!f) return;
    const out = el.querySelector("[data-out]");
    out.innerHTML = `<div class="spinner"></div>`;
    try {
      const { restoreZip } = await import("../data/export.js");
      const r = await restoreZip(ctx, f);
      out.innerHTML = String(html`<div class="notice ok">${raw(icon("check"))}<span>Added ${r.added} records and ${r.media} media files; ${r.skipped} were already here.${r.problems.length ? ` ${r.problems.length} files couldn't be read.` : ""}</span></div>`);
    } catch (err) { out.innerHTML = ""; errorToast(err); }
  });
}
