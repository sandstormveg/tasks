// The portable on-disk format: one Markdown file per record with YAML
// frontmatter (plus a few YAML config files and binary media). This is what
// gets synced to your private GitHub repo and what an export zip contains, so
// the journal stays readable with nothing but a text editor.
//
// Serialisation is deterministic (fixed key order, fixed YAML style) so that an
// unchanged record always produces byte-identical content — the sync engine
// relies on that to avoid spurious commits.

import { load, dump, CORE_SCHEMA } from "../../vendor/js-yaml.js";
import { isSafeId } from "./ids.js";

const FM = "---";

// Known fields in the order they should appear. Unknown fields (added by hand,
// by a steward session, or by a future version) are kept, after these.
const FIELD_ORDER = {
  entry: ["id", "type", "kind", "day", "created", "updated", "tz", "title", "author", "privacy", "tags", "category",
    "question", "prompt", "media", "transcript", "conversation", "document", "source", "links", "imported", "sealed", "deleted"],
  day: ["id", "type", "date", "rating", "rating_scale", "best", "hardest", "emotions", "updated", "source", "imported"],
  event: ["id", "type", "day", "title", "start", "end", "all_day", "location", "calendar", "source", "updated"],
  claim: ["id", "type", "section", "statement", "status", "origin", "confidence", "evidence", "alternatives",
    "would_change_if", "expects", "coverage", "created", "updated", "history"],
  proposal: ["id", "type", "op", "status", "target", "author", "created", "predicted_acceptance", "payload",
    "rationale", "evidence", "alternatives", "coverage", "decided", "decision", "snooze_until"],
  question: ["id", "type", "text", "kind", "origin", "topic", "sensitivity", "status", "rationale", "evidence",
    "created", "updated", "snooze_until", "last_shown", "shown_count", "answers", "feedback", "source"],
  interpretation: ["id", "type", "kind", "of", "author", "status", "created", "range", "source"],
  report: ["id", "type", "kind", "created", "summary"],
};

const SEALED_NOTE = "_Sealed entry: its text is encrypted with your journal passphrase._";

const BODY_TYPES = new Set(["entry", "day", "claim", "interpretation", "report", "proposal", "question"]);

/** Repo path for a record (or null if the record can't be placed safely). */
export function pathFor(rec) {
  if (!rec || !isSafeId(rec.id)) return null;
  switch (rec.type) {
    case "entry": {
      const [y, m] = (rec.day || "").split("-");
      return y && m ? `entries/${y}/${m}/${rec.id}.md` : null;
    }
    case "day": return /^\d{4}-\d{2}-\d{2}$/.test(rec.id) ? `days/${rec.id.slice(0, 4)}/${rec.id}.md` : null;
    case "event": {
      const [y, m] = (rec.day || "").split("-");
      return y && m ? `events/${y}/${m}/${rec.id}.md` : null;
    }
    case "claim": return `meta/claims/${rec.id}.md`;
    case "proposal": return `meta/proposals/${rec.id}.md`;
    case "question": return `meta/questions/${rec.id}.md`;
    case "interpretation": return `interpretations/${(rec.created || "0000").slice(0, 4)}/${rec.id}.md`;
    case "report": return `imports/${rec.id}.md`;
    case "config": return rec.id.startsWith("config:") ? `config/${rec.id.slice(7)}.yaml` : null;
    default: return null;
  }
}

const TEXT_PREFIXES = ["entries/", "days/", "events/", "meta/claims/", "meta/proposals/", "meta/questions/", "interpretations/", "imports/", "config/"];

/** Is this repo path one the app owns as a text record? */
export function isRecordPath(p) {
  if (!TEXT_PREFIXES.some((pre) => p.startsWith(pre))) return false;
  return p.startsWith("config/") ? p.endsWith(".yaml") : p.endsWith(".md");
}

export function isMediaPath(p) {
  return p.startsWith("media/") && !p.endsWith(".md");
}

/** Media binary path, e.g. media/2026/10/m-20261020-1432-ab12.jpg */
export function mediaPath(day, id, ext, { thumb = false, sealed = false } = {}) {
  const [y, m] = day.split("-");
  const suffix = sealed ? (thumb ? ".thumb.enc" : ".enc") : (thumb ? ".thumb.jpg" : `.${ext}`);
  return `media/${y}/${m}/${id}${suffix}`;
}

export const MIME_EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/aac": "aac",
  "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md",
};
export const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([k, v]) => [v, k]));
EXT_MIME.jpeg = "image/jpeg";
EXT_MIME.mov = "video/quicktime";

function ordered(rec, type) {
  const order = FIELD_ORDER[type] || ["id", "type"];
  const out = {};
  for (const k of order) if (k in rec) out[k] = rec[k];
  for (const k of Object.keys(rec).sort()) if (!(k in out)) out[k] = rec[k];
  return out;
}

/** Drop device-local fields, undefined/null and empty collections; recursively. */
export function stripLocal(v, top = true) {
  if (Array.isArray(v)) return v.map((x) => stripLocal(x, false)).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith("_")) continue;
      if (top && k === "body") continue;
      const s = stripLocal(val, false);
      if (s === undefined || s === null) continue;
      if (Array.isArray(s) && s.length === 0) continue;
      if (s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length === 0) continue;
      if (s === "" && k !== "statement") continue;
      out[k] = s;
    }
    return out;
  }
  return v;
}

const DUMP_OPTS = { schema: CORE_SCHEMA, lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"', noCompatMode: true };

export function yamlDump(obj) {
  return dump(obj, DUMP_OPTS);
}

export function yamlLoad(text) {
  return load(text, { schema: CORE_SCHEMA });
}

/** Record -> file content (string). */
export function serialize(rec) {
  if (rec.type === "config") {
    const { id, type, ...rest } = stripLocal({ ...rec, body: undefined });
    return yamlDump({ id: rec.id, ...rest });
  }
  const data = ordered(stripLocal(rec), rec.type);
  let out = `${FM}\n${yamlDump(data)}${FM}\n`;
  // A sealed entry's body is inside the ciphertext; the file says so for anyone reading the repo.
  const body = rec.sealed ? SEALED_NOTE : BODY_TYPES.has(rec.type) ? String(rec.body || "").replace(/\s+$/, "") : "";
  if (body) out += `${body}\n`;
  return out;
}

/** Split "---\nyaml\n---\nbody" into {data, body}. Tolerates CRLF and BOM. */
export function splitFrontmatter(text) {
  const t = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!t.startsWith(FM + "\n")) return { data: {}, body: t, hadFrontmatter: false };
  const end = t.indexOf(`\n${FM}`, FM.length);
  if (end === -1) return { data: {}, body: t, hadFrontmatter: false };
  const yamlText = t.slice(FM.length + 1, end + 1);
  let rest = t.slice(end + FM.length + 1);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  const data = yamlLoad(yamlText) || {};
  return { data, body: rest, hadFrontmatter: true };
}

/**
 * File content -> record. Throws with a readable message on malformed input;
 * callers treat that as "keep the file, flag it" rather than dropping data.
 */
export function parse(path, text) {
  if (path.startsWith("config/")) {
    const data = yamlLoad(text) || {};
    const name = path.slice(7).replace(/\.yaml$/, "");
    return { ...data, id: `config:${name}`, type: "config" };
  }
  const { data, body } = splitFrontmatter(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${path}: frontmatter is not a mapping`);
  const rec = { ...data };
  if (!rec.type) rec.type = inferType(path);
  if (!rec.id) rec.id = idFromPath(path);
  // Ids end up in URLs and attributes; a hand-made or malformed file can't smuggle markup through one.
  if (!isSafeId(String(rec.id))) throw new Error(`${path}: unsafe id ${JSON.stringify(String(rec.id)).slice(0, 60)}`);
  const b = body.replace(/\s+$/, "");
  if (BODY_TYPES.has(rec.type) && !rec.sealed) rec.body = b;
  if (rec.type === "day" && !rec.date) rec.date = rec.id;
  return rec;
}

export function inferType(path) {
  if (path.startsWith("entries/")) return "entry";
  if (path.startsWith("days/")) return "day";
  if (path.startsWith("events/")) return "event";
  if (path.startsWith("meta/claims/")) return "claim";
  if (path.startsWith("meta/proposals/")) return "proposal";
  if (path.startsWith("meta/questions/")) return "question";
  if (path.startsWith("interpretations/")) return "interpretation";
  if (path.startsWith("imports/")) return "report";
  if (path.startsWith("config/")) return "config";
  return null;
}

export function idFromPath(path) {
  const file = path.split("/").pop();
  if (path.startsWith("config/")) return `config:${file.replace(/\.yaml$/, "")}`;
  return file.replace(/\.md$/, "");
}

/** Git blob SHA-1 of content, identical to `git hash-object`. */
export async function gitBlobSha(content) {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header, 0);
  all.set(bytes, header.length);
  const digest = await globalThis.crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
