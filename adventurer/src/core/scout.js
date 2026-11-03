// Local scouting, after GeoGuild's quest generator: real landmarks near you
// (Wikipedia's geosearch) become check-in quests. No AI and no account — one
// request, made with your position blurred to about a kilometre (geo.coarse),
// so Wikipedia never sees where you actually are.

import { coarse } from "./geo.js";
import { slug } from "./quests.js";

export function geosearchUrl(pos, { radius = 5000, limit = 25, lang = "en" } = {}) {
  const c = coarse(pos);
  const q = new URLSearchParams({ action: "query", list: "geosearch", gscoord: `${c.lat}|${c.lng}`, gsradius: String(Math.min(radius, 10000)), gslimit: String(limit), format: "json", origin: "*" });
  return `https://${lang}.wikipedia.org/w/api.php?${q}`;
}

const SKIP = /^(List of|Electoral|.*\b(railway line|electorate|district|suburb|division)\b)/i;

/** Wikipedia results → posted check-in quests, nearest few that aren't on the board already. */
export function scoutQuests(results, { taken = new Set(), now, max = 3 } = {}) {
  const out = [];
  for (const r of results || []) {
    if (out.length >= max) break;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon) || SKIP.test(r.title)) continue;
    const id = `scout-${slug(r.title)}`.slice(0, 80);
    if (taken.has(id)) continue;
    const km = (r.dist || 0) / 1000;
    out.push({
      id,
      title: `Scout: ${r.title}`,
      brief: `Find ${r.title} and check in. About ${km < 1 ? `${Math.round(r.dist / 10) * 10} m` : `${km.toFixed(1)} km`} out.`,
      status: "posted",
      origin: "local",
      giver: "board",
      author: "board",
      taskIds: [],
      difficulty: km < 1 ? "easy" : km < 3 ? "normal" : "hard",
      attributes: { agi: 1 },
      proof: { type: "gps", target: { lat: r.lat, lng: r.lon, place: r.title, radius: 60 } },
      posted: now,
      link: `https://en.wikipedia.org/?curid=${r.pageid}`,
    });
  }
  return out;
}
