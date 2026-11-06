// Research: the things you save to read — articles, papers, books, videos —
// one record each, with where you're up to, your tags, why you saved it, what
// you expected, what surprised you, notes and exact quotes. Pure functions,
// shared by the app and the command-line tool Claude uses (tools/research.mjs).

import { newId } from "./ids.js";
import { fold } from "./search.js";

// "inbox" is the Deposit: anything dropped in lands there first. "filed" is a thought
// that now lives on a board or in a piece of writing (links keep a reading status).
export const STATUSES = { inbox: "Deposit", "to-read": "To read", reading: "Reading", read: "Read", dropped: "Dropped", filed: "Filed" };
export const KINDS = { article: "Article", paper: "Paper", book: "Book", video: "Video", podcast: "Podcast", image: "Image", thought: "Thought", other: "Other" };

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|si|ref_src|ref_url|_hsenc|_hsmi|mkt_tok|spm|share_source)$/i;

/** A link without tracking tags, fragments or trailing slashes — for storing and spotting duplicates. Null if not http(s). */
export function normalizeUrl(input) {
  let u;
  try { u = new URL(String(input || "").trim()); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let s = u.toString();
  if (u.pathname !== "/" && s.endsWith("/") && !u.search) s = s.slice(0, -1);
  return s;
}

export function siteOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** The first http(s) link in some text. */
export function firstUrl(text) {
  const m = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/i.exec(String(text || ""));
  return m ? m[0] : null;
}

/** A DOI in a link or text ("10.1234/abc", doi.org/…), or null. */
export function findDoi(text) {
  const m = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(decodeURIComponentSafe(String(text || "")));
  return m ? m[1].replace(/[.,;:)\]}>]+$/, "").replace(/\/(full|abstract|pdf)$/i, "") : null;
}

/** An arXiv paper id ("2301.01234") from a link or "arXiv:2301.01234". */
export function findArxiv(text) {
  const m = /(?:arxiv\.org\/(?:abs|pdf|html)\/|arxiv:\s*)(\d{4}\.\d{4,5})(v\d+)?/i.exec(String(text || ""));
  return m ? m[1] : null;
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** What kind of thing a link probably is. */
export function kindFromUrl(url, { doi } = {}) {
  const s = String(url || "").toLowerCase();
  if (doi || findArxiv(s) || /\.pdf($|\?)/.test(s) || /(doi\.org|arxiv\.org|ssrn\.com|biorxiv|medrxiv|philpapers|semanticscholar|openreview)/.test(s)) return "paper";
  if (/(youtube\.com|youtu\.be|vimeo\.com)/.test(s)) return "video";
  if (/(podcasts?\.|spotify\.com\/episode|overcast\.fm)/.test(s)) return "podcast";
  if (/\.(png|jpe?g|gif|webp|svg)($|\?)/.test(s)) return "image";
  return "article";
}

/** A readable title guessed from a link's last path segment, for when nothing better was shared. */
export function guessTitle(url) {
  let u;
  try { u = new URL(url); } catch { return ""; }
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponentSafe);
  const seg = [...parts].reverse().find((p) => /[a-z]{3,}/i.test(p) && !/^(index|amp|post|posts|p|article|articles|blog|news)$/i.test(p.replace(/\.\w+$/, "")));
  if (!seg) return siteOf(url);
  const words = seg.replace(/\.(html?|php|aspx?|pdf)$/i, "").replace(/[-_+]+/g, " ").replace(/\b[0-9a-f]{8,}\b/gi, "").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : siteOf(url);
}

/**
 * What the phone's share sheet (or a bookmarklet) sent: { title, text, url },
 * any of which may be empty — Android often puts the link inside `text`.
 */
export function parseShared({ title = "", text = "", url = "" } = {}) {
  const link = normalizeUrl(url) || normalizeUrl(firstUrl(text)) || normalizeUrl(firstUrl(title));
  let name = String(title || "").trim();
  if (!name || normalizeUrl(name) === link) {
    const rest = String(text || "").replace(firstUrl(text) || "", "").replace(/\s+/g, " ").trim().replace(/[-–—:|]+$/, "").trim();
    name = rest && rest.length <= 300 ? rest : "";
  }
  const doi = findDoi(link || "") || findDoi(text);
  const arxiv = findArxiv(link || "") || findArxiv(text);
  return { url: link, title: name, doi: doi || (arxiv ? `10.48550/arXiv.${arxiv}` : null) };
}

/**
 * Whatever you paste into the Deposit, sorted into the things it holds: a list
 * of links (one per line) becomes one item per link, keeping each line's words
 * as its title; a DOI or arXiv id is a paper; words in quote marks (or after
 * "> ") are a quote, with "— Name" kept as who said it; anything else is a
 * thought. Returns [{ sort: "link"|"paper"|"quote"|"thought", text, title?, who? }].
 */
export function sortDrop(input) {
  const text = String(input || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const linky = (l) => !!(firstUrl(l) || findDoi(l) || findArxiv(l));
  // A list: every line (bar the odd heading) carries its own link.
  if (lines.length > 1 && lines.filter(linky).length >= 2 && lines.filter(linky).length >= lines.length - 1) {
    return lines.filter(linky).map((l) => one(l.replace(/^[-*•\d.)\s]+(?=\S)/, "")));
  }
  return [one(text)];
}

function one(text) {
  const s = parseShared({ text });
  if (s.doi) return { sort: "paper", text };
  if (s.url) return { sort: "link", text };
  const q = /^(?:>\s*|["“])([\s\S]+?)["”]?\s*(?:(?:\n|\s)[—–-]{1,2}\s*([^\n]{1,80}))?$/.exec(text);
  if (q && (text.startsWith(">") || /["”]/.test(text.slice(1)))) {
    const body = q[1].replace(/^>\s*/gm, "").replace(/["”]\s*$/, "").trim();
    if (body) return { sort: "quote", text: body, who: q[2]?.trim() || undefined };
  }
  return { sort: "thought", text };
}

/** What a pasted or dropped file becomes: its kind of source. */
export function kindOfFile(mime = "", name = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || /\.pdf$/i.test(name)) return "paper";
  if (m.startsWith("audio/")) return "podcast";
  if (m.startsWith("video/")) return "video";
  if (/\.(epub|mobi|azw3?)$/i.test(name)) return "book";
  return "other";
}

/** "#AI Safety" → "ai-safety". Empty if nothing's left. */
export function cleanTag(tag) {
  return String(tag || "").trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]+/gu, "").replace(/^-+|-+$/g, "");
}

export function cleanTags(tags) {
  return [...new Set((tags || []).map(cleanTag).filter(Boolean))];
}

/** A new source. `now` is an ISO time with offset. */
export function makeSource(fields = {}, { now, device = "", via = "app" } = {}) {
  const added = fields.added || now;
  const url = normalizeUrl(fields.url) || undefined;
  const doi = fields.doi || findDoi(url || "") || undefined;
  return {
    id: fields.id || newId("s", added),
    type: "source",
    kind: fields.kind || kindFromUrl(url, { doi }),
    title: String(fields.title || "").trim() || (url ? guessTitle(url) : ""),
    url,
    doi,
    authors: fields.authors?.length ? fields.authors : undefined,
    year: fields.year || undefined,
    site: fields.site || (url ? siteOf(url) : undefined),
    status: fields.status || "inbox",
    favourite: !!fields.favourite,
    tags: cleanTags(fields.tags),
    added,
    why: String(fields.why || "").trim() || undefined,
    expect: String(fields.expect || "").trim() || undefined,
    quotes: fields.quotes?.length ? fields.quotes : undefined,
    media: fields.media?.length ? fields.media : undefined,
    visibility: "private",
    captured: { via, device: device || undefined },
    body: fields.body || "",
  };
}

/** The changes for moving a source to a status: reading notes when you started, read when you finished. */
export function statusPatch(rec, status, now) {
  const patch = { status };
  if (status === "reading" && !rec.started) patch.started = now;
  if (status === "read" && !rec.finished) patch.finished = now;
  return patch;
}

/** "Smith", "Smith & Lee", "Smith et al." */
export function formatAuthors(authors = []) {
  const last = (a) => String(a).trim().split(/\s+/).pop();
  if (!authors.length) return "";
  if (authors.length === 1) return last(authors[0]);
  if (authors.length === 2) return `${last(authors[0])} & ${last(authors[1])}`;
  return `${last(authors[0])} et al.`;
}

/** An existing source with the same link or DOI. */
export function findDuplicate(sources, { url, doi }) {
  const u = normalizeUrl(url);
  const d = doi ? String(doi).toLowerCase() : null;
  return sources.find((s) => !s.deleted && ((u && normalizeUrl(s.url) === u) || (d && String(s.doi || "").toLowerCase() === d))) || null;
}

/** Everything about a source that search should find. */
export function sourceText(s) {
  return [s.title, (s.authors || []).join(" "), s.site, (s.tags || []).map((t) => `#${t}`).join(" "), s.why, s.expect, s.surprised, s.prompt, s.body,
    ...(s.quotes || []).map((q) => `${q.text} ${q.where || ""}`)].filter(Boolean).join("\n");
}

/** Sources matching every word of a query (accents and case ignored); #tag words match tags. */
export function searchSources(sources, query) {
  const loose = (t) => t.replace(/[-_]+/g, " "); // "s-risks" finds "s risks", and the other way round
  const words = fold(String(query || "")).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return sources.filter((s) => {
    if (s.deleted) return false;
    const hay = loose(fold(sourceText(s)));
    return words.every((w) => (w.startsWith("#") ? (s.tags || []).includes(w.slice(1)) : hay.includes(loose(w))));
  });
}

/** Tags with how many sources carry each, most used first. */
export function tagCounts(sources) {
  const m = new Map();
  for (const s of sources) if (!s.deleted) for (const t of s.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------- paper details from Crossref / DataCite ----------

const yearOf = (parts) => (Array.isArray(parts?.[0]) && parts[0][0] ? Number(parts[0][0]) : undefined);

/** A Crossref "work" → { title, authors, year, kind, site }. */
export function fromCrossref(w = {}) {
  const title = (w.title || [])[0] || "";
  const sub = (w.subtitle || [])[0];
  return {
    title: sub && !title.includes(sub) ? `${title}: ${sub}` : title,
    authors: (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ") || a.name).filter(Boolean),
    year: yearOf(w.issued?.["date-parts"]) || yearOf(w.published?.["date-parts"]) || yearOf(w.created?.["date-parts"]),
    kind: /book/.test(w.type || "") ? "book" : "paper",
    site: (w["container-title"] || [])[0] || w.publisher || undefined,
  };
}

/** A DataCite DOI's attributes (arXiv papers) → { title, authors, year, kind, site }. */
export function fromDataCite(a = {}) {
  return {
    title: (a.titles || [])[0]?.title || "",
    authors: (a.creators || []).map((c) => [c.givenName, c.familyName].filter(Boolean).join(" ") || c.name).filter(Boolean),
    year: a.publicationYear ? Number(a.publicationYear) : undefined,
    kind: /book/i.test(a.types?.resourceTypeGeneral || "") ? "book" : "paper",
    site: a.publisher?.name || a.publisher || undefined,
  };
}

// Assist: the owner can let an agent work with one source, like Assist on a task. `prompt` is
// their instruction (their words, edited only in the app); `prompted` is when they last changed it.
// The agent answers in `agent_notes` — its own, authored and dated, never in why/expect/surprised/notes.

/** True when assist is on, there's a prompt, and no agent note has answered it since it last changed. */
export function assistWaiting(s) {
  if (!s || s.deleted || s.assist !== true || !String(s.prompt || "").trim()) return false;
  const asked = Date.parse(s.prompted || "") || 0;
  return !(s.agent_notes || []).some((n) => (Date.parse(n.date) || 0) >= asked);
}

/** Sources with a prompt waiting, oldest ask first. */
export function assistQueue(sources) {
  return sources.filter(assistWaiting).sort((a, b) => String(a.prompted || a.added || "").localeCompare(String(b.prompted || b.added || "")));
}

/** A new agent note: { id, author, date, text }. */
export function makeAgentNote(text, { author, now }) {
  return { id: newId("an", now), author, date: now, text: String(text || "").trim() };
}
