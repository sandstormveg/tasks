// Exploratory statistics over your own days, written to be honest:
//  - a missing rating is missing, never zero;
//  - ratings on different scales are normalised explicitly, never mixed;
//  - every comparison reports its sample sizes and an uncertainty interval;
//  - "fewer entries" is reported as less evidence, not as less life.

import { normRating } from "./model.js";
import { compareDays, daysBetween, addDays, monthKey } from "./dates.js";

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Deterministic PRNG (mulberry32) so bootstrap results are reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rating summary for days in [from, to]. Values are on a 0..1 scale. */
export function ratingSummary(days, { from, to } = {}) {
  const inRange = days.filter((d) => (!from || compareDays(d.date, from) >= 0) && (!to || compareDays(d.date, to) <= 0));
  const vals = [];
  for (const d of inRange) {
    const v = normRating(d);
    if (v != null) vals.push(v);
  }
  const scales = [...new Set(inRange.filter((d) => d.rating != null).map((d) => Number(d.rating_scale) || 10))];
  return { n: vals.length, daysConsidered: inRange.length, missing: inRange.length - vals.length, mean: mean(vals), median: median(vals), scales };
}

/** Express a 0..1 value back on a scale, for display. */
export function onScale(v, scale = 10) {
  if (v == null) return null;
  const min = scale === 5 || scale === 10 ? 1 : 0;
  return min + v * (scale - min);
}

/**
 * Compare ratings on days that have a property vs days that don't.
 * groupFn(day) -> true | false | null (null = exclude from both groups).
 * Returns diff of means with a 95% bootstrap interval, and a plain verdict.
 */
export function compareGroups(days, groupFn, { iterations = 2000, seed = 7 } = {}) {
  const a = [], b = [];
  for (const d of days) {
    const v = normRating(d);
    if (v == null) continue;
    const g = groupFn(d);
    if (g === true) a.push(v);
    else if (g === false) b.push(v);
  }
  const out = { nWith: a.length, nWithout: b.length, meanWith: mean(a), meanWithout: mean(b), diff: null, ci: null, verdict: "too-few" };
  if (a.length < 5 || b.length < 5) return out;
  out.diff = out.meanWith - out.meanWithout;
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const diffs = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sa = 0, sb = 0;
    for (let k = 0; k < a.length; k++) sa += pick(a);
    for (let k = 0; k < b.length; k++) sb += pick(b);
    diffs[i] = sa / a.length - sb / b.length;
  }
  diffs.sort();
  out.ci = [diffs[Math.floor(iterations * 0.025)], diffs[Math.floor(iterations * 0.975)]];
  out.verdict = out.ci[0] > 0 ? "higher" : out.ci[1] < 0 ? "lower" : "unclear";
  return out;
}

/**
 * How much evidence exists for a period: entries, distinct days written,
 * weekly counts, and the longest silent stretch. Used to caption every
 * summary so absence of writing is never read as absence of experience.
 */
export function coverage(entries, { from, to } = {}) {
  const ds = entries.map((e) => e.day).filter(Boolean).filter((d) => (!from || compareDays(d, from) >= 0) && (!to || compareDays(d, to) <= 0)).sort();
  if (!ds.length) return { entries: 0, days: 0, from: from || null, to: to || null, longestGap: null, weekly: [], note: "No entries in this period." };
  const start = from || ds[0];
  const end = to || ds[ds.length - 1];
  const uniq = [...new Set(ds)];
  // Silent stretches: before the first entry, between entries, after the last.
  let longestGap = 0, gapFrom = null;
  const consider = (g, fromDay) => { if (g > longestGap) { longestGap = g; gapFrom = fromDay; } };
  consider(daysBetween(start, uniq[0]), start);
  for (let i = 1; i < uniq.length; i++) consider(daysBetween(uniq[i - 1], uniq[i]) - 1, addDays(uniq[i - 1], 1));
  consider(daysBetween(uniq[uniq.length - 1], end), addDays(uniq[uniq.length - 1], 1));
  const span = daysBetween(start, end) + 1;
  const weeks = Math.max(1, Math.ceil(span / 7));
  const weekly = new Array(weeks).fill(0);
  for (const d of ds) weekly[Math.min(weeks - 1, Math.floor(daysBetween(start, d) / 7))]++;
  const density = uniq.length / span;
  let note = `${ds.length} entr${ds.length === 1 ? "y" : "ies"} on ${uniq.length} of ${span} days.`;
  if (longestGap >= 14) note += ` Longest gap: ${longestGap} days from ${gapFrom} — less writing, not necessarily less happening.`;
  else if (density < 0.3) note += " Sparse coverage: treat patterns here as rough.";
  return { entries: ds.length, days: uniq.length, span, from: start, to: end, longestGap, gapFrom, weekly, density, note };
}

/** Monthly mean ratings with counts, for a gap-aware trend line. */
export function monthlyRatings(days) {
  const byMonth = new Map();
  for (const d of days) {
    const v = normRating(d);
    if (v == null) continue;
    const m = monthKey(d.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(v);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, vs]) => ({ month, n: vs.length, mean: mean(vs) }));
}

/** Tag frequencies over entries, with first/last use. */
export function tagCounts(entries) {
  const m = new Map();
  for (const e of entries) {
    for (const t of e.tags || []) {
      const cur = m.get(t) || { tag: t, count: 0, first: e.day, last: e.day };
      cur.count++;
      if (compareDays(e.day, cur.first) < 0) cur.first = e.day;
      if (compareDays(e.day, cur.last) > 0) cur.last = e.day;
      m.set(t, cur);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** Entries from this calendar date in earlier years. */
export function onThisDay(entries, today) {
  const md = today.slice(5);
  return entries.filter((e) => e.day && e.day.slice(5) === md && e.day.slice(0, 4) < today.slice(0, 4))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function daysAgo(today, n) {
  return addDays(today, -n);
}
