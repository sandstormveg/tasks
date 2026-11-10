// Local scouting, after GeoGuild's quest generator: real landmarks near you
// (Wikipedia's geosearch) become check-in quests. No AI and no account — one
// request, made with your position blurred to about a kilometre (geo.coarse),
// so Wikipedia never sees where you actually are.
//
// The same request brings each place's one-line description, two sentences of
// its article and its Wikidata id, so a quest knows what kind of place it is
// (a park to wander, a lookout to reach, a museum to visit, a story to find),
// trains a second attribute to match, and hides a find at the spot: the place's
// story (a scholar) or a cache with an Infodex lead (a chest), opened on check-in.

import { coarse } from "./geo.js";
import { slug } from "./quests.js";

export function geosearchUrl(pos, { radius = 5000, limit = 20, lang = "en" } = {}) {
  const c = coarse(pos);
  const q = new URLSearchParams({
    action: "query", generator: "geosearch", ggscoord: `${c.lat}|${c.lng}`, ggsradius: String(Math.min(radius, 10000)), ggslimit: String(Math.min(limit, 20)),
    prop: "coordinates|description|extracts|pageprops", colimit: "max", codistancefrompoint: `${c.lat}|${c.lng}`,
    exintro: "1", explaintext: "1", exsentences: "2", exlimit: "max", ppprop: "wikibase_item", format: "json", origin: "*",
  });
  return `https://${lang}.wikipedia.org/w/api.php?${q}`;
}

const SKIP = /^(List of|Electoral|.*\b(railway line|electorate|district|suburb|division)\b)/i;
// Places nobody wants a quest to: schools, stations, roads, offices.
const DULL = /\b(school|college|kindergarten|railway station|train station|bus station|metro station|road|street|highway|motorway|freeway|interchange|electoral|suburb|locality|council|company|headquarters|office building|hospital|substation|car park|shopping centre|apartment)\b/i;

/** What kind of place, what the quest asks, and what it trains beside AGI. First match wins. */
export const KINDS = [
  { id: "view", re: /\b(beach|bay|cove|lookout|headland|cape|hill|mount|mountain|summit|falls|waterfall|lake|lagoon|river|creek|island|cliffs?|pier|jetty|wharf)\b/i,
    title: (t) => `Reach ${t}`, ask: "Get there and take in the view. Stay ten minutes.", attributes: { agi: 1, vit: 0.5 }, enc: "chest" },
  { id: "nature", re: /\b(park|parkland|gardens?|reserve|forest|bushland|wetlands?|trail|track|walk|botanic)\b/i,
    title: (t) => `Wander ${t}`, ask: "Walk it end to end and find a spot worth sitting in.", attributes: { agi: 1, vit: 0.5 }, enc: "chest" },
  { id: "culture", re: /\b(museum|gallery|library|theatre|theater|cinema|opera|observatory|aquarium|zoo|arts? centre|conservatorium)\b/i,
    title: (t) => `Visit ${t}`, ask: "Go in and find one thing you didn't know.", attributes: { agi: 1, int: 0.5 }, enc: "scholar" },
  { id: "story", re: /\b(church|cathedral|chapel|temple|mosque|synagogue|heritage|historic|monument|memorial|statue|fort|lighthouse|castle|mill|cemetery|ruins?|tower|homestead|bridge|estate|listed)\b/i,
    title: (t) => `The story of ${t}`, ask: "Find the oldest detail you can.", attributes: { agi: 1, wis: 0.5 }, enc: "scholar" },
  { id: "social", re: /\b(market|square|plaza|pub|tavern|hotel|caf[eé]|stadium|arena|oval|pool|baths|club|hall)\b/i,
    title: (t) => `Drop in at ${t}`, ask: "Linger a while. Say hi to someone.", attributes: { agi: 1, cha: 0.5 }, enc: "chest" },
];
const PLAIN = { id: "place", title: (t) => `Scout: ${t}`, ask: "Find it and look around.", attributes: { agi: 1 }, enc: null };

const kindOf = (r) => KINDS.find((k) => k.re.test(`${r.title} ${r.description || ""}`)) || PLAIN;
const trim = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s || "");

/** Wikipedia's answer (generator pages, or the older plain geosearch list) as one shape. */
function rows(results) {
  if (Array.isArray(results)) return results;
  return Object.values(results || {}).map((p) => ({
    pageid: p.pageid, title: p.title, description: p.description, extract: p.extract, qid: p.pageprops?.wikibase_item,
    lat: p.coordinates?.[0]?.lat, lon: p.coordinates?.[0]?.lon, dist: p.coordinates?.[0]?.dist,
  }));
}

/** Wikipedia results → posted check-in quests: the most interesting few nearby, one of each kind first. */
export function scoutQuests(results, { taken = new Set(), now, max = 3 } = {}) {
  const pool = [];
  for (const r of rows(results)) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon) || SKIP.test(r.title) || DULL.test(`${r.title} ${r.description || ""}`)) continue;
    const id = `scout-${slug(r.title)}`.slice(0, 80);
    if (taken.has(id)) continue;
    pool.push({ r, id, kind: kindOf(r) });
  }
  // Named kinds before plain places, nearer first; then spread the picks across kinds.
  pool.sort((a, b) => (a.kind === PLAIN) - (b.kind === PLAIN) || (a.r.dist || 0) - (b.r.dist || 0));
  const picked = [], seen = new Set();
  for (const p of pool) if (picked.length < max && !seen.has(p.kind.id)) { picked.push(p); seen.add(p.kind.id); }
  for (const p of pool) if (picked.length < max && !picked.includes(p)) picked.push(p);
  return picked.map(({ r, id, kind }) => {
    const km = (r.dist || 0) / 1000;
    const far = km < 1 ? `${Math.round((r.dist || 0) / 10) * 10} m` : `${km.toFixed(1)} km`;
    const q = {
      id,
      title: kind.title(r.title),
      brief: `${kind.ask} About ${far} out${r.description ? ` · ${trim(r.description, 60)}` : ""}.`,
      status: "posted",
      origin: "local",
      giver: "board",
      author: "board",
      taskIds: [],
      difficulty: km < 1 ? "easy" : km < 3 ? "normal" : "hard",
      attributes: kind.attributes,
      proof: { type: "gps", target: { lat: r.lat, lng: r.lon, place: r.title, radius: 60 } },
      posted: now,
      link: `https://en.wikipedia.org/?curid=${r.pageid}`,
    };
    const lead = /^Q\d+$/.test(r.qid || "") ? [{ kind: "dex", qid: r.qid, label: r.title, why: "Chart it in the Infodex and mint its card." }] : [];
    if (kind.enc === "scholar" && r.extract) q.encounter = { type: "scholar", name: `The keeper of ${r.title}`, text: trim(r.extract, 320), loot: lead };
    else if (kind.enc === "chest" || (kind.enc === "scholar" && lead.length)) q.encounter = { type: "chest", name: `A cache at ${r.title}`, text: r.extract ? trim(r.extract, 200) : "Something's tucked away here.", loot: lead.length ? lead : [{ kind: "note", label: "You found it", why: "Snap a photo of the best bit." }] };
    return q;
  });
}
