// A small, safe Markdown renderer for journal text. Everything is escaped
// first; only a fixed set of constructs becomes HTML. Single newlines are kept
// as line breaks because that is how people write journals and dictate.
//
// Extras: #tags become tag links, @concept-id becomes a knowledge-system badge
// (same convention as the Atlas), and ![caption](media:m-…) becomes a figure
// placeholder the UI fills in lazily.

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const SAFE_URL = /^(https?:|mailto:)/i;

export const TAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu;
export const CONCEPT_RE = /(^|[\s(])@([a-z0-9][a-z0-9-]{1,80})/g;

/** Extract #tags from text (lowercased, unique, in order). */
export function extractTags(text) {
  const out = [];
  for (const m of String(text || "").matchAll(TAG_RE)) {
    const t = m[2].toLowerCase();
    if (!/^\d+$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export function extractConcepts(text) {
  const out = [];
  for (const m of String(text || "").matchAll(CONCEPT_RE)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

function inline(text, opts) {
  // text is already escaped. Generated HTML is parked in placeholders so later
  // passes (emphasis, tags) can never rewrite inside an attribute.
  const parked = [];
  const park = (html) => { parked.push(html); return `\u0000${parked.length - 1}\u0000`; };
  let s = text.replace(/`([^`\n]+)`/g, (_, c) => park(`<code>${c}</code>`));
  // images: ![alt](media:id) only — remote images are never loaded (privacy).
  s = s.replace(/!\[([^\]]*)\]\(media:([a-zA-Z0-9._-]+)\)/g, (_, alt, id) =>
    park(`<span class="md-media" role="figure" data-media-id="${id}"><span class="md-media-ph"></span>${alt ? `<span class="md-caption">${alt}</span>` : ""}</span>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt) => park(`<span class="md-img-missing">[image${alt ? ": " + alt : ""}]</span>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = url.replace(/&amp;/g, "&");
    if (u.startsWith("#/")) return park(`<a href="${url}">`) + label + park("</a>");
    if (!SAFE_URL.test(u)) return label;
    return park(`<a href="${url}" target="_blank" rel="noopener noreferrer">`) + label + park("</a>");
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)\u0000]+)/g, (_, pre, url) => pre + park(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  if (opts.tags !== false) {
    s = s.replace(TAG_INLINE_RE, (_, pre, tag) => pre + park(`<a class="tag" href="#/search?tag=${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`));
  }
  if (opts.concepts !== false) {
    s = s.replace(CONCEPT_INLINE_RE, (_, pre, id) => pre + park(`<a class="concept" data-concept="${id}" href="#/concept/${id}">@${id}</a>`));
  }
  for (let i = 0; i < 3 && s.includes("\u0000"); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => parked[Number(n)]);
  return s;
}

// Inline variants also accept a preceding ">" (e.g. **#tag** after <strong>).
const TAG_INLINE_RE = /(^|[\s(>])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu;
const CONCEPT_INLINE_RE = /(^|[\s(>])@([a-z0-9][a-z0-9-]{1,80})/g;

/** Markdown -> safe HTML string. */
export function renderMarkdown(src, opts = {}) {
  const lines = escapeHtml(String(src || "").replace(/\r\n/g, "\n")).split("\n");
  const out = [];
  let para = [];
  let list = null; // {type, items}
  let quote = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, opts)).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i, opts)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${renderMarkdown(quote.join("\n").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"), opts)}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^&gt;\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^&gt;\s?/, "")); continue; }
    if (quote.length) flushQuote();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) {
      flushAll();
      const level = Math.min(6, m[1].length + (opts.headingOffset ?? 2));
      out.push(`<h${level}>${inline(m[2], { ...opts, tags: false })}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); out.push("<hr>"); continue; }
    if ((m = /^\s*[-*+]\s+(?:\[( |x)\]\s+)?(.*)$/.exec(line))) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push((m[1] === "x" ? "☑ " : m[1] === " " ? "☐ " : "") + m[2]);
      continue;
    }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if (list) flushList();
    para.push(line);
  }
  flushAll();
  return out.join("\n");
}

/** Plain-text excerpt (markdown syntax removed), for cards and snippets. */
export function plainExcerpt(src, max = 220) {
  const s = String(src || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + "…";
}
