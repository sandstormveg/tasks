// Local search. No server, no AI: works offline on years of entries.
//
// Folding makes search forgiving across Vietnamese and English: "pho" finds
// "phở", "Dong Xuan" finds "Đồng Xuân". Folding is done per character with an
// index map back to the original so snippets highlight the right span.
//
// "Related entries" uses TF-IDF cosine similarity — deliberately simple and
// explainable: every suggestion can say which words it shares.

const STOP = new Set(`a an and are as at be been but by can could did do does for from had has have he her his
i if in into is it its just me my of on or our so than that the their them then there these they this to too
up us was we were what when where which who why will with would you your im ive dont didnt its thats also
about after again all am any because before being both each few more most much no nor not now only other
out over own same she should some such through under until very while got get really today day like
felt feel feeling feels thing things something anything everything time times days week weeks tonight
morning afternoon evening night yesterday tomorrow lot bit way back still even well good bad kind sort
quite maybe think thought know knew going went come came make made want wanted need little big new old
một những các của và là có không được cho với này đã đi rất thì mà để ở trong khi cũng như lại người
ra về vào nên nhưng vì từ đó làm còn hơn bị theo nhiều tôi mình em anh chị ấy`.split(/\s+/).map(foldWord));

function foldChar(ch) {
  if (ch === "đ" || ch === "Đ") return "d";
  if (ch === "\u2019" || ch === "\u2018") return "'";
  return ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function foldWord(w) {
  let s = "";
  for (const ch of w) s += foldChar(ch);
  return s;
}

/** Fold text and keep a map from folded index -> original index. */
export function foldWithMap(text) {
  const src = String(text || "");
  let folded = "";
  const map = [];
  let i = 0;
  for (const ch of src) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) { folded += f[k]; map.push(i); }
    i += ch.length;
  }
  map.push(src.length);
  return { folded, map };
}

export function fold(text) {
  return foldWord(String(text || ""));
}

export function tokenize(text, { minLen = 2 } = {}) {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= minLen);
}

function stem(t) {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  if (t.length > 5 && t.endsWith("ly")) return t.slice(0, -2);
  return t;
}

export function contentTerms(text) {
  return tokenize(text, { minLen: 3 }).filter((t) => !STOP.has(t) && !/^\d+$/.test(t)).map(stem);
}

/**
 * Parse a query: words (AND), "exact phrases", -excluded, #tag.
 * Returns folded pieces.
 */
export function parseQuery(q) {
  const out = { terms: [], phrases: [], exclude: [], tags: [] };
  const s = String(q || "");
  const re = /(-?)"([^"]+)"|(-?)(#?)([^\s"]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[2] != null) {
      (m[1] ? out.exclude : out.phrases).push(fold(m[2]).trim());
    } else if (m[5]) {
      const neg = m[3] === "-";
      const isTag = m[4] === "#";
      const w = fold(m[5]);
      if (!w) continue;
      if (isTag && !neg) out.tags.push(w);
      else if (neg) out.exclude.push(w);
      else out.terms.push(w);
    }
  }
  return out;
}

export function isEmptyQuery(pq) {
  return !pq.terms.length && !pq.phrases.length && !pq.tags.length && !pq.exclude.length;
}

/**
 * Build a search index over documents: [{id, fields: {title, body, ...}, tags, weight?}].
 * Small corpora (thousands of entries) are scanned linearly over folded text —
 * fast, predictable, and substring matches work for short Vietnamese syllables.
 */
export function buildIndex(docs) {
  return docs.map((d) => {
    const fields = {};
    for (const [k, v] of Object.entries(d.fields || {})) if (v) fields[k] = fold(v);
    return { id: d.id, fields, tags: (d.tags || []).map(fold), raw: d };
  });
}

const FIELD_WEIGHT = { title: 3, best: 2, hardest: 2, caption: 1.5, body: 1, text: 1 };

function countOcc(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

function wordBoundaryHit(hay, needle) {
  const i = hay.indexOf(needle);
  if (i === -1) return false;
  const before = i === 0 || /[^\p{L}\p{N}]/u.test(hay[i - 1]);
  return before;
}

/** Search an index. Returns [{id, score, matched: [fieldNames]}] best first. */
export function search(index, query) {
  const pq = typeof query === "string" ? parseQuery(query) : query;
  if (isEmptyQuery(pq)) return [];
  const results = [];
  for (const doc of index) {
    const all = Object.values(doc.fields).join("\n");
    if (pq.exclude.some((x) => all.includes(x) || doc.tags.includes(x.replace(/^#/, "")))) continue;
    if (pq.tags.some((t) => !doc.tags.includes(t) && !all.includes("#" + t))) continue;
    let ok = true;
    let score = 0;
    const matched = new Set();
    for (const t of [...pq.terms, ...pq.phrases]) {
      let hit = false;
      for (const [f, text] of Object.entries(doc.fields)) {
        const c = countOcc(text, t);
        if (c) {
          hit = true;
          matched.add(f);
          score += (FIELD_WEIGHT[f] || 1) * (1 + Math.log(c)) * (wordBoundaryHit(text, t) ? 1.5 : 1);
        }
      }
      if (!hit) { ok = false; break; }
    }
    if (!ok) continue;
    if (pq.tags.length) score += pq.tags.length;
    results.push({ id: doc.id, score, matched: [...matched], doc: doc.raw });
  }
  results.sort((a, b) => b.score - a.score || String(b.doc?.sortKey || "").localeCompare(String(a.doc?.sortKey || "")));
  return results;
}

/**
 * Snippet of `text` around the first query hit, as segments
 * [{text, hit: bool}] so the UI can render highlights safely.
 */
export function snippet(text, query, radius = 90) {
  const src = String(text || "");
  const pq = typeof query === "string" ? parseQuery(query) : query;
  const needles = [...pq.phrases, ...pq.terms, ...pq.tags.map((t) => t)].filter(Boolean).sort((a, b) => b.length - a.length);
  const { folded, map } = foldWithMap(src);
  let first = -1;
  for (const n of needles) {
    const i = folded.indexOf(n);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  const startF = first === -1 ? 0 : Math.max(0, first - radius);
  const endF = first === -1 ? Math.min(folded.length, radius * 2) : Math.min(folded.length, first + radius);
  const start = map[startF] ?? 0;
  const end = map[endF] ?? src.length;
  const piece = src.slice(start, end);
  const { folded: pf, map: pm } = foldWithMap(piece);
  const marks = new Array(piece.length).fill(false);
  for (const n of needles) {
    let i = 0;
    while ((i = pf.indexOf(n, i)) !== -1) {
      const a = pm[i], b = pm[i + n.length];
      for (let k = a; k < b; k++) marks[k] = true;
      i += n.length;
    }
  }
  const segs = [];
  let cur = null;
  for (let k = 0; k < piece.length; k++) {
    const hit = marks[k];
    if (!cur || cur.hit !== hit) { cur = { text: "", hit }; segs.push(cur); }
    cur.text += piece[k];
  }
  if (start > 0) segs.unshift({ text: "…", hit: false });
  if (end < src.length) segs.push({ text: "…", hit: false });
  for (const s of segs) s.text = s.text.replace(/\s+/g, " ");
  return segs;
}

// ---------- TF-IDF related entries ----------

export function buildTfIdf(docs) {
  // docs: [{id, text}]
  const df = new Map();
  const vecs = new Map();
  for (const d of docs) {
    const terms = contentTerms(d.text);
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    vecs.set(d.id, tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = docs.length || 1;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  const weighted = new Map();
  for (const [id, tf] of vecs) {
    const w = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      // Terms appearing in only one document can't connect anything.
      if ((df.get(t) || 0) < 2) continue;
      const v = (1 + Math.log(c)) * idf.get(t);
      w.set(t, v);
      norm += v * v;
    }
    weighted.set(id, { w, norm: Math.sqrt(norm) });
  }
  return { weighted, idf, N };
}

/** Top-k related docs to `id`, each with the shared terms that explain it. */
export function related(model, id, { k = 5, exclude = new Set(), minScore = 0.1, strongScore = 0.25 } = {}) {
  const a = model.weighted.get(id);
  if (!a || !a.norm) return [];
  const out = [];
  for (const [otherId, b] of model.weighted) {
    if (otherId === id || exclude.has(otherId) || !b.norm) continue;
    let dot = 0;
    const shared = [];
    const [small, big] = a.w.size < b.w.size ? [a.w, b.w] : [b.w, a.w];
    for (const [t, v] of small) {
      const u = big.get(t);
      if (u) { dot += u * v; shared.push([t, u * v]); }
    }
    const score = dot / (a.norm * b.norm);
    // One shared word is a coincidence unless it carries most of both entries.
    if (score >= minScore && (shared.length >= 2 || score >= strongScore)) out.push({ id: otherId, score, shared: shared.sort((x, y) => y[1] - x[1]).slice(0, 4).map((x) => x[0]) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, k);
}

/** Similar docs to an arbitrary text (e.g. a draft or a document summary). */
export function relatedToText(model, text, { k = 5, minScore = 0.08 } = {}) {
  const tf = new Map();
  for (const t of contentTerms(text)) tf.set(t, (tf.get(t) || 0) + 1);
  const w = new Map();
  let norm = 0;
  for (const [t, c] of tf) {
    const idf = model.idf.get(t);
    if (!idf) continue;
    const v = (1 + Math.log(c)) * idf;
    w.set(t, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (!norm) return [];
  const out = [];
  for (const [id, b] of model.weighted) {
    if (!b.norm) continue;
    let dot = 0;
    const shared = [];
    for (const [t, v] of w) {
      const u = b.w.get(t);
      if (u) { dot += u * v; shared.push([t, u * v]); }
    }
    const score = dot / (norm * b.norm);
    if (score >= minScore) out.push({ id, score, shared: shared.sort((x, y) => y[1] - x[1]).slice(0, 4).map((x) => x[0]) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, k);
}
