// The living meta-record: an evidence-linked, revisable model of what seems to
// be going on in your life — kept strictly separate from the journal itself.
//
// How it stays honest (mirrors the Atlas steward: "only a human audit promotes
// anything"):
//   - AI never writes claims directly. It writes *proposals*.
//   - Every proposal cites evidence as verbatim quotes; quotes are checked
//     against the cited entry, and an unverifiable quote is shown as such.
//   - A proposal citing a private (no-AI / sealed) entry is flagged as a
//     policy violation, not silently accepted.
//   - You accept, correct, reject (with a reason) or defer. Claims keep their
//     full history, so an earlier interpretation is never lost.
//   - Proposals carry the author's predicted chance you'll accept them. Your
//     decisions score that prediction (Brier), so the system's model of you is
//     itself something you can audit.

import { entryText, dayText, aiReadable, makeClaim, makeQuestion, makeInterpretation } from "./model.js";

export function normalizeQuoteText(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sourceText(rec) {
  if (!rec) return "";
  if (rec.type === "entry") return entryText(rec);
  if (rec.type === "day") return dayText(rec);
  if (rec.type === "question") return rec.text || "";
  return rec.body || "";
}

/**
 * Check each evidence item: does the cited record exist, may it be cited, and
 * does the quote appear in it verbatim (modulo whitespace/quote style/case)?
 * lookup(id) -> record | undefined
 */
export function verifyEvidence(evidence, lookup) {
  return (evidence || []).map((ev) => {
    const ref = ev.entry || ev.ref || ev.day;
    const rec = ref ? lookup(ref) : undefined;
    if (!rec || rec.deleted) return { ...ev, verified: false, problem: "missing-source" };
    if (rec.type === "entry" && !aiReadable(rec)) return { ...ev, verified: false, problem: "private-source" };
    if (!ev.quote) return { ...ev, verified: false, problem: "no-quote" };
    const hay = normalizeQuoteText(sourceText(rec));
    const needle = normalizeQuoteText(ev.quote);
    if (needle.length < 3) return { ...ev, verified: false, problem: "quote-too-short" };
    return hay.includes(needle) ? { ...ev, verified: true } : { ...ev, verified: false, problem: "quote-not-found" };
  });
}

export const EVIDENCE_PROBLEMS = {
  "missing-source": "Cited entry not found",
  "private-source": "Cites an entry marked No AI or Sealed — this should not have been read",
  "no-quote": "No quote given",
  "quote-too-short": "Quote too short to check",
  "quote-not-found": "Quote not found in the entry — possibly paraphrased or invented",
};

export function evidenceSummary(checked) {
  const n = checked.length;
  const ok = checked.filter((e) => e.verified).length;
  const privateHits = checked.filter((e) => e.problem === "private-source").length;
  return { n, verified: ok, unverified: n - ok, privateHits };
}

function dedupeEvidence(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const k = `${e.entry || e.ref || e.day}|${normalizeQuoteText(e.quote)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const { verified, problem, ...clean } = e;
    out.push(clean);
  }
  return out;
}

/**
 * Apply your decision on a proposal.
 * decision: {action: "accept"|"correct"|"reject"|"defer", statement?, text?, section?,
 *            confidence?, reason?, note?, snoozeUntil?}
 * ctx: {lookup(id), now}
 * Returns {proposal, upserts: [records to save], preference?: {...}}
 */
export function applyDecision(proposal, decision, ctx) {
  const now = ctx.now;
  const p = { ...proposal, decided: now, decision: { action: decision.action } };
  if (decision.reason) p.decision.reason = decision.reason;
  if (decision.note) p.decision.note = decision.note;
  const upserts = [];
  const payload = proposal.payload || {};
  const checked = verifyEvidence(proposal.evidence, ctx.lookup);
  const goodEvidence = dedupeEvidence(checked.filter((e) => e.verified));

  if (decision.action === "reject") {
    p.status = "rejected";
    const out = { proposal: p, upserts };
    if (decision.reason === "sensitive") out.preference = { neverKind: payload.kind || proposal.op, topic: payload.topic };
    return out;
  }
  if (decision.action === "defer") {
    p.status = "deferred";
    p.snooze_until = decision.snoozeUntil;
    delete p.decided;
    return { proposal: p, upserts };
  }

  const corrected = decision.action === "correct";
  p.status = corrected ? "corrected" : "accepted";
  const by = proposal.author || "ai";

  switch (proposal.op) {
    case "add-claim": {
      const statement = (corrected && decision.statement) || payload.statement;
      if (corrected && decision.statement && decision.statement !== payload.statement) p.decision.final = decision.statement;
      const claim = makeClaim({
        section: decision.section || payload.section || "orientation",
        statement,
        origin: corrected ? "ai-corrected" : "ai-accepted",
        confidence: decision.confidence || payload.confidence || "tentative",
        evidence: goodEvidence,
        alternatives: proposal.alternatives || [],
        would_change_if: payload.would_change_if,
        expects: payload.expects,
        coverage: proposal.coverage,
        history: [
          { at: proposal.created, action: "proposed", by, statement: payload.statement, proposal: proposal.id },
          { at: now, action: corrected ? "corrected" : "accepted", by: "self", statement, proposal: proposal.id },
        ],
      }, { now });
      p.result = claim.id;
      upserts.push(claim);
      break;
    }
    case "revise-claim": {
      const target = ctx.lookup(proposal.target);
      if (!target || target.type !== "claim") throw new Error("The claim this revises no longer exists.");
      const statement = (corrected && decision.statement) || payload.statement || target.statement;
      if (corrected && decision.statement && decision.statement !== payload.statement) p.decision.final = decision.statement;
      const updated = {
        ...target,
        statement,
        confidence: decision.confidence || payload.confidence || target.confidence,
        evidence: dedupeEvidence([...(target.evidence || []), ...goodEvidence]),
        alternatives: [...new Set([...(target.alternatives || []), ...(proposal.alternatives || [])])],
        would_change_if: payload.would_change_if || target.would_change_if,
        expects: payload.expects || target.expects,
        status: target.status === "retired" ? "active" : target.status,
        updated: now,
        history: [...(target.history || []),
          { at: proposal.created, action: "revision-proposed", by, statement: payload.statement, previous: target.statement, proposal: proposal.id },
          { at: now, action: corrected ? "corrected" : "revised", by: "self", statement, previous: target.statement, proposal: proposal.id }],
      };
      upserts.push(updated);
      p.result = target.id;
      break;
    }
    case "retire-claim": {
      const target = ctx.lookup(proposal.target);
      if (!target || target.type !== "claim") throw new Error("The claim this retires no longer exists.");
      upserts.push({
        ...target, status: "retired", updated: now,
        evidence: dedupeEvidence([...(target.evidence || []), ...goodEvidence]),
        history: [...(target.history || []), { at: now, action: "retired", by: "self", note: decision.note || payload.reason, proposal: proposal.id }],
      });
      p.result = target.id;
      break;
    }
    case "add-question": {
      const text = (corrected && decision.text) || payload.text;
      const q = makeQuestion({
        text, kind: payload.kind || "gap", origin: by === "self" ? "self" : "ai", topic: payload.topic,
        rationale: proposal.rationale, evidence: goodEvidence, sensitivity: payload.sensitivity || "low",
        source: { proposal: proposal.id },
      }, { now });
      upserts.push(q);
      p.result = q.id;
      break;
    }
    case "link-entries": {
      const conn = makeInterpretation({
        kind: "connection", of: payload.entries || [], author: by, body: (corrected && decision.note) || payload.note || proposal.rationale || "",
        source: { proposal: proposal.id, accepted_by: "self" },
      }, { now });
      upserts.push(conn);
      p.result = conn.id;
      break;
    }
    default:
      throw new Error(`Unknown proposal op ${proposal.op}`);
  }
  return { proposal: p, upserts };
}

/** Your own edit to a claim, recorded in its history. */
export function editClaim(claim, changes, now) {
  const entry = { at: now, action: "edited", by: "self" };
  if (changes.statement && changes.statement !== claim.statement) { entry.statement = changes.statement; entry.previous = claim.statement; }
  if (changes.note) entry.note = changes.note;
  return { ...claim, ...changes, updated: now, history: [...(claim.history || []), entry] };
}

export function retireClaim(claim, note, now) {
  return { ...claim, status: "retired", updated: now, history: [...(claim.history || []), { at: now, action: "retired", by: "self", note }] };
}

export function markUnderReview(claim, note, now) {
  return { ...claim, status: "under-review", updated: now, history: [...(claim.history || []), { at: now, action: "under-review", by: "self", note }] };
}

/**
 * Calibration of an author's predicted_acceptance against your decisions.
 * Accepted and corrected count as "taken up" (1), rejected as 0; deferred and
 * pending are excluded. Reports Brier score, the base-rate reference, skill.
 */
export function calibration(proposals, { author } = {}) {
  const decided = proposals.filter((p) => (p.status === "accepted" || p.status === "corrected" || p.status === "rejected")
    && typeof p.predicted_acceptance === "number" && (!author || p.author === author));
  const n = decided.length;
  const outcomes = decided.map((p) => (p.status === "rejected" ? 0 : 1));
  const preds = decided.map((p) => p.predicted_acceptance);
  if (!n) return { n: 0, note: "No decided proposals with a prediction yet." };
  const brier = preds.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / n;
  const base = outcomes.reduce((a, b) => a + b, 0) / n;
  const ref = base * (1 - base);
  const skill = ref > 0 ? 1 - brier / ref : null;
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0001].slice(0, -1).map((lo, i, arr) => {
    const hi = [0.2, 0.4, 0.6, 0.8, 1.0001][i];
    const idx = preds.map((p, k) => (p >= lo && p < hi ? k : -1)).filter((k) => k >= 0);
    return { lo, hi: Math.min(1, hi), n: idx.length, predicted: idx.length ? idx.reduce((s, k) => s + preds[k], 0) / idx.length : null, actual: idx.length ? idx.reduce((s, k) => s + outcomes[k], 0) / idx.length : null };
  });
  const meanPred = preds.reduce((a, b) => a + b, 0) / n;
  let note;
  if (n < 10) note = `Only ${n} decided proposal${n === 1 ? "" : "s"} — too few to judge calibration.`;
  else if (meanPred - base > 0.15) note = "Overconfident: proposals are taken up less often than predicted.";
  else if (base - meanPred > 0.15) note = "Underconfident: proposals are taken up more often than predicted.";
  else note = "Predictions roughly match how often you take proposals up.";
  const reasons = {};
  for (const p of decided) if (p.status === "rejected") { const r = p.decision?.reason || "unspecified"; reasons[r] = (reasons[r] || 0) + 1; }
  return { n, brier, base, meanPred, skill, bins, note, reasons };
}

/** Contradicting evidence on active claims: the places your model of yourself was surprised. */
export function surprises(claims, proposals) {
  const out = [];
  const active = new Map(claims.filter((c) => c.status !== "retired").map((c) => [c.id, c]));
  for (const p of proposals) {
    if (p.status !== "pending") continue;
    const claim = p.target ? active.get(p.target) : null;
    for (const ev of p.evidence || []) {
      if (ev.stance === "contradicts") out.push({ proposal: p, claim, evidence: ev });
    }
  }
  for (const c of active.values()) {
    for (const ev of c.evidence || []) if (ev.stance === "contradicts") out.push({ proposal: null, claim: c, evidence: ev });
  }
  return out;
}

export function claimsBySection(claims) {
  const map = new Map();
  for (const c of claims) {
    if (!map.has(c.section)) map.set(c.section, []);
    map.get(c.section).push(c);
  }
  for (const list of map.values()) list.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  return map;
}

/** Proposals ready for review now (pending, or deferred past their snooze). */
export function reviewQueue(proposals, nowIsoStr) {
  return proposals.filter((p) => p.status === "pending" || (p.status === "deferred" && (!p.snooze_until || p.snooze_until <= nowIsoStr)))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
