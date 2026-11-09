// The privacy gate. Every piece of journal text that goes to an AI — the
// in-app assistant or a Claude Code steward session — is assembled here, and
// only here. No-AI and sealed entries never pass; documents you haven't cleared
// for AI never pass. The result says exactly what was included and excluded so
// the UI can show it before anything is sent.

import { aiReadable, entryText, normRating } from "./model.js";
import { compareDays, addDays, daysBetween } from "./dates.js";
import { coverage, onScale } from "./stats.js";

const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
const attr = (s) => String(s ?? "").replace(/"/g, "'").replace(/\s+/g, " ").trim();

export function gate(entries) {
  const included = [];
  const excluded = { noAi: 0, sealed: 0, documents: 0, deleted: 0 };
  for (const e of entries) {
    if (e.deleted) { excluded.deleted++; continue; }
    if (e.privacy === "sealed" || e.sealed) { excluded.sealed++; continue; }
    if (e.privacy === "no-ai") { excluded.noAi++; continue; }
    if (!aiReadable(e)) { excluded.documents++; continue; }
    included.push(e);
  }
  return { included, excluded };
}

/**
 * Build the context an AI sees.
 * opts: {from, to, maxChars, ids (explicit entry ids), claims, questions, days, prefs, perEntryMax}
 */
export function buildContext(allEntries, opts = {}) {
  const { from, to, maxChars = 150_000, perEntryMax = 6000 } = opts;
  let pool = allEntries.filter((e) => e.type === "entry");
  if (opts.ids) {
    const want = new Set(opts.ids);
    pool = pool.filter((e) => want.has(e.id));
  } else {
    pool = pool.filter((e) => (!from || compareDays(e.day, from) >= 0) && (!to || compareDays(e.day, to) <= 0));
  }
  const { included, excluded } = gate(pool);
  const newestFirst = [...included].sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const parts = [];
  let used = 0;
  const kept = [];
  let truncated = 0;
  for (const e of newestFirst) {
    const text = clip(entryText(e), perEntryMax);
    const tags = (e.tags || []).join(",");
    const block = `<entry id="${e.id}" day="${e.day}" time="${(e.created || "").slice(11, 16)}" kind="${e.kind}"${tags ? ` tags="${attr(tags)}"` : ""}${e.kind === "document" && e.document?.author ? ` written_by="${attr(e.document.author)}"` : ""}>\n${text}\n</entry>`;
    if (used + block.length > maxChars) { truncated++; continue; }
    used += block.length;
    parts.push(block);
    kept.push(e);
  }
  parts.reverse(); // chronological reading order
  const keptIds = new Set(kept.map((e) => e.id));

  // A day with any private (No-AI / sealed / uncleared) entry is private to AI
  // as a whole: its best/hardest moments and feelings often describe the same thing.
  const privateDays = new Set(allEntries.filter((e) => e.type === "entry" && !e.deleted && !aiReadable(e)).map((e) => e.day));
  const dayLines = [], includedDays = [];
  excluded.days = 0;
  for (const d of opts.days || []) {
    if ((from && compareDays(d.date, from) < 0) || (to && compareDays(d.date, to) > 0)) continue;
    if (privateDays.has(d.date)) { excluded.days++; continue; }
    if (d.rating == null && !d.best && !d.hardest && !(d.emotions || []).length) continue;
    includedDays.push(d.date);
    const r = normRating(d) != null ? `${d.rating}/${d.rating_scale || 10}` : "not rated";
    dayLines.push(`<day date="${d.date}" rating="${r}"${d.best ? ` best="${attr(d.best)}"` : ""}${d.hardest ? ` hardest="${attr(d.hardest)}"` : ""}${(d.emotions || []).length ? ` feelings="${attr(d.emotions.join(", "))}"` : ""}/>`);
  }

  const claimLines = (opts.claims || []).filter((c) => c.status !== "retired").map((c) =>
    `<claim id="${c.id}" section="${c.section}" confidence="${c.confidence}" status="${c.status}" origin="${c.origin}">${attr(c.statement)}</claim>`);
  const questionLines = (opts.questions || []).filter((q) => q.status === "open").map((q) =>
    `<question id="${q.id}" kind="${q.kind}">${attr(q.text)}</question>`);

  const prefs = opts.prefs || {};
  const boundaries = [];
  if ((prefs.mutedTopics || []).length) boundaries.push(`Muted topics (do not raise): ${prefs.mutedTopics.map((t) => t.topic || t).join(", ")}`);
  if ((prefs.neverKinds || []).length) boundaries.push(`Never propose these kinds: ${prefs.neverKinds.join(", ")}`);

  const range = kept.length ? { from: kept.map((e) => e.day).sort()[0], to: kept.map((e) => e.day).sort().slice(-1)[0] } : { from, to };
  const cov = coverage(kept, { from: from || range.from, to: to || range.to });

  const text = [
    `<journal_context from="${range.from || ""}" to="${range.to || ""}" entries="${kept.length}" coverage="${attr(cov.note)}">`,
    ...parts,
    dayLines.length ? `<days>\n${dayLines.join("\n")}\n</days>` : "",
    "</journal_context>",
    claimLines.length ? `<meta_record>\n${claimLines.join("\n")}\n</meta_record>` : "<meta_record>(empty)</meta_record>",
    questionLines.length ? `<open_questions>\n${questionLines.join("\n")}\n</open_questions>` : "",
    boundaries.length ? `<boundaries>\n${boundaries.join("\n")}\n</boundaries>` : "",
  ].filter(Boolean).join("\n");

  return { text, includedIds: [...keptIds], includedDays, excluded, truncated, range, coverage: cov, chars: text.length };
}

/**
 * Quicksilver's review of the last 7 days, made only from what passes the gate above (the same
 * entries and days an AI would be allowed to read): counts, the average rating, how it compares
 * with the week before, and the feelings named most. No entry text. `due` once 7 days have
 * passed since you last marked a week done (reviewed: "YYYY-MM-DD" or "").
 */
export function weekReview(allEntries, days = [], { today, reviewed = "" } = {}) {
  const from = addDays(today, -6);
  const look = (a, b) => {
    const pack = buildContext(allEntries, { from: a, to: b, days, maxChars: Infinity, perEntryMax: 1 });
    const want = new Set(pack.includedDays);
    const ds = days.filter((d) => want.has(d.date));
    const vals = ds.map((d) => normRating(d)).filter((v) => v != null);
    return { pack, ds, avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, rated: vals.length };
  };
  const now = look(from, today), before = look(addDays(from, -7), addDays(from, -1));
  const kept = allEntries.filter((e) => now.pack.includedIds.includes(e.id));
  const feel = {};
  for (const d of now.ds) for (const f of d.emotions || []) feel[f] = (feel[f] || 0) + 1;
  const ten = (v) => (v == null ? null : Math.round(onScale(v, 10)));
  const diff = now.avg != null && before.avg != null ? (now.avg - before.avg) * 9 : null;
  const ex = now.pack.excluded;
  return {
    due: !reviewed || daysBetween(reviewed, today) >= 7,
    from, to: today,
    entries: kept.length,
    daysWritten: new Set(kept.map((e) => e.day)).size,
    rated: now.rated,
    avg: ten(now.avg),
    trend: diff == null ? null : diff >= 0.75 ? "up" : diff <= -0.75 ? "down" : "same",
    feelings: Object.entries(feel).sort((a, b) => b[1] - a[1]).slice(0, 3),
    kept: ex.noAi + ex.sealed + ex.documents,
  };
}

/** One-line description of what will be sent, for the confirmation sheet. */
export function describeContext(ctx) {
  const ex = ctx.excluded;
  const bits = [`${ctx.includedIds.length} entr${ctx.includedIds.length === 1 ? "y" : "ies"}`];
  if (ctx.range.from) bits.push(`${ctx.range.from} → ${ctx.range.to}`);
  const skipped = [];
  if (ex.noAi) skipped.push(`${ex.noAi} No-AI`);
  if (ex.sealed) skipped.push(`${ex.sealed} sealed`);
  if (ex.documents) skipped.push(`${ex.documents} private document${ex.documents === 1 ? "" : "s"}`);
  if (ex.days) skipped.push(`moments from ${ex.days} day${ex.days === 1 ? "" : "s"} with private entries`);
  if (ctx.truncated) skipped.push(`${ctx.truncated} older (size limit)`);
  return `${bits.join(" · ")}${skipped.length ? ` · not included: ${skipped.join(", ")}` : ""}`;
}
