// When the journal is installed inside another app — e.g. at tasks/journal/ on
// the Tasks site, so both open as one home-screen app — the install writes
// host.json next to index.html (see tools/install-into.mjs): the host's name, a
// link back to it, where it keeps its GitHub token, and default settings (sync
// into a folder of the host's private data repo). Standalone there is no
// host.json and nothing changes.

export async function loadHost() {
  try {
    const res = await fetch("host.json", { cache: "no-cache" });
    if (!res.ok) return null;
    return normalizeHost(await res.json());
  } catch {
    return null;
  }
}

/** Keep only well-formed fields: the back link must stay on this site. */
export function normalizeHost(h) {
  if (!h || typeof h !== "object") return null;
  const name = typeof h.name === "string" ? h.name.trim().slice(0, 40) : "";
  const home = typeof h.home === "string" && /^(\.\.?\/|\/(?!\/))[\w./#?=&%-]*$/.test(h.home) ? h.home : "";
  const tokenKey = typeof h.tokenKey === "string" && /^[\w.-]{1,64}$/.test(h.tokenKey) ? h.tokenKey : "";
  const defaults = h.defaults && typeof h.defaults === "object" && !Array.isArray(h.defaults) ? h.defaults : null;
  if (!name) return null;
  return { name, home, tokenKey, defaults, source: typeof h.source === "string" ? h.source : "" };
}
