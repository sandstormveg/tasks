// The journal's Primer feed (primer/themes.jsonl in the private repo): one JSON
// object per line, abstract themes only. The app reads it and can retire a line;
// it never edits themes, never deletes lines, and never sees journal text.

/** Parse JSONL into entries with a string id and theme strings; broken lines are skipped. */
export function primerEntries(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => {
    try {
      const e = JSON.parse(l);
      if (e && typeof e.id === "string" && Array.isArray(e.themes)) return [{ ...e, themes: e.themes.filter((t) => typeof t === "string") }];
    } catch {}
    return [];
  });
}

/** Newest first by toggledAt; an unreadable date sorts last. */
export function sortPrimer(entries) {
  const at = (e) => { const t = Date.parse(e.toggledAt || ""); return Number.isNaN(t) ? 0 : t; };
  return [...entries].sort((a, b) => at(b) - at(a) || String(b.id).localeCompare(String(a.id)));
}

/** Rewrite only that one line with untoggledAt = now; every other line stays as it was. */
export function setUntoggled(text, id, now) {
  return String(text || "").split("\n").map((line) => {
    const t = line.trim();
    if (!t) return line;
    let e;
    try { e = JSON.parse(t); } catch { return line; }
    if (!e || e.id !== id) return line;
    return JSON.stringify({ ...e, untoggledAt: now });
  }).join("\n");
}
