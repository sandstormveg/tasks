// Reflect: the living meta-record and everything that feeds it.
//
//   Overview   — current hypotheses by section, each linked to evidence
//   Review     — proposals awaiting your decision (accept/correct/reject/later)
//   Questions  — open questions, ranked by reasons you can see
//   Patterns   — exploratory stats over your own days, predict-first
//   Changes    — how your meta-record has changed, and why
//
// The meta-record is a model, not a verdict: you can correct, retire or
// overrule anything, and its history is kept.

import { html, raw, on, sheet, toast, errorToast, promptSheet, confirmSheet } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { CLAIM_SECTIONS, CONFIDENCE_LEVELS, PROPOSAL_OPS, REJECT_REASONS, QUESTION_KINDS, makeClaim, makeQuestion, makeEntry, normRating } from "../core/model.js";
import { verifyEvidence, evidenceSummary, applyDecision, calibration, surprises, claimsBySection, reviewQueue, markUnderReview } from "../core/metarecord.js";
import { rankQuestions } from "../core/prompts.js";
import { compareGroups, ratingSummary, monthlyRatings, coverage, onScale } from "../core/stats.js";
import { formatDay, formatMonth, addDays, compareDays, weekdayIndex, daysBetween } from "../core/dates.js";
import { originBadge, authorBadge, evidenceList, coverageLine, whyList } from "../ui/components.js";
import { newId } from "../core/ids.js";

const TABS = [["", "Overview"], ["review", "Review"], ["questions", "Questions"], ["patterns", "Patterns"], ["changes", "Changes"]];

export async function mount(el, ctx, route, ui) {
  const tab = route.params[0] || "";
  ui.setTitle("Reflect");

  function lookup(id) { return ctx.store.get(id); }

  function tabsHtml() {
    const pending = reviewQueue(ctx.store.all("proposal"), ctx.today()).length;
    const open = ctx.store.all("question").filter((q) => q.status === "open").length;
    return html`<nav class="tabs">${TABS.map(([k, label]) => html`<a href="#/reflect${k ? "/" + k : ""}" class="${k === tab ? "active" : ""}">${label}${k === "review" && pending ? html`<span class="count">${pending}</span>` : ""}${k === "questions" && open ? html`<span class="count" style="background:var(--ink-3)">${open}</span>` : ""}</a>`)}</nav>`;
  }

  function render() {
    const body = tab === "review" ? reviewHtml() : tab === "questions" ? questionsHtml() : tab === "patterns" ? patternsHtml() : tab === "changes" ? changesHtml() : overviewHtml();
    el.innerHTML = String(html`${tabsHtml()}${body}`);
    ctx.media.hydrate(el);
  }

  // ---------- overview ----------
  function overviewHtml() {
    const claims = ctx.store.all("claim");
    const active = claims.filter((c) => c.status !== "retired");
    const bySection = claimsBySection(active);
    const sur = surprises(claims, ctx.store.all("proposal")).slice(0, 3);
    const pending = reviewQueue(ctx.store.all("proposal"), ctx.today()).length;
    const retired = claims.filter((c) => c.status === "retired");
    return html`
      <p class="view-sub">A revisable picture built from your entries. Every statement links to its evidence; nothing becomes part of it without you. The original entries remain the record.</p>
      ${pending ? html`<a class="notice ai" href="#/reflect/review" style="text-decoration:none;color:inherit;margin-bottom:12px">${raw(icon("sparkle"))}<span class="grow"><b>${pending} proposal${pending === 1 ? "" : "s"}</b> waiting for your review.</span>${raw(icon("chevron"))}</a>` : ""}
      ${sur.length ? html`<div class="card flat" style="margin-bottom:14px"><div class="kind small faint" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em">Where you surprised your model</div>
        ${sur.map((s) => html`<div style="margin-top:10px"><div class="small muted">${s.claim ? html`Against: “${s.claim.statement}”` : "A pending proposal"}</div><q class="prose" style="font-size:1rem">${s.evidence.quote}</q>
          <div class="btn-row" style="margin-top:6px">${s.claim ? html`<a class="btn small" href="#/claim/${s.claim.id}">Look again</a>` : html`<a class="btn small" href="#/reflect/review">Review</a>`}</div></div>`)}
        <p class="small faint" style="margin-bottom:0">Contradicting evidence is the most informative kind: has something changed, or was the pattern never quite right?</p></div>` : ""}
      <div class="btn-row" style="margin-bottom:6px">
        ${ctx.ai.configured() && ctx.settings().ai.patterns ? html`<button class="btn" data-act="propose">${raw(icon("sparkle"))}Look for patterns</button>` : ""}
        <button class="btn" data-act="changed">${raw(icon("history"))}Something's changed</button>
        <button class="btn ghost" data-act="steward">${raw(icon("info"))}Steward</button>
      </div>
      ${CLAIM_SECTIONS.map((s) => {
        const list = bySection.get(s.id) || [];
        return html`<div class="section-title row between"><span>${s.label}</span><button class="btn small ghost" data-act="add-claim" data-section="${s.id}">${raw(icon("plus"))}Add</button></div>
          ${list.length ? list.map((c) => claimCard(c)) : html`<p class="small faint" style="margin:0 0 6px">${s.hint}</p>`}`;
      })}
      ${retired.length ? html`<details class="layer" style="margin-top:22px"><summary>${raw(icon("history"))}Retired (${retired.length}) — no longer fits, kept for the record</summary><div>${retired.map((c) => claimCard(c))}</div></details>` : ""}`;
  }

  function claimCard(c) {
    const checked = verifyEvidence(c.evidence, lookup);
    const sum = evidenceSummary(checked);
    return html`<a class="claim ${c.status === "retired" ? "retired" : ""}" href="#/claim/${c.id}" style="display:block;color:inherit;text-decoration:none">
      <div class="statement">${c.statement}</div>
      <div class="claim-meta">${originBadge(c.origin)}<span class="badge" title="${CONFIDENCE_LEVELS[c.confidence] || ""}">${c.confidence}</span>
        ${c.status === "under-review" ? html`<span class="badge warn">under review</span>` : ""}
        <span>${sum.n ? `${sum.verified}/${sum.n} quotes verified` : "no evidence linked"}</span>
        ${c.coverage?.from ? html`<span>${formatDay(c.coverage.from, { month: "short", year: "numeric" })}–${formatDay(c.coverage.to, { month: "short", year: "numeric" })}</span>` : ""}
        <span>updated ${formatDay(String(c.updated).slice(0, 10), { day: "numeric", month: "short" })}</span></div></a>`;
  }

  // ---------- review ----------
  function reviewHtml() {
    const queue = reviewQueue(ctx.store.all("proposal"), ctx.today());
    const all = ctx.store.all("proposal");
    const cal = calibration(all);
    const byAuthor = [...new Set(all.map((p) => p.author))].map((a) => ({ a, c: calibration(all, { author: a }) })).filter((x) => x.c.n);
    return html`
      <p class="view-sub">Suggestions from an AI (in the app, or a Claude Code steward). Each is a hypothesis with quotes from your entries. Accepting adds it to your meta-record; correcting keeps your wording; rejecting teaches it what not to suggest.</p>
      ${!queue.length ? html`<div class="empty">${raw(icon("check"))}<h3>Nothing to review</h3><p>${ctx.ai.configured() ? "Ask for suggestions from Overview → Look for patterns, or let a steward session propose some." : "Proposals arrive from a Claude Code steward session, or from the in-app AI once you add an API key in Settings → AI."}</p></div>` : ""}
      ${queue.map((p) => proposalCard(p))}
      <div class="section-title">How well does the AI predict you?</div>
      <div class="card flat">
        ${cal.n ? html`<div class="stat-grid">
            <div class="stat"><div class="v">${cal.n}</div><div class="k">decided proposals</div></div>
            <div class="stat"><div class="v">${Math.round(cal.base * 100)}%</div><div class="k">you took up</div></div>
            <div class="stat"><div class="v">${Math.round(cal.meanPred * 100)}%</div><div class="k">it predicted</div></div>
            <div class="stat"><div class="v">${cal.brier.toFixed(2)}</div><div class="k">Brier score (0 is perfect)</div></div></div>
          <p class="small" style="margin-bottom:0">${cal.note}${cal.skill != null && cal.n >= 10 ? ` Skill vs. always guessing the base rate: ${cal.skill >= 0 ? "+" : ""}${cal.skill.toFixed(2)}.` : ""}</p>
          ${Object.keys(cal.reasons).length ? html`<p class="small muted">Why you rejected: ${Object.entries(cal.reasons).map(([r, n]) => `${(REJECT_REASONS.find((x) => x.id === r) || { label: r }).label} (${n})`).join(" · ")}</p>` : ""}
          ${byAuthor.length > 1 ? html`<p class="small muted">${byAuthor.map(({ a, c }) => `${a}: Brier ${c.brier.toFixed(2)} over ${c.n}`).join(" · ")}</p>` : ""}`
          : html`<p class="small muted" style="margin:0">Each proposal comes with the AI's own estimate of whether you'll accept it. As you decide, this shows how calibrated its model of you is — a check on the checker.</p>`}
      </div>`;
  }

  function proposalCard(p) {
    const checked = verifyEvidence(p.evidence, lookup);
    const sum = evidenceSummary(checked);
    const pl = p.payload || {};
    const target = p.target ? ctx.store.get(p.target) : null;
    const main = p.op === "add-question" ? pl.text : p.op === "link-entries" ? (pl.note || p.rationale) : p.op === "retire-claim" ? target?.statement : pl.statement;
    return html`<div class="claim proposal" data-pid="${p.id}" style="margin-bottom:12px">
      <div class="row wrap" style="gap:6px;margin-bottom:8px"><span class="badge">${PROPOSAL_OPS[p.op] || p.op}</span>${authorBadge(p.author)}${pl.section ? html`<span class="badge">${(CLAIM_SECTIONS.find((s) => s.id === pl.section) || {}).label}</span>` : ""}${pl.confidence ? html`<span class="badge">${pl.confidence}</span>` : ""}${p.status === "deferred" ? html`<span class="badge warn">back from later</span>` : ""}</div>
      ${p.op === "revise-claim" && target ? html`<div class="small muted">Currently: <span style="text-decoration:line-through">${target.statement}</span></div>` : ""}
      ${p.op === "retire-claim" ? html`<div class="small muted">Retire this claim:</div>` : ""}
      <div class="statement">${main || "(empty)"}</div>
      ${p.rationale && p.op !== "link-entries" ? html`<p class="small muted" style="margin:8px 0 0">${p.rationale}</p>` : ""}
      ${sum.privateHits ? html`<div class="notice danger" style="margin-top:10px">${raw(icon("warn"))}<span>This cites an entry you marked No AI or Sealed. It should never have been read — consider rejecting, and check how it was produced.</span></div>` : ""}
      ${evidenceList(ctx, null, { checked })}
      ${(p.alternatives || []).length ? html`<div class="small" style="margin-top:10px"><b>Other ways to read this:</b><ul style="margin:4px 0 0;padding-left:1.2em">${p.alternatives.map((a) => html`<li>${a}</li>`)}</ul></div>` : ""}
      ${pl.expects ? html`<div class="small" style="margin-top:8px"><b>If this holds, expect:</b> ${pl.expects}</div>` : ""}
      ${pl.would_change_if ? html`<div class="small" style="margin-top:4px"><b>Would change if:</b> ${pl.would_change_if}</div>` : ""}
      ${p.coverage ? html`<div class="small faint" style="margin-top:8px">Based on ${p.coverage.entries ?? "?"} entries, ${p.coverage.from || "?"} → ${p.coverage.to || "?"}. ${p.coverage.note || ""}</div>` : ""}
      ${typeof p.predicted_acceptance === "number" ? html`<div class="small faint" style="margin-top:4px">It expected you'd take this up: ${Math.round(p.predicted_acceptance * 100)}%</div>` : ""}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn small primary" data-act="accept" data-pid="${p.id}">Accept</button>
        <button class="btn small" data-act="correct" data-pid="${p.id}">Edit &amp; accept</button>
        <button class="btn small" data-act="reject" data-pid="${p.id}">Reject</button>
        <button class="btn small ghost" data-act="later" data-pid="${p.id}">Later</button>
      </div></div>`;
  }

  // ---------- questions ----------
  function questionsHtml() {
    const ranked = rankQuestions(ctx.store.all("question"), { today: ctx.today(), prefs: ctx.prefs(), includeSensitive: true });
    const answered = ctx.store.all("question").filter((q) => q.status === "answered").sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    const snoozed = ctx.store.all("question").filter((q) => q.status === "open" && q.snooze_until && compareDays(q.snooze_until.slice(0, 10), ctx.today()) > 0);
    return html`
      <p class="view-sub">Questions worth sitting with — yours, from documents, or suggested and accepted. Answer in a sentence, talk it through, or leave it. Not answering means nothing.</p>
      <div class="btn-row" style="margin-bottom:10px"><button class="btn" data-act="new-q">${raw(icon("plus"))}Add a question</button></div>
      ${!ranked.length ? html`<p class="muted">No open questions right now.</p>` : ""}
      ${ranked.map(({ q, reasons }) => html`<div class="prompt-card">
        <div class="kind">${QUESTION_KINDS[q.kind] || "Question"}${q.sensitivity === "high" ? " · sensitive" : ""}</div>
        <div class="q">${q.text}</div>
        ${q.rationale ? html`<p class="small muted" style="margin:-4px 0 8px">${q.rationale}</p>` : ""}
        <div class="btn-row">
          <a class="btn small primary" href="#/today?q=${q.id}">Answer</a>
          ${ctx.ai.configured() ? html`<a class="btn small" href="#/talk?q=${q.id}">Talk it through</a>` : ""}
          <button class="btn small ghost" data-act="q-snooze" data-qid="${q.id}">Not now</button>
          <button class="btn small ghost" data-act="q-dismiss" data-qid="${q.id}">Dismiss</button>
          <span class="grow"></span>
          <button class="btn icon small ghost" data-act="q-why" data-qid="${q.id}" aria-label="Why this appears">${raw(icon("info"))}</button>
        </div>
        <div class="hidden" data-qwhy="${q.id}">${whyList(reasons)}${(q.evidence || []).length ? evidenceList(ctx, q.evidence) : ""}
          <div class="btn-row" style="margin-top:8px"><button class="btn small ghost" data-act="q-never" data-qid="${q.id}">Never raise “${QUESTION_KINDS[q.kind] || q.kind}” questions</button></div></div>
      </div>`)}
      ${snoozed.length ? html`<details class="layer" style="margin-top:16px"><summary>Resting for now (${snoozed.length})</summary><div>${snoozed.map((q) => html`<div class="small" style="margin-bottom:6px">${q.text} <span class="faint">· back ${formatDay(q.snooze_until.slice(0, 10), { day: "numeric", month: "short" })}</span></div>`)}</div></details>` : ""}
      ${answered.length ? html`<details class="layer" style="margin-top:8px"><summary>Answered (${answered.length})</summary><div>${answered.map((q) => html`<div style="margin-bottom:10px"><div>${q.text}</div><div class="small">${(q.answers || []).map((id) => { const e = ctx.store.get(id); return e ? html`<a href="#/entry/${id}">${formatDay(e.day, { day: "numeric", month: "short", year: "numeric" })}</a> ` : ""; })}<button class="btn small ghost" data-act="q-reopen" data-qid="${q.id}">Reopen</button></div></div>`)}</div></details>` : ""}`;
  }

  // ---------- patterns ----------
  function featureSets() {
    const byDay = new Map();
    const add = (d, f) => { if (!byDay.has(d)) byDay.set(d, new Set()); byDay.get(d).add(f); };
    for (const e of ctx.store.all("entry")) {
      for (const t of e.tags || []) add(e.day, `#${t}`);
      if ((e.media || []).some((m) => m.type === "photo")) add(e.day, "photos");
      if (e.kind === "voice") add(e.day, "voice note");
    }
    for (const ev of ctx.store.all("event")) add(ev.day, "calendar events");
    for (const d of ctx.store.all("day")) for (const em of d.emotions || []) add(d.date, `feeling: ${em}`);
    for (const c of ctx.chapters()) {
      for (const d of ctx.store.all("day")) if (compareDays(d.date, c.from) >= 0 && compareDays(d.date, c.to) <= 0) add(d.date, `during ${c.name}`);
    }
    return byDay;
  }

  function patternsHtml() {
    const days = ctx.store.all("day");
    const rated = days.filter((d) => normRating(d) != null);
    const scale = ctx.prefs().rating_scale || 10;
    const sum = ratingSummary(days);
    const monthly = monthlyRatings(days).slice(-18);
    const entries = ctx.store.all("entry");
    const cov = coverage(entries);
    const preds = ctx.store.config("self-predictions", { list: [] }).list || [];
    const pending = preds.find((p) => !p.revealed);
    // Ask for a fresh guess at most once a week; otherwise show the analysis.
    const revealedNow = route.query.reveal === "1" || preds.some((p) => p.revealed && p.at && daysBetween(p.at.slice(0, 10), ctx.today()) <= 7);

    let analysis = "";
    if (rated.length >= 10) {
      const fs = featureSets();
      const counts = new Map();
      for (const set of fs.values()) for (const f of set) counts.set(f, (counts.get(f) || 0) + 1);
      const feats = [...counts.entries()].filter(([, n]) => n >= 5).map(([f]) => f);
      feats.push("weekend");
      const res = feats.map((f) => ({ f, r: compareGroups(rated, (d) => (f === "weekend" ? [0, 6].includes(weekdayIndex(d.date)) : !!fs.get(d.date)?.has(f))) })).filter((x) => x.r.verdict !== "too-few");
      const higher = res.filter((x) => x.r.verdict === "higher").sort((a, b) => b.r.diff - a.r.diff).slice(0, 6);
      const lower = res.filter((x) => x.r.verdict === "lower").sort((a, b) => a.r.diff - b.r.diff).slice(0, 4);
      const unclear = res.filter((x) => x.r.verdict === "unclear");
      const fmt = (v) => onScale(v, scale).toFixed(1);
      const row = (x) => html`<div class="bar-row"><span><b>${x.f}</b> <span class="faint">${fmt(x.r.meanWith)} vs ${fmt(x.r.meanWithout)} · n=${x.r.nWith}/${x.r.nWithout}</span></span><span class="faint small">${x.r.diff > 0 ? "+" : ""}${(x.r.diff * (scale - 1)).toFixed(1)}</span></div>`;
      analysis = html`
        ${higher.length ? html`<div class="card flat"><h4>Tends to go with higher-rated days</h4>${higher.map(row)}</div>` : ""}
        ${lower.length ? html`<div class="card flat"><h4>Tends to go with lower-rated days</h4>${lower.map(row)}</div>` : ""}
        ${!higher.length && !lower.length ? html`<p class="muted">Nothing stands out clearly yet — which is itself information.</p>` : ""}
        ${unclear.length ? html`<details class="layer" style="margin-top:10px"><summary>No clear difference (${unclear.length})</summary><div class="small muted">${unclear.map((x) => x.f).join(" · ")}</div></details>` : ""}
        <p class="small faint">A difference is shown only when its 95% bootstrap interval excludes zero. These are associations in your own data — not causes. A tag can follow good days as easily as make them.</p>`;
    }
    const maxM = Math.max(1, ...monthly.map((m) => m.mean || 0));
    return html`
      <p class="view-sub">Exploration, not measurement of your worth. Missing ratings are left out, never counted as low; fewer entries means less evidence, not less life.</p>
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><div class="v">${sum.n ? onScale(sum.mean, scale).toFixed(1) : "—"}</div><div class="k">average day (of ${scale})</div></div>
        <div class="stat"><div class="v">${sum.n}</div><div class="k">days rated</div></div>
        <div class="stat"><div class="v">${cov.entries}</div><div class="k">entries</div></div>
        <div class="stat"><div class="v">${cov.days}</div><div class="k">days written</div></div>
      </div>
      ${sum.scales.length > 1 ? html`<div class="notice warn" style="margin-bottom:12px">${raw(icon("warn"))}<span>Your ratings use more than one scale (${sum.scales.map((s) => `1–${s}`).join(", ")}). They're normalised before averaging; treat comparisons across them loosely.</span></div>` : ""}

      <div class="section-title">What goes with your better days?</div>
      ${rated.length < 10 ? html`<p class="muted">Rate at least 10 days to explore this (${rated.length} so far). Ratings are optional — this is just one lens.</p>` :
        !revealedNow ? html`<div class="card">
          <p style="margin-top:0"><b>Before you look:</b> what do you think your best days have in common? Guessing first makes the answer more interesting — and over time shows how well you predict yourself.</p>
          <textarea class="textarea" data-guess placeholder="e.g. time outside, seeing friends, no work…">${pending?.guess || ""}</textarea>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="guess">Save my guess and reveal</button><button class="btn ghost" data-act="reveal">Just show me</button></div></div>`
          : html`${pending || preds.length ? (() => { const last = [...preds].reverse().find((p) => p.revealed); return last?.guess ? html`<div class="card flat" style="margin-bottom:10px"><div class="small faint">Your guess (${formatDay(last.at.slice(0, 10), { day: "numeric", month: "short" })})</div><div class="guess">${last.guess}</div>
              ${last.outcome ? html`<div class="small muted" style="margin-top:6px">You said it ${last.outcome === "matched" ? "matched" : last.outcome === "partly" ? "partly matched" : "didn't match"}.</div>` : html`<div class="btn-row" style="margin-top:8px"><span class="small muted">Did the data match your guess?</span><button class="btn small" data-act="outcome" data-v="matched">Yes</button><button class="btn small" data-act="outcome" data-v="partly">Partly</button><button class="btn small" data-act="outcome" data-v="missed">No — surprise</button></div>`}</div>` : ""; })() : ""}${analysis}`}
      ${preds.filter((p) => p.outcome).length >= 2 ? html`<p class="small muted">Self-prediction so far: ${preds.filter((p) => p.outcome === "matched").length} matched, ${preds.filter((p) => p.outcome === "partly").length} partly, ${preds.filter((p) => p.outcome === "missed").length} surprises.</p>` : ""}

      <div class="section-title">Ratings by month</div>
      ${monthly.length ? html`<div class="card flat">${monthly.map((m) => html`<div class="bar-row"><span>${formatMonth(m.month)}</span><span class="faint small">${onScale(m.mean, scale).toFixed(1)} · ${m.n} day${m.n === 1 ? "" : "s"}</span><span class="bar"><span style="width:${(m.mean / maxM) * 100}%;opacity:${Math.min(1, 0.35 + m.n / 20)}"></span></span></div>`)}
        <p class="small faint" style="margin-bottom:0">Fainter bars rest on fewer rated days. Months with no ratings are skipped, not shown as zero.</p></div>` : html`<p class="muted">No ratings yet.</p>`}

      <div class="section-title">How much you've written</div>
      <div class="card flat">${coverageLine(cov)}</div>`;
  }

  // ---------- changes ----------
  function changesHtml() {
    const events = [];
    for (const c of ctx.store.all("claim")) for (const h of c.history || []) events.push({ at: h.at, h, c });
    for (const p of ctx.store.all("proposal")) if (p.status === "rejected") events.push({ at: p.decided, rejected: p });
    events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const label = { created: "Written", proposed: "Proposed", accepted: "You accepted", corrected: "You corrected and accepted", revised: "You accepted a revision", "revision-proposed": "Revision proposed", retired: "Retired", edited: "You edited", "under-review": "Marked under review" };
    return html`<p class="view-sub">How your meta-record has changed — so you can see an earlier interpretation and why it changed.</p>
      ${events.length ? html`<ul class="history">${events.slice(0, 200).map((ev) => ev.rejected ? html`<li class="self"><div class="when">${String(ev.at).slice(0, 10)} · You rejected (${(REJECT_REASONS.find((r) => r.id === ev.rejected.decision?.reason) || { label: "no reason given" }).label})</div><div class="prev">${ev.rejected.payload?.statement || ev.rejected.payload?.text || ev.rejected.rationale}</div></li>`
        : html`<li class="${ev.h.by === "self" ? "self" : "ai"}"><div class="when">${String(ev.at).slice(0, 10)} · ${label[ev.h.action] || ev.h.action}${ev.h.by && ev.h.by !== "self" ? ` by ${ev.h.by}` : ""}</div>
          <a href="#/claim/${ev.c.id}" style="color:inherit">${ev.h.statement ? html`<div class="st">${ev.h.statement}</div>` : html`<div class="st">${ev.c.statement}</div>`}</a>
          ${ev.h.previous ? html`<div class="prev">${ev.h.previous}</div>` : ""}${ev.h.note ? html`<div class="small muted">${ev.h.note}</div>` : ""}</li>`)}</ul>` : html`<p class="muted">No changes yet.</p>`}`;
  }

  render();
  ui.onStore(() => render());

  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    try {
      if (act === "propose") { const { proposeUpdates } = await import("../ai/flows.js"); return proposeUpdates(ctx); }
      if (act === "steward") return stewardInfo();
      if (act === "changed") return somethingChanged();
      if (act === "add-claim") {
        const text = await promptSheet({ title: (CLAIM_SECTIONS.find((s) => s.id === b.dataset.section) || {}).label, label: "In your own words", multiline: true, placeholder: "e.g. I'm trying to understand what kind of structure helps me, and what kind wears me down.", confirm: "Add" });
        if (!text?.trim()) return;
        await ctx.store.put(makeClaim({ section: b.dataset.section, statement: text.trim(), origin: "self", confidence: "moderate" }, { now: ctx.now() }));
        return toast("Added to your meta-record");
      }
      const p = b.dataset.pid ? ctx.store.get(b.dataset.pid) : null;
      if (p && (act === "accept" || act === "correct" || act === "reject" || act === "later")) return decide(p, act);
      const q = b.dataset.qid ? ctx.store.get(b.dataset.qid) : null;
      if (act === "q-why") return el.querySelector(`[data-qwhy="${CSS.escape(b.dataset.qid)}"]`)?.classList.toggle("hidden");
      if (act === "q-snooze" && q) { await ctx.store.put({ ...q, snooze_until: addDays(ctx.today(), 7), last_shown: ctx.now() }); return toast("It'll come back in a week."); }
      if (act === "q-dismiss" && q) { await ctx.store.put({ ...q, status: "dismissed", feedback: "dismissed" }); await bumpFeedback(`q:${q.kind}`, false); return toast("Dismissed"); }
      if (act === "q-reopen" && q) { await ctx.store.put({ ...q, status: "open" }); return; }
      if (act === "q-never" && q) {
        const pr = ctx.prefs();
        await ctx.savePrefs({ ...pr, never_kinds: [...new Set([...(pr.never_kinds || []), q.kind])] });
        await ctx.store.put({ ...q, status: "dismissed", feedback: "never-this-kind" });
        return toast(`Won't raise “${QUESTION_KINDS[q.kind] || q.kind}” questions. Undo in Settings → Prompts.`);
      }
      if (act === "new-q") {
        const text = await promptSheet({ title: "A question to sit with", label: "Question", multiline: true, placeholder: "e.g. Which forms of structure help me flourish, and which gradually become burdensome?", confirm: "Save" });
        if (text?.trim()) await ctx.store.put(makeQuestion({ text: text.trim(), origin: "self" }, { now: ctx.now() }));
        return;
      }
      if (act === "guess" || act === "reveal") {
        const guess = el.querySelector("[data-guess]")?.value.trim();
        const store = ctx.store.config("self-predictions", { list: [] });
        const list = (store.list || []).filter((x) => x.revealed);
        list.push({ id: newId("sp", ctx.now()), at: ctx.now(), prompt: "What do your best days have in common?", guess: act === "guess" ? guess : undefined, revealed: true });
        await ctx.store.setConfig("self-predictions", { list });
        return;
      }
      if (act === "outcome") {
        const store = ctx.store.config("self-predictions", { list: [] });
        const list = [...(store.list || [])];
        const i = list.map((x) => !!x.revealed && !!x.guess && !x.outcome).lastIndexOf(true);
        if (i >= 0) list[i] = { ...list[i], outcome: b.dataset.v };
        await ctx.store.setConfig("self-predictions", { list });
        if (b.dataset.v === "missed") toast("A surprise is the most informative result — worth a line in your journal?", { action: "Write", onAction: () => ctx.navigate("#/today?prefill=" + encodeURIComponent("What surprised me about my best days: ")) });
      }
    } catch (err) { errorToast(err); }
  });

  async function bumpFeedback(kind, helpful) {
    const { withFeedback } = await import("../core/prompts.js");
    await ctx.savePrefs(withFeedback(ctx.prefs(), kind, helpful));
  }

  async function decide(p, act) {
    const now = ctx.now();
    let decision;
    if (act === "accept") decision = { action: "accept" };
    if (act === "later") decision = { action: "defer", snoozeUntil: addDays(ctx.today(), 14) };
    if (act === "correct") {
      const isQ = p.op === "add-question";
      const v = await sheet({
        title: "Say it your way",
        body: html`<label class="field"><span>${isQ ? "Question" : "Statement"}</span><textarea class="textarea" data-t autofocus>${isQ ? p.payload?.text : p.payload?.statement || ctx.store.get(p.target)?.statement || ""}</textarea></label>
          ${!isQ && p.op !== "link-entries" && p.op !== "retire-claim" ? html`<label class="field"><span>How confident are you?</span><select class="select" data-c>${Object.keys(CONFIDENCE_LEVELS).map((c) => html`<option value="${c}" ${c === (p.payload?.confidence || "tentative") ? "selected" : ""}>${c} — ${CONFIDENCE_LEVELS[c]}</option>`)}</select></label>` : ""}`,
        foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Accept my version</button>`,
        setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ t: d.querySelector("[data-t]").value.trim(), c: d.querySelector("[data-c]")?.value })),
      });
      if (!v?.t) return;
      decision = { action: "correct", statement: v.t, text: v.t, note: p.op === "link-entries" ? v.t : undefined, confidence: v.c };
    }
    if (act === "reject") {
      const reason = await sheet({
        title: "Why doesn't this fit?",
        body: html`<p class="small muted" style="margin-top:0">Optional, but it's how suggestions get better.</p><div class="stack-sm">${REJECT_REASONS.map((r) => html`<button class="day-field" data-r="${r.id}"><span class="v" style="font-family:var(--font-ui)">${r.label}</span></button>`)}</div>`,
        foot: html`<button class="btn" data-skip>Just reject</button>`,
        setup: (d, close) => { on(d, "click", "[data-r]", (e, x) => close(x.dataset.r)); d.querySelector("[data-skip]").addEventListener("click", () => close("")); },
      });
      if (reason === undefined) return;
      decision = { action: "reject", reason: reason || undefined };
    }
    const out = applyDecision(p, decision, { lookup, now });
    for (const r of out.upserts) await ctx.store.put(r);
    await ctx.store.put(out.proposal);
    if (out.preference) {
      const pr = ctx.prefs();
      const next = { ...pr };
      if (out.preference.topic) next.muted_topics = [...(pr.muted_topics || []), { topic: out.preference.topic, until: addDays(ctx.today(), 365) }];
      else if (out.preference.neverKind) next.never_kinds = [...new Set([...(pr.never_kinds || []), out.preference.neverKind])];
      await ctx.savePrefs(next);
      toast(out.preference.topic ? `Won't raise “${out.preference.topic}” for a year. Change in Settings → Prompts.` : "Won't suggest that kind again. Change in Settings → Prompts.", { timeout: 7000 });
    } else {
      toast({ accept: "Added to your meta-record", correct: "Added in your words", reject: "Rejected — noted", defer: "Back in two weeks" }[decision.action]);
    }
  }

  async function somethingChanged() {
    const active = ctx.store.all("claim").filter((c) => c.status === "active");
    const v = await sheet({
      title: "Something's changed",
      body: html`<p class="small muted" style="margin-top:0">Your account comes first. Write what's different; pick anything in your meta-record that may no longer fit. Those get marked “under review” — nothing is deleted.</p>
        <textarea class="textarea" data-t autofocus placeholder="e.g. My priorities have shifted since coming back from the trip…"></textarea>
        ${active.length ? html`<div class="stack-sm" style="margin-top:12px">${active.map((c) => html`<label class="switch"><input type="checkbox" data-c="${c.id}"><span class="t" style="font-weight:500">${c.statement}</span></label>`)}</div>` : ""}`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ t: d.querySelector("[data-t]").value.trim(), ids: [...d.querySelectorAll("[data-c]:checked")].map((x) => x.dataset.c) })),
    });
    if (!v || (!v.t && !v.ids.length)) return;
    let entry;
    if (v.t) entry = await ctx.store.put(makeEntry({ body: v.t, tags: ["change"], source: { system: "living-journal", via: "something-changed" } }, { tz: ctx.tz() }));
    for (const id of v.ids) {
      const c = ctx.store.get(id);
      if (c) await ctx.store.put(markUnderReview(c, entry ? `See entry ${entry.id}` : "Marked under review", ctx.now()));
    }
    toast("Noted — in your own words first.");
  }

  async function stewardInfo() {
    const s = ctx.settings().github;
    const repo = s.owner && s.repo ? `${s.owner}/${s.repo}` : "<your journal data repo>";
    const prompt = `Run the journal steward on ${repo}: follow CLAUDE.md in that repo. Read recent entries only through the privacy-gated context command, write at most 5 proposals to meta/proposals/, run the checks, then commit and push.`;
    await sheet({
      title: "The steward",
      body: html`<p style="margin-top:0">A <b>steward</b> is a Claude Code session (or a scheduled Routine) that works on your journal's data repository the way the Atlas steward does: it reads entries through the same privacy gate as the app, and writes <b>proposals only</b> — never claims, never edits to your entries. They appear here under Review the next time you sync.</p>
        <p class="small muted">It uses your Claude subscription instead of an API key. The rules it follows live in <code>CLAUDE.md</code> in the data repo, seeded on first sync.</p>
        <label class="field"><span>Prompt to start one</span><textarea class="textarea" readonly data-p style="font-family:var(--font-mono);font-size:.85rem">${prompt}</textarea></label>`,
      foot: html`<button class="btn" data-close>Close</button><button class="btn primary" data-copy>Copy prompt</button>`,
      setup: (d) => d.querySelector("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(prompt); toast("Copied"); } catch { d.querySelector("[data-p]").select(); } }),
    });
  }
}
