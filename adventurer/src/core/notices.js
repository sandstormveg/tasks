// Another World notices: read-only commissions, story beats and notices the game
// posts into the private repo. Pure parse/filter logic; the app reads the file and
// the shell's Notices plugin shows a local notification for ids that are new.

/** {updated, notices} from the file text; a broken or missing file means no notices. */
export function noticesDoc(text) {
  if (!text) return { notices: [] };
  try {
    const doc = JSON.parse(text);
    const list = Array.isArray(doc?.notices) ? doc.notices : [];
    const notices = list.filter((n) => n && typeof n.id === "string" && typeof n.title === "string").map((n) => ({
      id: n.id,
      title: n.title,
      text: typeof n.text === "string" ? n.text : "",
      giver: typeof n.giver === "string" ? n.giver : "",
      kind: ["commission", "story", "notice"].includes(n.kind) ? n.kind : "notice",
      xp: Number.isFinite(Number(n.xp)) && n.xp !== null && n.xp !== "" ? Number(n.xp) : undefined,
      posted: typeof n.posted === "string" ? n.posted : "",
      expires: typeof n.expires === "string" ? n.expires : undefined,
    }));
    return { updated: typeof doc?.updated === "string" ? doc.updated : undefined, notices };
  } catch {
    return { notices: [] };
  }
}

/** Notices still running now, newest first. */
export function activeNotices(doc, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  const at = (s) => { const x = Date.parse(s || ""); return Number.isNaN(x) ? 0 : x; };
  return (doc?.notices || [])
    .filter((n) => !n.expires || !(at(n.expires) < t))
    .sort((a, b) => at(b.posted) - at(a.posted) || String(b.id).localeCompare(String(a.id)));
}

/** Ids present now that weren't there at the last sync. */
export function newNoticeIds(doc, seen) {
  const known = new Set(seen || []);
  return (doc?.notices || []).map((n) => n.id).filter((id) => !known.has(id));
}

/** Brass's one-a-day reminder: a training day, nothing done, past 18:00, not already sent today. */
export function brassDue({ today, now, rest = false, training = false, done = false, lastDay = null, enabled = true }) {
  if (!enabled || rest || !training || done || lastDay === today) return false;
  const d = now instanceof Date ? now : new Date(now);
  return d.getHours() >= 18;
}
