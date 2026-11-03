// A small GitHub client for the one folder Adventurer owns in tasks-data
// (quests/), plus read-only access to the task lists it builds quests on.
// Contents API, one file per call: the board is dozens of files, not thousands,
// and unchanged files are skipped by their sha.
//
// Safety rules: refuses a public repository (quests can name places and habits),
// and every write path is checked to stay inside the quests folder.

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const b64 = {
  enc: (text) => { const b = new TextEncoder().encode(text); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); },
  dec: (str) => new TextDecoder().decode(Uint8Array.from(atob(String(str).replace(/\s+/g, "")), (c) => c.charCodeAt(0))),
};

export class QuestRemote {
  constructor({ token, owner, repo, folder = "quests", fetch: f = globalThis.fetch.bind(globalThis) }) {
    if (!token) throw new GitHubError("No GitHub token yet: add one in Settings › Access/Key.", 401);
    Object.assign(this, { token, owner, repo, folder: folder.replace(/^\/+|\/+$/g, ""), f });
  }

  async req(path, opts = {}) {
    const res = await this.f(`${API}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const msg = res.status === 401 ? "GitHub rejected the token." : res.status === 403 ? "GitHub refused (rate limit or token scope)." : res.status === 409 ? "Changed elsewhere." : `GitHub error ${res.status}.`;
      throw new GitHubError(msg, res.status);
    }
    return res.json();
  }

  async checkPrivate() {
    const r = await this.req(`/repos/${this.owner}/${this.repo}`);
    if (!r) throw new GitHubError(`Can't see ${this.owner}/${this.repo} with this token.`, 404);
    if (!r.private) throw new GitHubError(`${this.owner}/${this.repo} is public — Adventurer only syncs to a private repo.`, 403);
    return true;
  }

  inside(rel) {
    const p = `${this.folder}/${rel}`.replace(/\/+/g, "/");
    if (rel.includes("..") || !p.startsWith(this.folder + "/")) throw new GitHubError("Path outside the quests folder.", 400);
    return p;
  }

  /** [{name, sha}] of a folder in quests/, or [] if it doesn't exist yet. */
  async list(dir) {
    const r = await this.req(`/repos/${this.owner}/${this.repo}/contents/${this.inside(dir)}`);
    return Array.isArray(r) ? r.filter((x) => x.type === "file").map(({ name, sha }) => ({ name, sha })) : [];
  }

  async read(rel) { return this.readAny(this.inside(rel)); }

  /** Any file of the repo, read-only (the task lists). */
  async readAny(path) {
    const r = await this.req(`/repos/${this.owner}/${this.repo}/contents/${path}`);
    return r ? { text: b64.dec(r.content), sha: r.sha } : null;
  }

  async write(rel, text, { sha, message }) {
    const r = await this.req(`/repos/${this.owner}/${this.repo}/contents/${this.inside(rel)}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: b64.enc(text), ...(sha ? { sha } : {}) }),
    });
    return r.content.sha;
  }

  async writeBytes(rel, bytes, { message }) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await this.req(`/repos/${this.owner}/${this.repo}/contents/${this.inside(rel)}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: btoa(s) }),
    });
    return r.content.sha;
  }
}

/** The public task list needs no token. */
export async function readPublic(owner, repo, path, f = globalThis.fetch.bind(globalThis)) {
  const res = await f(`https://raw.githubusercontent.com/${owner}/${repo}/main/${path}?t=${Date.now()}`, { cache: "no-store" });
  return res.ok ? res.text() : null;
}
