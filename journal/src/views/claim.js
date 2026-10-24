// One meta-record claim: the statement, its evidence (verified), the
// alternatives, what it predicts, what would change it, and its full history.

import { html, raw, on, sheet, toast, errorToast, confirmSheet } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { CLAIM_SECTIONS, CONFIDENCE_LEVELS } from "../core/model.js";
import { verifyEvidence, editClaim, retireClaim, markUnderReview } from "../core/metarecord.js";
import { coverage } from "../core/stats.js";
import { originBadge, evidenceList, coverageLine } from "../ui/components.js";

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  ui.setTitle("Meta-record", { back: "#/reflect" });

  function render() {
    const c = ctx.store.get(id);
    if (!c) { el.innerHTML = String(html`<div class="empty"><h3>Not found</h3><p><a href="#/reflect">Back to Reflect</a></p></div>`); return; }
    const checked = verifyEvidence(c.evidence, (x) => ctx.store.get(x));
    const evEntries = checked.map((ev) => ctx.store.get(ev.entry || ev.ref)).filter((e) => e?.type === "entry");
    const cov = c.coverage?.from ? coverage(ctx.store.all("entry"), { from: c.coverage.from, to: c.coverage.to }) : evEntries.length ? coverage(evEntries) : null;
    const section = CLAIM_SECTIONS.find((s) => s.id === c.section);
    el.innerHTML = String(html`
      <div class="small faint" style="margin-top:8px">${section?.label || c.section}</div>
      <div class="claim ${c.status === "retired" ? "retired" : ""}" style="margin-top:6px"><div class="statement" style="font-size:1.2rem">${c.statement}</div>
        <div class="claim-meta">${originBadge(c.origin)}<span class="badge" title="${CONFIDENCE_LEVELS[c.confidence] || ""}">${c.confidence}</span>${c.status !== "active" ? html`<span class="badge warn">${c.status}</span>` : ""}</div></div>
      <div class="btn-row" style="margin:12px 0">
        <button class="btn small" data-act="edit">${raw(icon("edit"))}Correct it</button>
        ${c.status !== "under-review" && c.status !== "retired" ? html`<button class="btn small" data-act="review">Mark under review</button>` : ""}
        ${c.status === "retired" ? html`<button class="btn small" data-act="revive">Bring back</button>` : html`<button class="btn small" data-act="retire">No longer true</button>`}
        <a class="btn small" href="#/today?prefill=${encodeURIComponent(`Thinking about: "${c.statement}" — `)}">${raw(icon("edit"))}Write about it</a>
      </div>
      <div class="section-title">Evidence</div>
      ${evidenceList(ctx, null, { checked })}
      ${cov ? html`<div class="section-title">Coverage</div><div class="card flat">${coverageLine(cov)}</div>` : ""}
      ${(c.alternatives || []).length ? html`<div class="section-title">Other ways to read this</div><ul>${c.alternatives.map((a) => html`<li>${a}</li>`)}</ul>` : ""}
      ${c.expects ? html`<div class="section-title">If this holds, expect</div><p>${c.expects}</p>` : ""}
      ${c.would_change_if ? html`<div class="section-title">Would change if</div><p>${c.would_change_if}</p>` : ""}
      ${c.body ? html`<div class="section-title">Your note</div><p class="prose">${c.body}</p>` : ""}
      <div class="section-title">History</div>
      <ul class="history">${[...(c.history || [])].reverse().map((h) => html`<li class="${h.by === "self" ? "self" : "ai"}"><div class="when">${String(h.at).slice(0, 10)} · ${h.action}${h.by ? ` · ${h.by === "self" ? "you" : h.by}` : ""}</div>${h.statement ? html`<div class="st">${h.statement}</div>` : ""}${h.previous ? html`<div class="prev">${h.previous}</div>` : ""}${h.note ? html`<div class="small muted">${h.note}</div>` : ""}</li>`)}</ul>
      <div class="btn-row" style="margin-top:20px"><button class="btn small danger" data-act="delete">Delete permanently</button></div>`);
  }
  render();
  ui.onStore(() => render());

  on(el, "click", "[data-act]", async (e, b) => {
    const c = ctx.store.get(id);
    if (!c) return;
    const act = b.dataset.act;
    try {
      if (act === "edit") {
        const v = await sheet({
          title: "Correct it",
          body: html`<label class="field"><span>Statement</span><textarea class="textarea" data-t autofocus>${c.statement}</textarea></label>
            <label class="field"><span>Confidence</span><select class="select" data-c>${Object.keys(CONFIDENCE_LEVELS).map((k) => html`<option value="${k}" ${k === c.confidence ? "selected" : ""}>${k} — ${CONFIDENCE_LEVELS[k]}</option>`)}</select></label>
            <label class="field"><span>Section</span><select class="select" data-s>${CLAIM_SECTIONS.map((s) => html`<option value="${s.id}" ${s.id === c.section ? "selected" : ""}>${s.label}</option>`)}</select></label>
            <label class="field"><span>Note (optional)</span><input class="input" data-n placeholder="Why you changed it" autocomplete="off"></label>`,
          foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
          setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ statement: d.querySelector("[data-t]").value.trim(), confidence: d.querySelector("[data-c]").value, section: d.querySelector("[data-s]").value, note: d.querySelector("[data-n]").value.trim() || undefined })),
        });
        if (!v?.statement) return;
        const next = editClaim(c, v, ctx.now());
        if (c.origin !== "self" && v.statement !== c.statement) next.origin = "ai-corrected";
        await ctx.store.put(next);
        return toast("Saved — the earlier wording stays in history.");
      }
      if (act === "review") { await ctx.store.put(markUnderReview(c, "Marked under review", ctx.now())); return; }
      if (act === "retire") {
        const note = await sheet({
          title: "No longer true?",
          body: html`<p class="small muted" style="margin-top:0">It moves to Retired and stays in history — the record of who you were is part of the record.</p><input class="input" data-n placeholder="What changed? (optional)" autofocus autocomplete="off">`,
          foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Retire</button>`,
          setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close(d.querySelector("[data-n]").value.trim() || "")),
        });
        if (note === undefined) return;
        await ctx.store.put(retireClaim(c, note || undefined, ctx.now()));
        return toast("Retired");
      }
      if (act === "revive") { await ctx.store.put(editClaim(c, { status: "active", note: "Brought back" }, ctx.now())); return; }
      if (act === "delete") {
        if (!(await confirmSheet("Delete this claim and its history? Retiring keeps the record; deleting removes it.", { danger: true, confirm: "Delete" }))) return;
        await ctx.store.remove(c.id);
        ctx.navigate("#/reflect");
      }
    } catch (err) { errorToast(err); }
  });
}
