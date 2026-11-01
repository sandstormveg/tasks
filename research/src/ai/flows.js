// AI flows with their consent step. Before any journal text leaves the
// device, you see what will be sent (how many entries, which dates, what's
// excluded and why) and confirm.

import { html, raw, sheet, toast, errorToast, on } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { buildContext, describeContext } from "../core/context.js";
import { makeProposal, makeInterpretation, makeQuestion, aiReadable } from "../core/model.js";
import { addDays } from "../core/dates.js";
import { toBase64 } from "../core/crypto.js";

export async function consentSheet(ctx, { title, what, pack, extra = "" }) {
  return sheet({
    title,
    body: html`<div class="notice ai">${raw(icon("shield"))}<div>
        <div><b>${what}</b></div>
        ${pack ? html`<div class="small" style="margin-top:4px">${describeContext(pack)}</div>` : ""}
        <div class="small" style="margin-top:4px">Sent to Anthropic's API with your key, model ${ctx.settings().ai.model}. Not used to train models (API default). Nothing is changed in your journal until you review the result.</div>
      </div></div>${extra}`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Send</button>`,
    setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close(true)),
  }).then((v) => v === true);
}

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

/** In-app version of the steward: propose meta-record updates from recent entries. */
export async function proposeUpdates(ctx) {
  const range = await sheet({
    title: "Look for patterns",
    body: html`<p style="margin-top:0">An AI reads recent entries and suggests a few <b>hypotheses or questions</b>, each with quotes from your entries as evidence. You decide what, if anything, joins your meta-record.</p>
      <div class="chips" data-range>
        <button class="chip" data-d="30">Last 30 days</button><button class="chip on" data-d="90">Last 3 months</button><button class="chip" data-d="365">Last year</button><button class="chip" data-d="all">Everything</button></div>
      <p class="hint">Entries marked No AI or Sealed are never included.</p>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Continue</button>`,
    setup: (d, close) => {
      let days = "90";
      on(d, "click", "[data-d]", (e, b) => { days = b.dataset.d; for (const c of d.querySelectorAll("[data-d]")) c.classList.toggle("on", c === b); });
      d.querySelector("[data-ok]").addEventListener("click", () => close(days));
    },
  });
  if (!range) return null;
  const today = ctx.today();
  const from = range === "all" ? undefined : addDays(today, -Number(range));
  const prefs = ctx.prefs();
  const pack = buildContext(ctx.store.all("entry"), {
    from, to: today, days: ctx.store.all("day"), claims: ctx.store.all("claim"),
    questions: ctx.store.all("question"),
    prefs: { mutedTopics: (prefs.muted_topics || []).map((m) => m.topic || m), neverKinds: prefs.never_kinds || [] },
  });
  if (!pack.includedIds.length) { toast("No AI-readable entries in that range."); return null; }
  if (!(await consentSheet(ctx, { title: "Send entries for pattern-finding?", what: "Look for patterns in your entries", pack }))) return null;
  const close = toast("Reading your entries… this can take a minute.", { timeout: 0 });
  try {
    const ai = await ctx.ai.get();
    const res = await ai.proposeUpdates(pack.text, { max: 5 });
    close();
    const author = `ai:${res.model || ai.model}`;
    const existing = new Set(ctx.store.all("claim").map((c) => c.id));
    const muted = new Set((prefs.muted_topics || []).map((m) => m.topic || m));
    let dropped = 0;
    const saved = [];
    for (const p of res.proposals || []) {
      if ((p.op === "revise-claim" || p.op === "retire-claim") && !existing.has(p.target)) { dropped++; continue; }
      if (p.topic && muted.has(p.topic)) { dropped++; continue; }
      if ((prefs.never_kinds || []).includes(p.question_kind || p.op)) { dropped++; continue; }
      const payload = p.op === "add-question" ? { text: p.question_text, kind: p.question_kind || "gap", topic: p.topic || undefined, sensitivity: p.sensitivity }
        : p.op === "link-entries" ? { entries: [...new Set(p.evidence.map((e) => e.entry))], note: p.rationale }
          : p.op === "retire-claim" ? { reason: p.rationale }
            : { section: p.section || "orientation", statement: p.statement, confidence: p.confidence, expects: p.expects || undefined, would_change_if: p.would_change_if || undefined, topic: p.topic || undefined };
      const rec = makeProposal({
        op: p.op, target: p.target || undefined, author, predicted_acceptance: clamp01(p.predicted_acceptance), payload,
        rationale: p.rationale, evidence: p.evidence, alternatives: p.alternatives,
        coverage: { from: pack.range.from, to: pack.range.to, entries: pack.includedIds.length, note: res.coverage_note || pack.coverage.note },
        source: { via: "in-app" },
      }, { now: ctx.now() });
      saved.push(await ctx.store.put(rec));
    }
    toast(saved.length ? `${saved.length} proposal${saved.length === 1 ? "" : "s"} to review${dropped ? ` (${dropped} dropped by your boundaries)` : ""}` : "Nothing well-supported enough to propose — that's a fine outcome.", { timeout: 6000 });
    if (saved.length) ctx.navigate("#/reflect/review");
    return saved;
  } catch (err) { close(); errorToast(err); return null; }
}

function bulletList(items) {
  return (items || []).filter(Boolean).map((x) => `- ${x}`).join("\n");
}

/** AI reading of an imported document — saved as a separate, labelled interpretation. */
export async function readDocument(ctx, entry) {
  if (!aiReadable(entry)) return toast("AI reading is off for this document.");
  const d = entry.document || {};
  const original = (entry.media || []).find((m) => m.id === d.original);
  const what = `Read “${d.title || "this document"}”${original ? " (including the original file)" : ""}${d.text ? " and its text" : ""}`;
  if (!(await consentSheet(ctx, { title: "Send this document for an AI reading?", what, extra: html`<p class="small muted">The reading is saved separately from the document and your thoughts, labelled as AI hypotheses. You can dismiss it.</p>` }))) return;
  const close = toast("Reading…", { timeout: 0 });
  try {
    const args = { title: d.title, author: d.author, role: d.author_role, date: d.date, text: d.text };
    if (original) {
      const blob = await ctx.store.getBlob(original.path, { fetchRemote: ctx.sync.configured() ? (sha) => ctx.sync.fetchBlob(sha) : undefined });
      if (blob && blob.size < 24 * 1024 * 1024) {
        const b64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
        if (original.mime === "application/pdf") args.pdfBase64 = b64;
        else if (original.mime?.startsWith("image/")) { args.imageBase64 = b64; args.imageMime = original.mime; }
        else if (original.mime?.startsWith("text/")) args.text = [args.text, await blob.text()].filter(Boolean).join("\n\n");
      }
    }
    const ai = await ctx.ai.get();
    const r = await ai.readDocument(args);
    close();
    const author = d.author || "the author";
    const body = [
      `**What ${author} wrote (summarised)**`, r.what_the_author_wrote, "",
      r.possible_themes?.length ? `**Possible themes — AI hypotheses**\n${bulletList(r.possible_themes)}\n` : "",
      r.questions_to_consider?.length ? `**Questions you might consider**\n${bulletList(r.questions_to_consider)}\n` : "",
      r.exercises_mentioned?.length ? `**Suggestions ${author} mentioned**\n${bulletList(r.exercises_mentioned)}` : "",
    ].filter((x) => x !== "").join("\n");
    await ctx.store.put(makeInterpretation({ kind: "document-reading", of: [entry.id], author: `ai:${r.model || ai.model}`, body, source: { questions: r.questions_to_consider } }, { now: ctx.now() }));
    if (r.questions_to_consider?.length) {
      const picked = await sheet({
        title: "Keep any of these questions?",
        body: html`<p class="small muted" style="margin-top:0">Optional. Kept questions are marked sensitive — they only appear in Reflect, never on Today.</p>
          <div class="stack-sm">${r.questions_to_consider.map((q, i) => html`<label class="switch"><input type="checkbox" data-i="${i}"><span class="t" style="font-weight:500">${q}</span></label>`)}</div>`,
        foot: html`<button class="btn" data-close>None</button><button class="btn primary" data-ok>Keep selected</button>`,
        setup: (dlg, cl) => dlg.querySelector("[data-ok]").addEventListener("click", () => cl([...dlg.querySelectorAll("[data-i]:checked")].map((x) => Number(x.dataset.i)))),
      });
      for (const i of picked || []) {
        await ctx.store.put(makeQuestion({ text: r.questions_to_consider[i], kind: "document", origin: "document", sensitivity: "high", evidence: [{ entry: entry.id }], source: { entry: entry.id, via: "ai-reading" } }, { now: ctx.now() }));
      }
    }
    toast("Reading saved — labelled as AI hypotheses.");
  } catch (err) { close(); errorToast(err); }
}
