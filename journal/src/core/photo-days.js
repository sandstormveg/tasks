// Sorting a batch of photos you pick (say, two weeks of your camera roll) onto
// the days they were taken — all of them, or just the first of each day.
//
// Which day a photo belongs to comes from when it was taken (EXIF), read as the
// wall-clock time where it was taken, with the journal's rollover: a photo at
// 2am counts toward the night before, as late-night writing does. A photo with
// no date inside it (screenshots, images saved from chats) can only be placed
// by its file date, which is often when it was saved or shared, not taken —
// so those are marked as guesses, and a day with only guesses isn't preselected.

import { isoLocal } from "./dates.js";

const WALL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

function prevDate(d) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}

/**
 * The journal day and an in-day sort key for a wall-clock time
 * ("2026-10-12T08:14:03+07:00"). Before the rollover hour it's the previous
 * day's late night, so it sorts after that day's evening.
 */
export function placeWallTime(iso, rolloverHour = 4) {
  const m = WALL.exec(String(iso || ""));
  if (!m) return null;
  const h = Number(m[2]);
  const early = h < rolloverHour;
  const day = early ? prevDate(m[1]) : m[1];
  const sort = `${String(early ? h + 24 : h).padStart(2, "0")}:${m[3]}:${m[4] || "00"}`;
  return { day, sort, time: `${m[2]}:${m[3]}` };
}

/**
 * items: [{ key, taken: ISO wall time or null, modified: ms or null }]
 * Returns { days: [{ day, photos: [{ key, time, guessed }] }], undated: [key] }:
 * days in date order, each day's photos in the order they were taken — photos
 * with a real date first, then any placed only by their file date.
 */
export function photosByDay(items, { tz, rolloverHour = 4 } = {}) {
  const byDay = new Map();
  const undated = [];
  for (const it of items) {
    let at = it.taken ? placeWallTime(it.taken, rolloverHour) : null;
    let guessed = false;
    if (!at && Number.isFinite(it.modified)) {
      at = placeWallTime(isoLocal(new Date(it.modified), tz), rolloverHour);
      guessed = true;
    }
    if (!at) { undated.push(it.key); continue; }
    if (!byDay.has(at.day)) byDay.set(at.day, []);
    byDay.get(at.day).push({ key: it.key, time: at.time, sort: at.sort, guessed });
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, ps]) => ({
      day,
      photos: ps.sort((a, b) => (a.guessed - b.guessed) || a.sort.localeCompare(b.sort)).map(({ sort, ...p }) => p),
    }));
  return { days, undated };
}

/** Just the first photo of each day (a real date beats a guess). */
export function firstPhotoPerDay(items, opts = {}) {
  const { days, undated } = photosByDay(items, opts);
  return { days: days.map((d) => ({ day: d.day, ...d.photos[0], count: d.photos.length })), undated };
}
