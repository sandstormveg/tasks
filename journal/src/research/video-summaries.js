// What the Video archive says about a video, apart from the player: its summaries
// (each one an AI proposal with an author), its badges, and the pure shape of a
// summary entry. Kept out of the view so the parts can be tested on their own.

import { html, raw } from "../ui/dom.js";
import { renderMarkdown } from "../core/markdown.js";

/** Every AI summary on a source, oldest first, whether stored as one object or a list. */
export function analysesOf(source) {
  const value = source?.videoAnalysis;
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** The words of a summary entry: the PC helper's `summary`, or the app's/CLI's `text`. */
export const summaryText = (entry) => String(entry?.summary || entry?.text || "").trim();

/** The newest summary worth showing, or null. */
export function latestSummary(source) {
  const all = analysesOf(source).filter((a) => summaryText(a) || a?.executiveSummary);
  return all.length ? all[all.length - 1] : null;
}

/**
 * A videoAnalysis entry made from the PC helper's /summary answer. The helper names
 * the model that wrote it; the app keeps that as the author and marks the entry as a
 * proposal, exactly like the research tool's video-summary entries.
 */
export function summaryEntry(data, { now = "", via = "pc-helper" } = {}) {
  const summary = String(data?.summary || "").trim();
  if (!summary) return null;
  return {
    summary,
    author: String(data?.author || "pc-helper").trim() || "pc-helper",
    created: now,
    status: "proposal",
    via,
  };
}

/**
 * Add a summary to a source. A newer summary from the same place (the PC helper)
 * replaces the old one; summaries made elsewhere, and everything you wrote, stay.
 */
export function withSummary(source, entry) {
  if (!entry) return source;
  const kept = analysesOf(source).filter((a) => a.via !== entry.via);
  return { ...source, videoAnalysis: [...kept, entry] };
}

/** The small words a card wears: Transcript, Summary — only when it has them. */
export function videoBadges(source) {
  const badges = [];
  if (String(source?.transcript || "").trim()) badges.push("Transcript");
  if (analysesOf(source).some((a) => summaryText(a) || a?.executiveSummary)) badges.push("Summary");
  return badges;
}

export function videoBadgesMarkup(source) {
  const badges = videoBadges(source);
  return badges.length
    ? html`<span class="video-badges">${badges.map((b) => html`<span class="badge">${b}</span>`)}</span>`
    : html`<small>No transcript yet</small>`;
}

/** One summary, rendered the way video-summary entries are: AI-written, with its author. */
export function analysisMarkup(a) {
  const body = summaryText(a);
  return html`<article class="video-analysis">
    <div class="video-summary-meta"><span class="badge ai">AI-written</span> <span class="small muted">${a.author || "ai"}${a.created ? ` · ${String(a.created).slice(0, 10)}` : ""}</span></div>
    <h4>Summary</h4>${body
      ? html`<div class="prose">${raw(renderMarkdown(body, { tags: false, concepts: false }))}</div>`
      : html`<p>${a.executiveSummary || ""}</p>`}
    ${a.keyInsights?.length ? html`<h4>Key insights</h4><ul>${a.keyInsights.map((x) => html`<li><b>${x.point || ""}</b> ${x.detail || ""}${x.quote ? html`<blockquote>${x.quote}</blockquote>` : ""}</li>`)}</ul>` : ""}
    ${a.takeaways?.length ? html`<h4>Takeaways</h4><ul>${a.takeaways.map((x) => html`<li>${x}</li>`)}</ul>` : ""}
  </article>`;
}

/** Newest first, or only the latest when the page has one Summary section. */
export function videoAnalysisMarkup(value, { latest = false } = {}) {
  const all = Array.isArray(value) ? value : value ? [value] : [];
  return (latest ? all.slice(-1) : all.slice().reverse()).map((a) => analysisMarkup(a));
}
