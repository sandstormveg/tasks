// Distances and check-ins, ported from GeoGuild (src/game/gps.ts). Pure, so the
// quest tool can use it in Node too.
//
// Privacy rule: your own position is only ever held in memory for a check-in.
// What gets saved is the distance and the time, never where you were standing.
// Places saved on quests are public landmarks, rounded with coarse() when they
// come from your surroundings rather than a named place.

const R = 6371e3;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Initial bearing, 0 = north. */
export function bearing(from, to) {
  const y = Math.sin(rad(to.lng - from.lng)) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lng - from.lng));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export function compass(deg) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

/** In range of a target? GPS on phones is often 10–30 m off, so the radius has a floor. */
export function checkIn(player, target, radius = 60, accuracy = 0) {
  const d = distanceMeters(player, target);
  const allowed = Math.max(radius, 40) + Math.min(accuracy || 0, 50);
  return { inRange: d <= allowed, distance: d, bearing: bearing(player, target), direction: compass(bearing(player, target)), allowed };
}

/** About a kilometre of blur (2 decimals): enough to find "places near you", not your door. */
export function coarse({ lat, lng }, decimals = 2) {
  const f = 10 ** decimals;
  return { lat: Math.round(lat * f) / f, lng: Math.round(lng * f) / f };
}

export function isCoords(c) {
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

/** GeoGuild's battery profiles, kept: a check-in is one fix, a hunt polls. */
export const GPS_MODES = {
  eco: { label: "Pulse (eco)", interval: 60000, highAccuracy: false },
  hunt: { label: "Hunt (live)", interval: 4000, highAccuracy: true },
};
