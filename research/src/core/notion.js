// Importing a Notion journal export (Markdown & CSV) without losing anything.
//
// Migration requirements (design doc §11) and how they're met:
//  - original text, dates, ratings, best/worst moments, categories, tags:
//      mapped by a column mapping you can review and change;
//  - fields that don't map cleanly: kept verbatim under `imported.notion`;
//  - attachments: located in the zip and attached as media;
//  - provenance: every entry records database, page id, and file path;
//  - duplicates: re-importing the same page is detected by its Notion id;
//  - uncertain conversions (ambiguous dates, unparseable ratings, missing
//    files, conflicting day ratings) are flagged in a report, never dropped;
//  - selective import: per database, per date range;
//  - verification: the report counts pages found vs. imported vs. skipped.
//
// This module is pure: it works on a file listing + a text reader, so it runs
// in the browser (over a zip) and in Node tests (over fixtures).

import { parseLooseDate, compareDays } from "./dates.js";
import { csvToObjects } from "./csv.js";
import { newId } from "./ids.js";
import { extractTags } from "./markdown.js";
import { EXT_MIME } from "./format.js";

const HEX_RE = /\s+([0-9a-f]{32}|[0-9a-f]{16,31})$/i;

export function stripNotionId(name) {
  const base = name.replace(/\.(md|csv)$/i, "").replace(/_all$/, "");
  const m = HEX_RE.exec(base);
  return { name: m ? base.slice(0, m.index) : base, id: m ? m[1].toLowerCase() : null };
}

function basename(p) { return p.split("/").pop(); }
function dirname(p) { const i = p.lastIndexOf("/"); return i === -1 ? "" : p.slice(0, i); }

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function joinPath(dir, rel) {
  const parts = (dir ? dir.split("/") : []);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Parse a rating string. Returns {value, scaleHint, raw, form} or {value: null, raw}. */
export function parseRating(raw) {
  if (raw == null) return { value: null, raw: null };
  const s = String(raw).trim();
  if (!s) return { value: null, raw: s };
  const stars = (s.match(/[⭐★]/gu) || []).length;
  if (stars && /^[⭐★☆\s]+$/u.test(s)) {
    return { value: stars, scaleHint: Math.max(5, (s.match(/[⭐★☆]/gu) || []).length), raw: s, form: "stars" };
  }
  let m;
  if ((m = /^(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+)$/.exec(s))) return { value: Number(m[1].replace(",", ".")), scaleHint: Number(m[2]), raw: s, form: "fraction" };
  if ((m = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(s))) return { value: Number(m[1].replace(",", ".")), scaleHint: 100, raw: s, form: "percent" };
  if ((m = /^(-?\d+(?:[.,]\d+)?)$/.exec(s))) return { value: Number(m[1].replace(",", ".")), raw: s, form: "number" };
  if ((m = /^(\d+(?:\.\d+)?)\b/.exec(s))) return { value: Number(m[1]), raw: s, form: "leading-number", uncertain: true };
  return { value: null, raw: s, form: "label" };
}

/**
 * Pick the database's default scale (5, 10 or 100) from plain numbers.
 * Values that carry their own scale ("⭐⭐⭐" → 5, "9/10" → 10) keep it and
 * don't decide the default; with only such values, the largest hint is used.
 */
export function inferScale(parsed) {
  const plain = parsed.filter((p) => p.value != null && !p.scaleHint).map((p) => p.value);
  if (!plain.length) {
    const hints = parsed.map((p) => p.scaleHint).filter(Boolean);
    return hints.length ? Math.max(...hints) : 10;
  }
  const max = Math.max(...plain);
  return max <= 5 ? 5 : max <= 10 ? 10 : 100;
}

/**
 * Split a Notion page's markdown into title, property lines and body.
 * knownKeys: column names from the database CSV (so only real properties are
 * consumed); without them, a heuristic reads "Key: Value" lines right after
 * the title and flags the result as uncertain.
 */
export function parseNotionPage(md, knownKeys = null) {
  const lines = String(md || "").replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let title = "";
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) { title = lines[i].replace(/^#\s+/, "").trim(); i++; }
  while (i < lines.length && !lines[i].trim()) i++;
  const props = {};
  const known = knownKeys ? new Set(knownKeys.map((k) => k.trim())) : null;
  let heuristic = !known;
  const start = i;
  while (i < lines.length) {
    const m = /^([^:\n]{1,60}):\s?(.*)$/.exec(lines[i]);
    if (!m) break;
    const key = m[1].trim();
    if (known && !known.has(key)) break;
    if (!known && (key.includes("http") || key.split(/\s+/).length > 5 || key in props)) break;
    props[key] = m[2].trim();
    i++;
    if (!known && i - start > 25) break;
  }
  if (heuristic && Object.keys(props).length && i < lines.length && lines[i].trim()) {
    // Properties not followed by a blank line: probably body text, not properties.
    for (const k of Object.keys(props)) delete props[k];
    i = start;
  }
  const body = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  return { title, props, body, heuristic: heuristic && Object.keys(props).length > 0 };
}

/**
 * Index an export. files: [{path, size}]; readText(path) -> Promise<string>.
 * Returns {databases: [...], loosePages: [...], fileSet: Set<path>}.
 */
export async function indexExport(files, readText) {
  const paths = files.map((f) => f.path).filter((p) => !p.endsWith("/") && !p.split("/").some((s) => s === "__MACOSX" || s.startsWith("._")));
  const fileSet = new Set(paths);
  const csvs = paths.filter((p) => p.toLowerCase().endsWith(".csv"));
  // Prefer "<db>_all.csv" (all rows) over the view-filtered "<db>.csv".
  const byDb = new Map();
  for (const p of csvs) {
    const key = p.replace(/_all\.csv$/i, ".csv");
    if (!byDb.has(key) || /_all\.csv$/i.test(p)) byDb.set(key, p);
  }
  const databases = [];
  const claimed = new Set();
  for (const [key, csvPath] of byDb) {
    const { name, id } = stripNotionId(basename(key));
    const folder = key.replace(/\.csv$/i, "");
    let table = { headers: [], records: [] };
    try { table = csvToObjects(await readText(csvPath)); } catch { /* reported below */ }
    const pages = paths.filter((p) => p.toLowerCase().endsWith(".md") && dirname(p) === folder);
    for (const p of pages) claimed.add(p);
    databases.push({ name, id, csvPath, folder, columns: table.headers, rows: table.records, pagePaths: pages });
  }
  const loosePages = paths.filter((p) => p.toLowerCase().endsWith(".md") && !claimed.has(p));
  return { databases, loosePages, fileSet };
}

const GUESS = [
  ["date", /^(date|day|when|entry date|journal date|created|created time|date created)$/i, /date|day|when|created/i],
  ["rating", /^(rating|day rating|score|stars|mood|mood rating|how was (my|the) day)$/i, /rating|score|stars|mood/i],
  ["best", /^(best|best moment|best part|highlight|highlights|high|high ?point|wins?|grateful|gratitude)$/i, /best|highlight|grateful|gratitude|win/i],
  ["hardest", /^(worst|worst moment|hardest|hardest moment|low|low ?point|lowlight|difficult|challenge|struggle)$/i, /worst|hard|low ?point|difficult|challenge|struggle/i],
  ["category", /^(category|categories|type|area|kind|section)$/i, /category|type|area/i],
  ["tags", /^(tags?|labels?|topics?|themes?)$/i, /tag|label|topic|theme/i],
  ["emotions", /^(emotions?|feelings?|mood words|moods)$/i, /emotion|feeling/i],
];

export const MAPPABLE_FIELDS = {
  date: "Date", rating: "Day rating", best: "Best moment", hardest: "Hardest moment",
  category: "Category", tags: "Tags", emotions: "Feelings", ignore: "Keep as imported property",
};

/** Guess a column -> field mapping. Values are sampled to break ties. */
export function guessMapping(db) {
  const mapping = {};
  const used = new Set();
  const titleCol = db.columns[0];
  for (const col of db.columns) {
    if (col === titleCol) continue;
    let pick = "ignore";
    for (const [field, exact] of GUESS) if (!used.has(field) && exact.test(col.trim())) { pick = field; break; }
    if (pick === "ignore") for (const [field, , loose] of GUESS) if (!used.has(field) && loose.test(col)) { pick = field; break; }
    if (pick === "date") {
      const sample = db.rows.slice(0, 30).map((r) => r[col]).filter(Boolean);
      if (sample.length && sample.filter((v) => parseLooseDate(v)).length < sample.length * 0.6) pick = "ignore";
    }
    if (pick === "rating") {
      const sample = db.rows.slice(0, 30).map((r) => r[col]).filter(Boolean);
      if (sample.length && sample.filter((v) => parseRating(v).value != null).length < sample.length * 0.5) pick = "ignore";
    }
    if (pick !== "ignore") used.add(pick);
    mapping[col] = pick;
  }
  // "Created time" only as the date if nothing better exists.
  const dateCols = Object.entries(mapping).filter(([, f]) => f === "date");
  if (!dateCols.length) {
    const created = db.columns.find((c) => /created/i.test(c));
    if (created) mapping[created] = "date";
  }
  return { titleColumn: titleCol, mapping };
}

function splitMulti(v) {
  return String(v || "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}

function dateFromTitle(title) {
  const p = parseLooseDate(title);
  return p && p.confidence === "high" ? p : null;
}

/**
 * Plan an import without writing anything (a dry run).
 * options: {databases: [{db, mapping, titleColumn}], loosePages: [paths], readText,
 *           from, to, existingSourceIds: Set, existingDays: Map(date -> day),
 *           ratingScale (override), preferDayFirst, includeUndated, undatedDay, tz}
 * Returns {entries, dayUpdates: Map, attachments, report}.
 */
export async function planImport(index, options) {
  const { readText, from, to, existingSourceIds = new Set(), existingDays = new Map(), preferDayFirst = true } = options;
  const report = {
    pagesFound: 0, pagesPlanned: 0, skippedDuplicate: 0, skippedOutOfRange: 0, undated: 0,
    attachmentsFound: 0, attachmentsMissing: 0, ratingsParsed: 0, ratingsUnparsed: 0,
    dayConflicts: 0, issues: [], databases: [],
  };
  const issue = (severity, page, message) => report.issues.push({ severity, page, message });
  const entries = [];
  const attachments = [];
  const dayUpdates = new Map();
  const seenContent = new Map();

  const jobs = [];
  for (const sel of options.databases || []) {
    for (const p of sel.db.pagePaths) jobs.push({ path: p, db: sel.db, mapping: sel.mapping, titleColumn: sel.titleColumn });
  }
  for (const p of options.loosePages || []) jobs.push({ path: p, db: null, mapping: {}, titleColumn: null });
  report.pagesFound = jobs.length;

  // Rating scale per database, inferred from all its values (unless overridden).
  const scales = new Map();
  for (const sel of options.databases || []) {
    const col = Object.entries(sel.mapping).find(([, f]) => f === "rating")?.[0];
    const parsed = col ? sel.db.rows.map((r) => parseRating(r[col])).filter((x) => x.value != null) : [];
    scales.set(sel.db, options.ratingScale || inferScale(parsed));
    const plainMax = Math.max(0, ...parsed.filter((x) => !x.scaleHint).map((x) => x.value));
    if (!options.ratingScale && scales.get(sel.db) === 5 && plainMax > 0) {
      issue("info", sel.db.name, `Ratings were read on a 1–5 scale (highest number seen: ${plainMax}). If your scale was 1–10, choose it in the import options.`);
    }
    report.databases.push({ name: sel.db.name, pages: sel.db.pagePaths.length, rows: sel.db.rows.length, ratingScale: scales.get(sel.db) });
    if (sel.db.rows.length && sel.db.rows.length !== sel.db.pagePaths.length) {
      issue("info", sel.db.name, `CSV lists ${sel.db.rows.length} rows but ${sel.db.pagePaths.length} page files were found — rows without a page file have no body text and are imported from the CSV alone.`);
    }
  }

  const rowsUsed = new Map();
  const processPage = (job, page, row) => {
    const { id: pageId, name: fileTitle } = stripNotionId(basename(job.path));
    const title = page.title || fileTitle;
    if (page.heuristic) issue("info", job.path, "Properties were read heuristically (no database CSV) — check the result.");
    // CSV values win over the page's property lines: the CSV keeps multi-line values intact.
    let props = { ...page.props };
    if (job.db && row === undefined) {
      const rows = job.db.rows.filter((r) => (r[job.titleColumn] || "").trim() === title.trim());
      const used = rowsUsed.get(job.db) || new Set();
      row = rows.find((r) => !used.has(r)) || null;
      if (row) { used.add(row); rowsUsed.set(job.db, used); }
    }
    if (row) { props = { ...props, ...row }; delete props[job.titleColumn]; }
    // Field mapping.
    const fields = { tags: [], emotions: [] };
    const unmapped = {};
    for (const [col, value] of Object.entries(props)) {
      const field = job.mapping[col] || "ignore";
      if (value == null || value === "") continue;
      if (field === "ignore") { unmapped[col] = value; continue; }
      if (field === "tags") fields.tags.push(...splitMulti(value));
      else if (field === "emotions") fields.emotions.push(...splitMulti(value).map((s) => s.toLowerCase()));
      else if (field === "category") fields.category = splitMulti(value)[0] || value;
      else fields[field] = value;
    }
    // Date: mapped property, else the title, else undated.
    let when = fields.date ? parseLooseDate(fields.date, { preferDayFirst }) : null;
    if (fields.date && !when) issue("warn", job.path, `Couldn't read the date "${fields.date}".`);
    if (!when) when = dateFromTitle(title);
    if (when?.confidence === "ambiguous") issue("warn", job.path, when.note);
    if (when?.note && when.confidence !== "ambiguous") issue("info", job.path, when.note);
    if (!when) {
      report.undated++;
      if (!options.includeUndated) { issue("warn", job.path, "No date found — skipped (enable “import undated pages” to include it)."); return; }
      when = { day: options.undatedDay, time: null, confidence: "fallback" };
      fields.tags.push("undated-import");
    }
    if ((from && compareDays(when.day, from) < 0) || (to && compareDays(when.day, to) > 0)) { report.skippedOutOfRange++; return; }
    const sourceId = job.csvOnly ? `notion-row:${job.db.name}:${title}:${when.day}` : pageId ? `notion:${pageId}` : `notion-path:${job.path}`;
    if (existingSourceIds.has(sourceId)) { report.skippedDuplicate++; return; }

    // Attachments referenced from the body.
    const dir = dirname(job.path);
    const media = [];
    let body = page.body.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (m, bang, alt, href) => {
      if (/^(https?:|mailto:|#)/i.test(href)) return m;
      const rel = safeDecode(href.split(/\s+"/)[0]);
      const zipPath = joinPath(dir, rel);
      report.attachmentsFound++;
      if (!index.fileSet.has(zipPath)) {
        report.attachmentsMissing++;
        issue("warn", job.path, `Attachment not found in export: ${rel}`);
        return `${bang}[${alt || basename(rel)} (missing from export)](${href})`;
      }
      const ext = (zipPath.split(".").pop() || "").toLowerCase();
      const mime = EXT_MIME[ext] || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const mediaId = newId("m", `${when.day}T12:00`);
      // Notion fills alt text with the file path; only a real caption is kept as one.
      const caption = alt && alt !== rel && alt !== basename(rel) && !/\.[a-z0-9]{2,5}$/i.test(alt) ? alt : undefined;
      media.push({ id: mediaId, type: isImage ? "photo" : mime.startsWith("audio/") ? "audio" : "file", mime, original_name: basename(rel), caption });
      attachments.push({ mediaId, zipPath, mime, isImage });
      return isImage ? `![${caption || ""}](media:${mediaId})` : `[${alt || basename(rel)}](media:${mediaId})`;
    });
    body = body.replace(/\s+$/, "");

    // Duplicate content within the export (same date + same text).
    const contentKey = `${when.day}|${title}|${body.slice(0, 500)}`;
    if (seenContent.has(contentKey)) {
      issue("warn", job.path, `Looks identical to ${seenContent.get(contentKey)} — imported anyway, flagged #possible-duplicate.`);
      fields.tags.push("possible-duplicate");
    } else seenContent.set(contentKey, job.path);

    const created = `${when.day}T${when.time || "12:00"}:00`;
    const titleIsDate = !!dateFromTitle(title);
    const allTags = [...new Set([...fields.tags.map((t) => t.toLowerCase().replace(/\s+/g, "-")), ...extractTags(body)])];
    const entry = {
      id: newId("e", created),
      type: "entry",
      kind: "import",
      day: when.day,
      created,
      updated: created,
      title: titleIsDate ? undefined : title,
      author: "self",
      privacy: "normal",
      tags: allTags,
      category: fields.category,
      media,
      body,
      source: {
        system: "notion", id: sourceId, database: job.db?.name, path: job.path,
        time_known: !!when.time, date_confidence: when.confidence,
      },
      imported: Object.keys(unmapped).length || Object.keys(props).length ? { notion: { properties: unmapped, original: props } } : undefined,
    };
    entries.push(entry);
    report.pagesPlanned++;

    // Day-level fields.
    const hasDayFields = fields.rating != null || fields.best || fields.hardest || fields.emotions.length;
    if (hasDayFields) {
      const cur = dayUpdates.get(when.day) || { ...(existingDays.get(when.day) || { id: when.day, type: "day", date: when.day }) };
      const scale = job.db ? scales.get(job.db) : options.ratingScale || 10;
      if (fields.rating != null) {
        const r = parseRating(fields.rating);
        if (r.value == null) { report.ratingsUnparsed++; issue("warn", job.path, `Rating "${fields.rating}" isn't a number — kept as text.`); }
        else {
          report.ratingsParsed++;
          if (r.uncertain) issue("info", job.path, `Read rating "${r.raw}" as ${r.value}.`);
          if (cur.rating != null && Number(cur.rating) !== r.value) {
            report.dayConflicts++;
            issue("warn", job.path, `${when.day} already has rating ${cur.rating}; this page says ${r.raw}. Kept the first; this one is preserved on the entry.`);
          } else { cur.rating = r.value; cur.rating_scale = r.scaleHint || scale; }
        }
        cur.imported = { ...(cur.imported || {}), notion: { ...(cur.imported?.notion || {}), rating: r.raw } };
      }
      for (const f of ["best", "hardest"]) {
        if (!fields[f]) continue;
        if (cur[f] && cur[f] !== fields[f]) { cur[f] = `${cur[f]}\n\n${fields[f]}`; issue("info", job.path, `${when.day}: combined two "${f}" values.`); }
        else cur[f] = fields[f];
      }
      if (fields.emotions.length) cur.emotions = [...new Set([...(cur.emotions || []), ...fields.emotions])];
      cur.source = cur.source || { system: "notion" };
      dayUpdates.set(when.day, cur);
    }
  };

  for (const job of jobs) {
    let md = "";
    try { md = await readText(job.path); } catch (err) { issue("error", job.path, `Could not read page: ${err.message}`); continue; }
    processPage(job, parseNotionPage(md, job.db ? job.db.columns : null));
  }
  // Database rows that had no page file still carry their properties.
  for (const sel of options.databases || []) {
    const used = rowsUsed.get(sel.db) || new Set();
    for (const row of sel.db.rows) {
      if (used.has(row)) continue;
      const title = (row[sel.titleColumn] || "").trim();
      report.pagesFound++;
      processPage({ path: `${sel.db.csvPath}#${title}`, db: sel.db, mapping: sel.mapping, titleColumn: sel.titleColumn, csvOnly: true }, { title, props: {}, body: "", heuristic: false }, row);
    }
  }
  report.daysUpdated = dayUpdates.size;
  return { entries, dayUpdates, attachments, report };
}

/** Human-readable verification report (Markdown) to keep alongside the import. */
export function reportMarkdown(report, { exportName, when } = {}) {
  const lines = [
    `# Notion import — ${when || ""}`,
    "",
    exportName ? `Export file: \`${exportName}\`` : "",
    "",
    "| Check | Count |", "| --- | ---: |",
    `| Pages found | ${report.pagesFound} |`,
    `| Pages imported | ${report.pagesPlanned} |`,
    `| Skipped as already imported | ${report.skippedDuplicate} |`,
    `| Skipped outside date range | ${report.skippedOutOfRange} |`,
    `| Pages with no date | ${report.undated} |`,
    `| Days with ratings/moments | ${report.daysUpdated ?? 0} |`,
    `| Ratings read / unreadable | ${report.ratingsParsed} / ${report.ratingsUnparsed} |`,
    `| Day rating conflicts | ${report.dayConflicts} |`,
    `| Attachments found / missing | ${report.attachmentsFound - report.attachmentsMissing} / ${report.attachmentsMissing} |`,
    "",
    "Every page found = imported + already imported + out of range + undated-and-skipped + unreadable.",
    "",
  ];
  for (const db of report.databases) lines.push(`- Database **${db.name}**: ${db.pages} pages, ${db.rows} CSV rows, ratings read on a 1–${db.ratingScale} scale`);
  if (report.issues.length) {
    lines.push("", "## Flagged for review", "");
    for (const i of report.issues) lines.push(`- **${i.severity}** \`${i.page}\` — ${i.message}`);
  }
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
