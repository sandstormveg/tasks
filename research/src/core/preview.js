// Website previews for corkboard pins: a link pin, a note with a link in it, a source pin. The
// title, site name, a short description and (as files in the data folder) the page's picture
// and icon.
//
// Why cached in the pin: Research is a static site, and a browser can't read another site's page
// (CORS), so the preview is fetched once by Claude's research tool (tools/research.mjs pin /
// previews) and saved with the pin. A board then draws it with nothing sent anywhere, works
// offline, and loads fast on a phone. The only thing that ever leaves for the page's site is the
// URL itself, one plain GET: no board text, no cookies, no third-party unfurl service.
//
// This module is pure (Node and browser): finding the URL a pin is about, reading a page's
// <head> for its preview, and keeping what's saved small and plain.

export const PREVIEW_LIMITS = { title: 140, site: 60, description: 220, image: 250_000, icon: 24_000, html: 1_000_000 };

/** The web address a pin is about: a link pin's URL, else the first link in a note's text. */
export function previewUrlOf(pin) {
  if (!pin) return "";
  if (pin.kind === "link" && isWebUrl(pin.url)) return pin.url;
  if (pin.kind === "note" || pin.kind === "link") {
    const m = String(pin.body || "").match(/https?:\/\/[^\s<>()[\]"'`]+/);
    if (m) return m[0].replace(/[.,;:!?]+$/, "");
  }
  return "";
}

export function isWebUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; }
}

/**
 * A host that's on this machine or a private network: never fetched (a pinned link can't make
 * the tool reach into the network it runs on).
 */
export function isPrivateHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decode(s) {
  return String(s || "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*|#39);/gi, (m, e) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}
const tidy = (s, n) => {
  const t = decode(s).replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
};

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

const abs = (href, base) => {
  if (!String(href || "").trim()) return "";
  try { const u = new URL(decode(href).trim(), base); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; }
};

/**
 * Read a page's preview from its HTML: Open Graph first, then Twitter cards, then the plain
 * <title>, description and icon. Returns { title, site, description, image, icon } (image and
 * icon as absolute URLs to fetch; empty strings where the page has none).
 */
export function parsePreview(htmlText, pageUrl) {
  const text = String(htmlText || "").slice(0, PREVIEW_LIMITS.html);
  const head = (text.match(/<head[\s>][\s\S]*?<\/head>/i) || [text.slice(0, 200_000)])[0];
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  const icons = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel || "").toLowerCase().split(/\s+/);
    if (a.href && (rel.includes("icon") || rel.includes("apple-touch-icon"))) icons.push({ href: a.href, touch: rel.includes("apple-touch-icon"), svg: /svg/.test(a.type || "") || /\.svg(\?|$)/i.test(a.href) });
  }
  const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  // A plain icon (not SVG, which can't be shown safely as a file from elsewhere), smallest first.
  const icon = icons.find((i) => !i.touch && !i.svg) || icons.find((i) => !i.svg);
  return {
    title: tidy(meta["og:title"] || meta["twitter:title"] || titleTag, PREVIEW_LIMITS.title),
    site: tidy(meta["og:site_name"] || meta["application-name"] || host, PREVIEW_LIMITS.site),
    description: tidy(meta["og:description"] || meta["twitter:description"] || meta.description, PREVIEW_LIMITS.description),
    image: abs(meta["og:image:secure_url"] || meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || "", pageUrl),
    icon: icon ? abs(icon.href, pageUrl) : abs("/favicon.ico", pageUrl),
  };
}

/** What a pin keeps: plain, short fields, and media paths only inside the data folder. */
export function cleanPreview(p) {
  if (!p || typeof p !== "object" || !isWebUrl(p.url)) return undefined;
  const media = (x) => (typeof x === "string" && /^media\/\d{4}\/\d{2}\/[\w.-]+$/.test(x) ? x : undefined);
  const out = {
    url: String(p.url),
    title: tidy(p.title, PREVIEW_LIMITS.title) || undefined,
    site: tidy(p.site, PREVIEW_LIMITS.site) || undefined,
    description: tidy(p.description, PREVIEW_LIMITS.description) || undefined,
    image: media(p.image),
    icon: media(p.icon),
    fetched: typeof p.fetched === "string" ? p.fetched : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out.title || out.description || out.image ? out : undefined;
}

/** A saved image's file type, from its first bytes (not what the server claims). */
export function sniffImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: "gif", mime: "image/gif" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return { ext: "ico", mime: "image/x-icon" };
  return null;
}
