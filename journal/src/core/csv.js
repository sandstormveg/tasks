// RFC 4180 CSV parsing (quotes, escaped quotes, newlines inside fields, CRLF,
// BOM). Notion's database exports are CSV, and their property values often
// contain commas and line breaks.

export function parseCsv(text) {
  const s = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** CSV text -> {headers, records: [{header: value}]}. Duplicate headers get suffixes. */
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const seen = new Map();
  const headers = rows[0].map((h) => {
    const base = h.trim() || "column";
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
  const records = rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
    return o;
  });
  return { headers, records };
}
