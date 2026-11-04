// Infodex cards on the corkboard: the same card generation as the Atlas's
// Infodex (epistemic-atlas assets/infodex.js, docs/infodex-v2.md), so a thing
// pinned here gets the same type, rarity, lineage and stats as in your Dex.
//
// - Type: walk the item's class ancestry on Wikidata; Myth and Figure win if
//   their roots appear anywhere, taxa are Life, otherwise the nearest root wins
//   (huge catch-all classes count as further away than they are).
// - Rarity: how many Wikipedia language editions cover it.
// - Lineage: a greedy climb up the best-known parent classes.
// - Stats: DEPTH (rungs of lineage), BONDS (relationships), REACH (Wikipedias).
//
// A card is a call number (the Wikidata QID) plus what only you add: your
// entries about it, which are the card's body. Dex cards exported from the
// Infodex keep your questions, finish and Insight (cardFromDex).
//
// No DOM here: the Research app and tools/research.mjs both use it. Network
// calls take a fetch function so tests (and Node) can supply their own.

export const TYPES = {
  MYTH: { name: "Myth", c1: "#ff5fb0", c2: "#8e1f5c", g: "star", roots: ["Q14897293", "Q15707583", "Q95074", "Q64728693"], hard: ["Q14897293", "Q15707583", "Q95074"], blurb: "Gods, legends and fiction: things that live in stories." },
  FIGURE: { name: "Figure", c1: "#ffc94d", c2: "#8a5d00", g: "person", roots: ["Q5", "Q215627"], blurb: "Real people." },
  LIFE: { name: "Life", c1: "#46d17a", c2: "#126a38", g: "leaf", roots: ["Q16521", "Q7239", "Q16334298", "Q21871294", "Q420", "Q28598684", "Q864928", "Q2996394", "Q64732777", "Q12136", "Q2057971", "Q4936952", "Q11190"], blurb: "Living things and the study of them." },
  COSMOS: { name: "Cosmos", c1: "#7b6cff", c2: "#2b2190", g: "planet", roots: ["Q6999", "Q17444909", "Q333", "Q131565179"], blurb: "Space: stars, planets, galaxies, astronomy." },
  REALM: { name: "Realm", c1: "#2fc4b2", c2: "#0e6a60", g: "mountain", roots: ["Q2221906", "Q618123", "Q82794", "Q56061", "Q1071", "Q8008", "Q1069"], blurb: "Places on Earth: countries, cities, landforms, geography." },
  MATTER: { name: "Matter", c1: "#b8c4d6", c2: "#46536d", g: "atom", roots: ["Q11344", "Q79529", "Q11173", "Q7946", "Q214609", "Q43460564", "Q35758", "Q2329", "Q11790203"], blurb: "Stuff: elements, compounds, materials, chemistry." },
  EVENT: { name: "Event", c1: "#d8b07a", c2: "#77511f", g: "hourglass", roots: ["Q1190554", "Q1656682", "Q13418847", "Q180684", "Q309", "Q3241045"], blurb: "Things that happened: wars, revolutions, disasters, history." },
  CULTURE: { name: "Culture", c1: "#ff8a4c", c2: "#963709", g: "note", roots: ["Q17537576", "Q838948", "Q34770", "Q9174", "Q386724", "Q43229", "Q16334295", "Q34749", "Q80083", "Q12909644", "Q273005", "Q28108", "Q638", "Q735", "Q7748", "Q483394", "Q921513", "Q82799", "Q159810", "Q1920219", "Q367293"], blurb: "What people share: languages, religions, arts, groups, economies, laws." },
  CRAFT: { name: "Craft", c1: "#4ea4ff", c2: "#164c94", g: "nut", roots: ["Q16686448", "Q11016", "Q39546", "Q7397", "Q42889", "Q11019", "Q1183543", "Q11023", "Q21198", "Q28797"], blurb: "What people make: tools, machines, buildings, software." },
  FORCE: { name: "Force", c1: "#ff5252", c2: "#8a1414", g: "bolt", roots: ["Q11402", "Q104934", "Q11379", "Q1293220", "Q1322005", "Q483247", "Q3249551", "Q413", "Q4162444", "Q33104303", "Q107715", "Q9357058", "Q214070", "Q17320256", "Q37172", "Q395", "Q1936384", "Q24034552", "Q246672", "Q11563", "Q815741", "Q65943", "Q976981", "Q20026918", "Q186509", "Q36161"], blurb: "Physics and maths: forces, energy, quantities, the laws of nature." },
  MIND: { name: "Mind", c1: "#c07bff", c2: "#561c96", g: "eye", roots: ["Q5891", "Q22811234", "Q33104279", "Q5389993", "Q2915955", "Q12765852", "Q1387659", "Q117850", "Q49447", "Q9418", "Q147638", "Q96634632", "Q3968640", "Q12047513", "Q12047512", "Q781413", "Q13434561", "Q9415", "Q205555", "Q450", "Q2145290", "Q131841", "Q9420", "Q194112", "Q55387456", "Q151885", "Q17737", "Q7184903", "Q7048977", "Q11862829", "Q1047113"], blurb: "Philosophy and psychology: thoughts, feelings, values, consciousness." },
  WILD: { name: "Wild", c1: "#8d96a8", c2: "#383f50", g: "compass", roots: [], blurb: "Not placed yet: the open record doesn't say what kind of thing it is." },
};
export const TYPE_ORDER = ["MYTH", "FIGURE", "LIFE", "COSMOS", "REALM", "MATTER", "EVENT", "CULTURE", "CRAFT", "FORCE", "MIND"];
const ROOT_COST = { Q1190554: 3, Q483247: 3, Q3249551: 3, Q7048977: 3, Q16686448: 3, Q16334298: 4, Q21871294: 4, Q386724: 2, Q1293220: 2, Q1322005: 2, Q43229: 1, Q16334295: 2, Q64728693: 2, Q864928: 1, Q64732777: 1, Q80083: 1, Q28797: 1, Q17320256: 1, Q36161: 1, Q1387659: 1, Q117850: 1, Q49447: 1, Q151885: 2, Q17737: 3, Q7184903: 3, Q11862829: 4, Q1047113: 4, Q483394: 1, Q367293: 1, Q246672: 1, Q131841: 2, Q2145290: 2, Q1920219: 2 };
const TOP = new Set("Q35120 Q488383 Q4406616 Q7048977 Q7184903 Q6502323 Q99527517".split(" "));

export const RARITY = [
  { key: "iconic", name: "Iconic", min: 120, gems: "◉", color: "#ffe7a3", rank: 0 },
  { key: "common", name: "Common", min: 50, gems: "●", color: "#cfd6ee", rank: 1 },
  { key: "uncommon", name: "Uncommon", min: 20, gems: "◆", color: "#7fe3d4", rank: 2 },
  { key: "rare", name: "Rare", min: 8, gems: "★", color: "#6d9cff", rank: 3 },
  { key: "epic", name: "Epic", min: 3, gems: "★★", color: "#c07bff", rank: 4 },
  { key: "legendary", name: "Legendary", min: 1, gems: "★★★", color: "#ff9f43", rank: 5 },
  { key: "mythic", name: "Mythic", min: 0, gems: "✦", color: "#ff5fb0", rank: 6 },
];
export const FINISHES = { base: "Base", holo: "Holo", foil: "Foil", fullart: "Full Art", prismatic: "Prismatic" };

// Relationship properties the Infodex reads (its lenses), for BONDS.
const REL_PROPS = ("P171 P279 P31 P361 P1269 P527 P186 P2670 P150 P1056 P2974 P183 P9714 P276 P131 P17 P30 P706 P703 P1582 P1441 P1080 "
  + "P8345 P206 P376 P59 P397 P195 P61 P170 P50 P138 P495 P19 P144 P737 P155 P112 P84 P828 P366 P1542 P2283 P1552 P129 P2175 "
  + "P3780 P800 P106 P1535 P156 P2789 P460 P1889 P461 P1382 P3373 P2579 P101 P921 P425").split(" ");

export const typeOf = (k) => TYPES[k] || TYPES.WILD;
export function rarityFor(n) { return RARITY.find((r) => n >= r.min) || RARITY[RARITY.length - 1]; }
export function rarityByKey(k) { return RARITY.find((r) => r.key === k) || RARITY[1]; }
export const cardIdFor = (qid) => `card-${qid}`;

const itemIds = (list) => (list || []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

/** The card's type — exactly the Infodex v3 rule (see the module comment). */
export function classify(S, nodes, hints) {
  const p31 = S.p31 || [];
  const anywhere = (T) => (TYPES[T].hard || TYPES[T].roots).some((r) => r === S.qid || nodes[r] || p31.includes(r));
  if (anywhere("MYTH")) return "MYTH";
  if (anywhere("FIGURE")) return "FIGURE";
  if (hints.taxon) return "LIFE";
  const D = { [S.qid]: 0 };
  const queue = [];
  for (const q of hints.up || p31) if (D[q] == null) { D[q] = 1; queue.push(q); }
  while (queue.length) {
    const x = queue.shift();
    for (const p of Object.keys(nodes[x]?.parents || {})) if (D[p] == null) { D[p] = D[x] + 1; queue.push(p); }
  }
  let best = null;
  let bd = 1e9;
  const offer = (T, d) => { if (d < bd || (d === bd && TYPE_ORDER.indexOf(T) < TYPE_ORDER.indexOf(best))) { best = T; bd = d; } };
  if (hints.atomic || hints.formula) offer("MATTER", 1);
  if (hints.at) offer("EVENT", 1);
  for (const T of TYPE_ORDER) for (const r of TYPES[T].roots) if (D[r] != null) offer(T, D[r] + (ROOT_COST[r] || 0));
  return best || (hints.coord ? "REALM" : "WILD");
}

/** Greedy climb up the best-known parents (most Wikipedia editions), skipping unlabelled scaffolding. */
export function buildLadder(S, nodes) {
  const choose = (ps) => {
    const c = ps.filter((p) => nodes[p]);
    if (!c.length) return null;
    c.sort((a, b) => (nodes[b].n > 0) - (nodes[a].n > 0) || nodes[b].n - nodes[a].n);
    return c[0];
  };
  const chain = [{ qid: S.qid, label: S.label }];
  const seen = new Set([S.qid]);
  let cur = choose(S.direct || []);
  while (cur && !seen.has(cur) && chain.length < 40) {
    seen.add(cur);
    chain.push({ qid: cur, label: nodes[cur].label });
    if (TOP.has(cur)) break;
    cur = choose(Object.keys(nodes[cur].parents || {}));
  }
  return chain.reverse().filter((r) => r.qid === S.qid || !/^Q\d+$/.test(r.label));
}

/** Specimen (entity + ancestry) → card record. Pure; fetchCard does the network part. */
export function cardFromSpecimen(entity, nodes, { summary = null, now } = {}) {
  const claims = entity.claims || {};
  const S = {
    qid: entity.id,
    label: entity.labels?.en?.value || entity.id,
    desc: entity.descriptions?.en?.value || "",
    sitelinks: Object.keys(entity.sitelinks || {}).length,
  };
  S.isTaxon = !!claims.P171;
  const via = itemIds(claims.P171).length ? "P171" : itemIds(claims.P279).length ? "P279" : "P31";
  S.direct = itemIds(claims[via]);
  S.p31 = itemIds(claims.P31);
  const hints = { taxon: !!(claims.P171 || claims.P225), atomic: !!claims.P1086, formula: !!claims.P274, coord: !!claims.P625, at: !!claims.P585, up: itemIds(claims.P31).concat(itemIds(claims.P279)) };
  const ladder = buildLadder(S, nodes);
  const kind = classify(S, nodes, hints);
  const bonds = new Set(REL_PROPS.flatMap((p) => itemIds(claims[p])).filter((q) => q !== S.qid)).size;
  const img = (claims.P18 || []).map((c) => c.mainsnak?.datavalue?.value).find((v) => typeof v === "string");
  const sentence = String(summary?.extract || "").split(/(?<=\.)\s/)[0] || S.desc;
  return {
    id: cardIdFor(S.qid),
    type: "card",
    qid: S.qid,
    label: cap(S.label),
    desc: S.desc || undefined,
    kind,
    subtitle: cap(ladder.length > 1 ? ladder[ladder.length - 2].label : S.desc.split(/[,;(]/)[0]) || undefined,
    rarity: rarityFor(S.sitelinks).key,
    sitelinks: S.sitelinks,
    img: img ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.replace(/ /g, "_"))}?width=500` : undefined,
    lineage: ladder.slice(-5, -1).map((r) => cap(r.label)),
    stats: { depth: Math.max(0, ladder.length - 1), bonds, reach: S.sitelinks },
    flavor: sentence ? sentence.slice(0, 170) : undefined,
    links: [entity.sitelinks?.enwiki?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title.replace(/ /g, "_"))}` : null,
      `https://www.wikidata.org/wiki/${S.qid}`].filter(Boolean),
    added: now,
    updated: now,
    body: "",
  };
}

// Wikimedia serves thumbnails only at its standard widths now; any other width
// (the Infodex asked for 480) is refused, which showed as a broken picture.
const THUMB_STEPS = [120, 250, 330, 500, 960, 1280];
const step = (n) => THUMB_STEPS.find((w) => w >= n) || THUMB_STEPS.at(-1);

/** A card's picture link, made safe to load: Wikimedia thumbnail widths snapped to a standard step. */
export function artUrl(url) {
  const u = String(url || "");
  if (!/^https:\/\/(commons|upload)\.wikimedia\.org\//.test(u)) return u;
  return u
    .replace(/([?&]width=)(\d+)/, (m, k, n) => `${k}${step(Number(n))}`)
    .replace(/\/(\d+)px-([^/]+)$/, (m, n, f) => `/${step(Number(n))}px-${f}`);
}

/** The same picture at its original size — the last thing to try before the type's glyph. */
export function artOriginal(url) {
  const u = String(url || "");
  const thumb = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/(\w\/\w\w\/[^/]+)\/[^/]+$/.exec(u);
  if (thumb) return `https://upload.wikimedia.org/wikipedia/commons/${thumb[1]}`;
  if (/Special:FilePath\//.test(u)) return u.replace(/[?&]width=\d+/, "");
  return "";
}

/**
 * Your own cards (Dex imports, Wikidata cards, Atlas cards) matching what you
 * typed — every one of them, not a first page. Each word must appear somewhere:
 * the name counts most, then its subtitle and lineage, then the rest.
 */
export function searchCards(cards, query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const c of cards || []) {
    const name = foldText(c.label);
    const mid = foldText([c.subtitle, ...(c.lineage || []), c.kind, c.address?.domain].join(" "));
    const rest = foldText([c.desc, c.flavor, ...(c.questions || []), c.body, c.qid, c.atlas].join(" "));
    let s = name === words.join(" ") ? 50 : 0;
    for (const w of words) {
      if (name.split(" ").some((t) => t.startsWith(w))) s += 10;
      else if (name.includes(w)) s += 6;
      else if (mid.includes(w)) s += 3;
      else if (rest.includes(w)) s += 1;
      else { s = 0; break; }
    }
    if (s) out.push([s, c]);
  }
  return out.sort((a, b) => b[0] - a[0] || String(a[1].label).localeCompare(String(b[1].label))).map(([, c]) => c);
}
const foldText = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/** A card exported from the Infodex Dex (Export → JSON, `{ infodex: 1, cards: [...] }`) → card record. */
export function cardFromDex(c, { now } = {}) {
  if (!c || !/^Q\d+$/.test(String(c.qid || ""))) return null;
  const qs = (c.questions || []).map((q) => (typeof q === "string" ? q : q?.q || q?.text)).filter(Boolean);
  return {
    id: cardIdFor(c.qid),
    type: "card",
    qid: c.qid,
    label: c.label || c.qid,
    desc: c.desc || undefined,
    kind: TYPES[c.type] ? c.type : "WILD",
    subtitle: c.subtitle || undefined,
    rarity: rarityByKey(c.rarity).key,
    sitelinks: Number.isFinite(c.sitelinks) ? c.sitelinks : undefined,
    finish: FINISHES[c.finish] ? c.finish : undefined,
    insight: c.insight || undefined,
    img: c.img || undefined,
    lineage: c.lineage?.length ? c.lineage : undefined,
    stats: c.stats || undefined,
    flavor: c.flavor?.t || undefined,
    questions: qs.length ? qs : undefined,
    bridges: c.bridges?.length ? c.bridges.map((b) => (typeof b === "string" ? b : b?.label || b?.qid)).filter(Boolean) : undefined,
    links: [`https://www.wikidata.org/wiki/${c.qid}`],
    by: c.by || undefined,
    minted: c.minted || undefined,
    added: now,
    updated: now,
    body: "",
  };
}

/** Merge a fresh snapshot into an existing card without touching your entries (the body) or Dex fields. */
export function refreshCard(existing, fresh, { now } = {}) {
  if (!existing) return fresh;
  const keep = { body: existing.body, questions: existing.questions, bridges: existing.bridges, finish: existing.finish, insight: existing.insight, by: existing.by, minted: existing.minted, added: existing.added };
  return { ...existing, ...fresh, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)), updated: now };
}

const WD_API = "https://www.wikidata.org/w/api.php";
const WDQS = "https://query.wikidata.org/sparql";
const WP_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";
// Wikimedia asks scripts to identify themselves; browsers can't set User-Agent, so only Node sends it.
const UA = typeof window === "undefined" ? { "User-Agent": "LivingResearch/1.0 (https://github.com/sandstormveg/Journal_system)" } : {};

async function getJSON(fetchImpl, url, timeout = 15000) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", ...UA }, signal: ctl?.signal });
    if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
    return await res.json();
  } finally { if (t) clearTimeout(t); }
}

/** Things on Wikidata matching what you typed: [{ qid, label, desc }]. */
export async function searchThings(query, { fetchImpl = fetch, limit = 7 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  if (/^Q\d+$/i.test(q)) return [{ qid: q.toUpperCase(), label: q.toUpperCase(), desc: "Wikidata item" }];
  const j = await getJSON(fetchImpl, `${WD_API}?action=wbsearchentities&format=json&origin=*&language=en&uselang=en&type=item&limit=${limit}&search=${encodeURIComponent(q)}`);
  return (j.search || []).map((r) => ({ qid: r.id, label: r.label || r.id, desc: r.description || "" }));
}

/** Generate a card for a Wikidata item, live — the same steps as minting one in the Infodex. */
export async function fetchCard(qid, { fetchImpl = fetch, now } = {}) {
  const ent = await getJSON(fetchImpl, `${WD_API}?action=wbgetentities&format=json&origin=*&ids=${qid}&props=labels|descriptions|claims|sitelinks&languages=en&languagefallback=1`);
  const e = ent.entities && Object.values(ent.entities)[0];
  if (!e || e.missing !== undefined) throw new Error(`No such item: ${qid}`);
  const taxon = !!e.claims?.P171;
  const q = taxon
    ? `SELECT ?a ?aLabel ?p ?n WHERE { wd:${e.id} wdt:P171* ?a . OPTIONAL { ?a wdt:P171 ?p } OPTIONAL { ?a wikibase:sitelinks ?n } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
    : `SELECT ?a ?aLabel ?p ?n WHERE { wd:${e.id} (wdt:P31|wdt:P279)/wdt:P279* ?a . OPTIONAL { ?a wdt:P279 ?p } OPTIONAL { ?a wikibase:sitelinks ?n } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`;
  const nodes = {};
  try {
    const rows = (await getJSON(fetchImpl, `${WDQS}?format=json&query=${encodeURIComponent(q)}`, 25000)).results?.bindings || [];
    for (const r of rows) {
      const a = r.a.value.split("/").pop();
      const N = nodes[a] ||= { label: r.aLabel ? r.aLabel.value : a, n: r.n ? +r.n.value : 0, parents: {} };
      if (r.p) N.parents[r.p.value.split("/").pop()] = 1;
    }
  } catch { /* no ancestry: the card is still made, typed from its own statements */ }
  let summary = null;
  const title = e.sitelinks?.enwiki?.title;
  if (title) { try { summary = await getJSON(fetchImpl, WP_REST + encodeURIComponent(title.replace(/ /g, "_"))); } catch { /* optional */ } }
  return cardFromSpecimen(e, nodes, { summary, now });
}
