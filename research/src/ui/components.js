// Shared renderers. Each returns an `html` value (escaped by construction).

import { html, raw, timeOf, plural } from "./dom.js";
import { icon } from "./icons.js";
import { plainExcerpt } from "../core/markdown.js";
import { ENTRY_KINDS, PRIVACY_LEVELS, normRating } from "../core/model.js";
import { relativeDayLabel, formatDay } from "../core/dates.js";
import { EVIDENCE_PROBLEMS } from "../core/metarecord.js";

export const KIND_ICON = { text: "edit", voice: "mic", photo: "photos", conversation: "chat", document: "file", import: "download" };

export function privacyBadge(level) {
  if (!level || level === "normal") return "";
  if (level === "no-ai") return html`<span class="badge" title="${PRIVACY_LEVELS["no-ai"].hint}">${raw(icon("noAi"))}No AI</span>`;
  return html`<span class="badge warn" title="${PRIVACY_LEVELS.sealed.hint}">${raw(icon("lock"))}Sealed</span>`;
}

/** Who authored something — the distinction the whole system is built on. */
export function authorBadge(author) {
  const a = String(author || "self");
  if (a === "self") return html`<span class="badge self">You</span>`;
  if (a.startsWith("ai") || a === "claude-code" || a.startsWith("claude")) {
    const label = a === "claude-code" ? "Steward (AI)" : a.startsWith("ai:") ? `AI · ${a.slice(3).replace(/^claude-/, "")}` : "AI";
    return html`<span class="badge ai">${raw(icon("sparkle"))}${label}</span>`;
  }
  return html`<span class="badge other">${a}</span>`;
}

export function originBadge(origin) {
  if (origin === "self") return html`<span class="badge self">Your words</span>`;
  if (origin === "ai-corrected") return html`<span class="badge ai">AI-proposed · corrected by you</span>`;
  if (origin === "ai-accepted") return html`<span class="badge ai">AI-proposed · accepted by you</span>`;
  return html`<span class="badge">${origin || ""}</span>`;
}

export function ratingDot(day, { withScale = false } = {}) {
  if (!day || day.rating == null) return "";
  const r = normRating(day);
  return html`<span class="rating-dot" style="--r:${r ?? 0.5}" title="Day rating ${day.rating} of ${day.rating_scale || 10}">${day.rating}${withScale ? `/${day.rating_scale || 10}` : ""}</span>`;
}

function photoThumbs(e, n = 3) {
  const ph = (e.media || []).filter((m) => m.type === "photo").slice(0, n);
  if (!ph.length) return "";
  return html`<div class="thumbs">${ph.map((m) => html`<div class="t"><img alt="${m.caption || ""}" data-media="${m.thumb || m.path}" data-fallback="${m.path}"></div>`)}</div>`;
}

export function entryCard(e, { showDay = false, today, href } = {}) {
  const kind = e.kind || "text";
  const sealedLocked = e.sealed && e.body == null;
  const title = e.title || (kind === "document" ? e.document?.title : "");
  const text = sealedLocked ? "Sealed — unlock to read" : plainExcerpt(e.body || (kind === "document" ? e.document?.text : "") || (e.media || []).map((m) => m.caption).filter(Boolean).join(" · "), 260);
  const needsReview = e.transcript && (e.transcript.status === "needs-review" || e.transcript.status === "pending");
  return html`<a class="entry-card ${sealedLocked ? "sealed" : ""}" href="${href || `#/entry/${e.id}`}">
    <div class="meta">${raw(icon(KIND_ICON[kind] || "edit"))}
      <span>${showDay ? `${relativeDayLabel(e.day, today || e.day)} · ` : ""}${timeOf(e.created)}</span>
      ${kind !== "text" ? html`<span>${ENTRY_KINDS[kind] || kind}</span>` : ""}
      ${privacyBadge(e.privacy)}
      ${needsReview ? html`<span class="badge warn">${e.transcript.status === "pending" ? "Transcript pending" : "Review transcript"}</span>` : ""}
      ${kind === "document" && e.document?.author ? html`<span class="badge other">by ${e.document.author}</span>` : ""}
    </div>
    ${title ? html`<div class="title">${title}</div>` : ""}
    ${text ? html`<div class="excerpt">${text}</div>` : (e.media || []).length ? "" : html`<div class="excerpt faint">(empty)</div>`}
    ${sealedLocked ? "" : photoThumbs(e)}
  </a>`;
}

export function eventCard(ev) {
  const time = ev.all_day ? "All day" : `${timeOf(ev.start)}${ev.end ? `–${timeOf(ev.end)}` : ""}`;
  return html`<div class="event-card" title="Imported from ${ev.calendar || "a calendar"} — context, not something you wrote">${raw(icon("calendar"))}
    <span class="grow"><b>${ev.title}</b> <span class="faint">· ${time}${ev.location ? ` · ${ev.location}` : ""}</span></span>
    <span class="badge">calendar</span></div>`;
}

export function whyList(reasons) {
  if (!reasons?.length) return "";
  return html`<div class="why"><b>Why this appeared</b><ul>${reasons.map((r) => html`<li>${r}</li>`)}</ul></div>`;
}

export function evidenceList(ctx, evidence, { checked } = {}) {
  const list = checked || evidence || [];
  if (!list.length) return html`<p class="small faint">No evidence linked.</p>`;
  return html`<ul class="evidence">${list.map((ev) => {
    const ref = ev.entry || ev.ref || ev.day;
    const rec = ref ? ctx.store.get(ref) : null;
    const href = rec?.type === "day" ? `#/day/${rec.id}` : rec ? `#/entry/${rec.id}` : null;
    const stance = ev.stance ? html`<span class="badge ${ev.stance === "contradicts" ? "warn" : ev.stance === "complicates" ? "" : "ok"}">${ev.stance}</span>` : "";
    const ok = ev.verified === true ? html`<span class="badge ok" title="Found word-for-word in the entry">${raw(icon("check"))}quote verified</span>`
      : ev.verified === false ? html`<span class="badge danger" title="${EVIDENCE_PROBLEMS[ev.problem] || ""}">${raw(icon("warn"))}${EVIDENCE_PROBLEMS[ev.problem] || "not verified"}</span>` : "";
    return html`<li>${ev.quote ? html`<q>${ev.quote}</q>` : html`<span class="faint">(no quote)</span>`}
      <div class="src">${stance}${ok}${href ? html`<a href="${href}">${rec.type === "day" ? formatDay(rec.id, { day: "numeric", month: "short", year: "numeric" }) : `${formatDay(rec.day, { day: "numeric", month: "short", year: "numeric" })}${rec.title ? ` · ${rec.title}` : ""}`}</a>` : html`<span>${ref || ""}</span>`}${ev.note ? html`<span>· ${ev.note}</span>` : ""}</div></li>`;
  })}</ul>`;
}

export function coverageLine(cov) {
  if (!cov) return "";
  const max = Math.max(1, ...(cov.weekly || [0]));
  return html`<div class="small muted">${cov.note || ""}</div>${cov.weekly?.length > 1 ? html`<div class="coverage-strip" title="Entries per week">${cov.weekly.map((n) => html`<span class="${n ? "" : "zero"}" style="height:${n ? Math.max(12, (n / max) * 100) : 100}%"></span>`)}</div>` : ""}`;
}

export function countLabel(n, word) { return plural(n, word); }

export function sectionTitle(text, extra = "") {
  return html`<div class="section-title row between"><span>${text}</span>${extra}</div>`;
}

export function emptyState(ic, title, text, action = "") {
  return html`<div class="empty">${raw(icon(ic))}<h3>${title}</h3><p>${text}</p>${action}</div>`;
}
