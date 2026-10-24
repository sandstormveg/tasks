// Date handling for a journal that travels.
//
// Two ideas matter here:
//  1. A "day key" (YYYY-MM-DD) is the *local* calendar day in the timezone you
//     were in when you wrote, not UTC. Writing at 11pm in Hanoi belongs to that
//     Hanoi day even if it is already tomorrow in UTC.
//  2. A rollover hour (default 4am): writing at 1am about "today" usually means
//     the day that just ended, so captures before the rollover count toward the
//     previous day. The composer always shows which day it will file under.
//
// Everything is pure and works in Node (for tests and tools) and the browser.

export const DEFAULT_ROLLOVER_HOUR = 4;

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const partsCache = new Map();
function formatterFor(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a timezone. */
export function wallParts(date, tz = deviceTimeZone()) {
  const out = {};
  for (const p of formatterFor(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out; // {year, month, day, hour, minute, second}
}

/** Offset of tz from UTC at an instant, in minutes (e.g. +420 for Hanoi). */
export function tzOffsetMinutes(date, tz = deviceTimeZone()) {
  const p = wallParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const ms = date.getTime() - (date.getTime() % 1000);
  return Math.round((asUTC - ms) / 60000);
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** ISO 8601 with the local offset of tz, e.g. 2026-10-20T14:32:10+07:00. */
export function isoLocal(date = new Date(), tz = deviceTimeZone()) {
  const p = wallParts(date, tz);
  const off = tzOffsetMinutes(date, tz);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** The journal day an instant belongs to, honouring the rollover hour. */
export function dayKey(date = new Date(), tz = deviceTimeZone(), rolloverHour = DEFAULT_ROLLOVER_HOUR) {
  const shifted = new Date(date.getTime() - rolloverHour * 3600_000);
  const p = wallParts(shifted, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function isDayKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

export function parseDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Day key -> Date at UTC noon (safe for weekday/month arithmetic). */
export function dayToDate(key) {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function dateToDay(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key, n) {
  const d = dayToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToDay(d);
}

export function daysBetween(a, b) {
  return Math.round((dayToDate(b) - dayToDate(a)) / 86400_000);
}

export function compareDays(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function weekdayIndex(key) {
  return dayToDate(key).getUTCDay(); // 0 = Sunday
}

/** Every day key from a to b inclusive. */
export function dayRange(a, b) {
  const out = [];
  if (compareDays(a, b) > 0) return out;
  for (let k = a; compareDays(k, b) <= 0; k = addDays(k, 1)) out.push(k);
  return out;
}

export function formatDay(key, opts = {}, locale = undefined) {
  return dayToDate(key).toLocaleDateString(locale, { timeZone: "UTC", ...opts });
}

export function formatDayLong(key, locale) {
  return formatDay(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale);
}

export function formatMonth(mk, locale) {
  return dayToDate(mk + "-01").toLocaleDateString(locale, { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "14:32" from an ISO-with-offset string, read as the wall time it records. */
export function wallTimeOf(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? `${m[1]}:${m[2]}` : "";
}

/** Day key embedded in an ISO-with-offset string (its own wall date). */
export function wallDayOf(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso || "");
  return m ? m[1] : null;
}

export function relativeDayLabel(key, today) {
  const diff = daysBetween(key, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return formatDay(key, { weekday: "long" });
  return formatDay(key, { day: "numeric", month: "short", year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}

/**
 * Convert a wall-clock time in a named timezone to a UTC Date. Used for ICS
 * TZID times. Iterates because the offset depends on the instant (DST).
 */
export function wallTimeToInstant({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const off = tzOffsetMinutes(new Date(guess), tz);
    const next = Date.UTC(year, month - 1, day, hour, minute, second) - off * 60000;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function validYMD(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseClock(rest) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(rest || "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[4] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/**
 * Parse the many date spellings found in exports (Notion, CSV, hand-typed).
 * Returns {day, time, confidence: "high"|"ambiguous", note} or null.
 * Never guesses silently: d/m vs m/d ambiguity is reported, not resolved.
 */
export function parseLooseDate(input, { preferDayFirst = true } = {}) {
  if (input == null) return null;
  let s = String(input).trim().replace(/^@/, "");
  if (!s) return null;
  let note;
  const arrow = s.split(/\s*(?:→|->|–|—)\s*/);
  if (arrow.length > 1 && arrow[1]) {
    note = `range: ${s}`;
    s = arrow[0];
  }
  let m;
  // ISO / YYYY-MM-DD / YYYY/MM/DD
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(s))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!validYMD(y, mo, d)) return null;
    return { day: `${y}-${pad(mo)}-${pad(d)}`, time: parseClock(m[4]), confidence: "high", note };
  }
  // "October 20, 2026" / "Oct 20 2026" / "October 20, 2026 9:30 PM"
  if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(.*)$/.exec(s))) {
    const mo = MONTHS[m[1].toLowerCase()];
    const [d, y] = [Number(m[2]), Number(m[3])];
    if (!mo || !validYMD(y, mo, d)) return null;
    return { day: `${y}-${pad(mo)}-${pad(d)}`, time: parseClock(m[4]), confidence: "high", note };
  }
  // "20 October 2026"
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})(.*)$/.exec(s))) {
    const mo = MONTHS[m[2].toLowerCase()];
    const [d, y] = [Number(m[1]), Number(m[3])];
    if (!mo || !validYMD(y, mo, d)) return null;
    return { day: `${y}-${pad(mo)}-${pad(d)}`, time: parseClock(m[4]), confidence: "high", note };
  }
  // 20/10/2026 or 10/20/2026 — ambiguous unless one part > 12
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(.*)$/.exec(s))) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    let d, mo, confidence = "high";
    if (a > 12 && b <= 12) { d = a; mo = b; }
    else if (b > 12 && a <= 12) { d = b; mo = a; }
    else if (a === b) { d = a; mo = b; }
    else {
      confidence = "ambiguous";
      if (preferDayFirst) { d = a; mo = b; } else { d = b; mo = a; }
    }
    if (!validYMD(y, mo, d)) return null;
    return {
      day: `${y}-${pad(mo)}-${pad(d)}`, time: parseClock(m[4]), confidence,
      note: confidence === "ambiguous" ? `ambiguous day/month in "${s}" — read as ${preferDayFirst ? "day/month" : "month/day"}` : note,
    };
  }
  return null;
}
