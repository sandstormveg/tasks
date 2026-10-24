// iCalendar (.ics) import. Calendar events become "imported events": context
// that sits alongside a day, never mixed into what you wrote about it.
//
// Selective by design: you pick a date range, and only events inside it are
// imported. Recurring events are expanded for the common rules (DAILY, WEEKLY
// with BYDAY, MONTHLY, YEARLY; INTERVAL, COUNT, UNTIL, EXDATE) within the range.

import { wallTimeToInstant, isoLocal, dayKey, compareDays } from "./dates.js";

function unfold(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(s) {
  return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/** Parse an ICS date/time value into {instant: Date, allDay}. */
export function parseIcsDate(value, params = {}, defaultTz = "UTC") {
  const v = String(value || "").trim();
  let m;
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { allDay: true, day: `${m[1]}-${m[2]}-${m[3]}`, instant: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const parts = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] || 0) };
  if (m[7]) return { allDay: false, instant: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)) };
  const tz = params.TZID || defaultTz;
  try {
    return { allDay: false, instant: wallTimeToInstant(parts, tz), tz };
  } catch {
    return { allDay: false, instant: wallTimeToInstant(parts, defaultTz), tz: defaultTz };
  }
}

/** Parse VEVENTs (without expansion). */
export function parseIcs(text, { defaultTz = "UTC" } = {}) {
  const lines = unfold(text).split("\n");
  const events = [];
  let cal = "";
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    const p = parseLine(line);
    if (!p) continue;
    if (!cur) {
      if (p.name === "X-WR-CALNAME") cal = unescapeText(p.value);
      continue;
    }
    switch (p.name) {
      case "UID": cur.uid = p.value; break;
      case "SUMMARY": cur.title = unescapeText(p.value); break;
      case "LOCATION": cur.location = unescapeText(p.value); break;
      case "DESCRIPTION": cur.description = unescapeText(p.value); break;
      case "DTSTART": cur.start = parseIcsDate(p.value, p.params, defaultTz); break;
      case "DTEND": cur.end = parseIcsDate(p.value, p.params, defaultTz); break;
      case "RRULE": cur.rrule = Object.fromEntries(p.value.split(";").map((kv) => kv.split("=")).map(([k, v]) => [k.toUpperCase(), v])); break;
      case "EXDATE": for (const v of p.value.split(",")) { const d = parseIcsDate(v, p.params, defaultTz); if (d) cur.exdates.push(d.instant.getTime()); } break;
      case "STATUS": cur.status = p.value; break;
      case "RECURRENCE-ID": cur.recurrenceId = parseIcsDate(p.value, p.params, defaultTz); break;
    }
  }
  for (const e of events) e.calendar = cal;
  return events.filter((e) => e.start);
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function* occurrences(ev, rangeEnd) {
  const first = ev.start.instant;
  if (!ev.rrule) { yield first; return; }
  const r = ev.rrule;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const until = r.UNTIL ? parseIcsDate(r.UNTIL)?.instant : null;
  const countMax = r.COUNT ? Number(r.COUNT) : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => DAYS[d.slice(-2)]).filter((d) => d != null) : null;
  let produced = 0;
  const limit = Math.min(until ? until.getTime() : Infinity, rangeEnd.getTime());
  const step = (d, n) => {
    const x = new Date(d);
    if (r.FREQ === "DAILY") x.setUTCDate(x.getUTCDate() + n);
    else if (r.FREQ === "WEEKLY") x.setUTCDate(x.getUTCDate() + 7 * n);
    else if (r.FREQ === "MONTHLY") x.setUTCMonth(x.getUTCMonth() + n);
    else if (r.FREQ === "YEARLY") x.setUTCFullYear(x.getUTCFullYear() + n);
    else return null;
    return x;
  };
  if (r.FREQ === "WEEKLY" && byday && byday.length) {
    // Walk week by week from the week containing the first occurrence.
    const weekStart = new Date(first);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    for (let w = 0; w < 5000; w += interval) {
      const base = new Date(weekStart);
      base.setUTCDate(base.getUTCDate() + 7 * w);
      for (const dow of [...byday].sort()) {
        const occ = new Date(base);
        occ.setUTCDate(occ.getUTCDate() + dow);
        occ.setUTCHours(first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds());
        if (occ < first) continue;
        if (occ.getTime() > limit || produced >= countMax) return;
        produced++;
        yield occ;
      }
    }
    return;
  }
  let d = first;
  for (let i = 0; i < 5000 && d && d.getTime() <= limit && produced < countMax; i++) {
    produced++;
    yield d;
    d = step(first, interval * (i + 1));
  }
}

/**
 * Expand and filter events into journal "event" records for days in [from, to].
 */
export function icsToEventRecords(text, { from, to, tz, calendarName } = {}) {
  const evs = parseIcs(text, { defaultTz: tz });
  const rangeEnd = new Date(Date.parse(to + "T23:59:59Z") + 86400_000);
  const out = [];
  const seen = new Set();
  for (const ev of evs) {
    const dur = ev.end ? ev.end.instant - ev.start.instant : 0;
    for (const occ of occurrences(ev, rangeEnd)) {
      if (ev.exdates.includes(occ.getTime())) continue;
      const day = ev.start.allDay ? occ.toISOString().slice(0, 10) : dayKey(occ, tz, 0);
      if ((from && compareDays(day, from) < 0) || (to && compareDays(day, to) > 0)) continue;
      const key = `${ev.uid || ev.title}|${occ.getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: "event",
        day,
        title: ev.title || "(untitled event)",
        start: ev.start.allDay ? day : isoLocal(occ, tz),
        end: ev.end ? (ev.start.allDay ? new Date(occ.getTime() + dur).toISOString().slice(0, 10) : isoLocal(new Date(occ.getTime() + dur), tz)) : undefined,
        all_day: ev.start.allDay || undefined,
        location: ev.location || undefined,
        calendar: calendarName || ev.calendar || undefined,
        source: { system: "ics", uid: ev.uid, occurrence: occ.toISOString() },
      });
    }
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
