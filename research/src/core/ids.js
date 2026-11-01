// Identifiers are readable on purpose: an entry file named
// e-20261020-1432-k7q2.md tells you when it was written even outside the app.

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1 confusion

export function randomToken(n = 4) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

/**
 * newId("e", "2026-10-20T14:32:10+07:00") -> "e-20261020-1432-k7q2".
 * The timestamp part is the wall time recorded in the ISO string.
 */
export function newId(prefix, iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
  if (m) return `${prefix}-${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}-${randomToken(4)}`;
  return `${prefix}-${Date.now().toString(36)}-${randomToken(4)}`;
}

export const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;

export function isSafeId(id) {
  return typeof id === "string" && id.length <= 120 && ID_PATTERN.test(id) && !id.includes("..");
}

/** Stable short slug for filenames (keeps Vietnamese readable by folding marks). */
export function slugify(s, max = 48) {
  return String(s || "")
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "item";
}
