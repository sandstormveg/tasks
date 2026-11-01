// Three-way merge for records edited on two devices. The journal never
// silently discards a version: when both sides changed the same field
// differently, this device's version wins in place and the other side's value
// is returned as a conflict so the caller can keep it as a revision.

function eq(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// Append-only lists merge by union rather than conflicting.
const UNION_KEYS = new Set(["history", "tags", "emotions", "answers", "evidence", "alternatives"]);
const KEYED_UNION = new Set(["media"]);

function unionList(a = [], b = []) {
  const out = [...a];
  const seen = new Set(a.map((x) => JSON.stringify(x)));
  for (const x of b) {
    const k = JSON.stringify(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

function unionById(base = [], a = [], b = []) {
  // Items keyed by id: keep every item present on either side unless one side
  // deleted it and the other left it unchanged; edits to the same item -> local wins.
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
  const B = byId(base), A = byId(a), R = byId(b);
  const ids = [...new Set([...a.map((x) => x.id), ...b.map((x) => x.id)])];
  const out = [];
  for (const id of ids) {
    const inA = A.get(id), inR = R.get(id), inB = B.get(id);
    if (inA && inR) out.push(eq(inA, inB) ? inR : inA);
    else if (inA && !inR) { if (!(inB && eq(inA, inB))) out.push(inA); }
    else if (!inA && inR) { if (!(inB && eq(inR, inB))) out.push(inR); }
  }
  return out;
}

/**
 * merge3(base, local, remote) -> {merged, conflicts: [{key, local, remote}]}
 * base may be null (no common ancestor known): then any difference conflicts
 * and local wins, except union-able lists.
 */
export function merge3(base, local, remote) {
  const b = base || {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter((k) => !k.startsWith("_")));
  const merged = { ...local };
  const conflicts = [];
  for (const k of keys) {
    const L = local[k], R = remote[k], B = b[k];
    if (eq(L, R)) continue;
    if (base && eq(B, L)) { merged[k] = R; continue; }
    if (base && eq(B, R)) continue;
    if (UNION_KEYS.has(k) && (Array.isArray(L) || Array.isArray(R))) { merged[k] = unionList(L || [], R || []); continue; }
    if (KEYED_UNION.has(k) && (Array.isArray(L) || Array.isArray(R))) { merged[k] = unionById(B || [], L || [], R || []); continue; }
    if (k === "updated") { merged[k] = String(L || "") > String(R || "") ? L : R; continue; }
    conflicts.push({ key: k, local: L, remote: R });
  }
  if (merged.updated == null && remote.updated) merged.updated = remote.updated;
  return { merged, conflicts };
}
