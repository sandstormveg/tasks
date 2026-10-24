// GitHub as a private, versioned home for the journal — the same pattern as
// the tasks app, upgraded to the Git Data API so a sync is one commit no matter
// how many files changed, and to GraphQL so pulling a thousand entries takes a
// few dozen requests instead of a thousand.
//
// Safety rule: the journal refuses to sync to a public repository.

export class SyncError extends Error {
  constructor(message, { code, status, retryAfter } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export class ConflictError extends SyncError {}

const API = "https://api.github.com";

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64decode(str) {
  const s = atob(String(str).replace(/\s+/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GitHubRemote {
  constructor({ token, owner, repo, branch, fetch: fetchImpl } = {}) {
    if (!token || !owner || !repo) throw new SyncError("GitHub sync needs a token and a repository.", { code: "config" });
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || null;
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.requests = 0;
  }

  get label() { return `${this.owner}/${this.repo}${this.branch ? "@" + this.branch : ""}`; }

  async request(method, path, body, { accept = "application/vnd.github+json", raw = false, okStatuses = [] } = {}) {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      this.requests++;
      let res;
      try {
        res = await this.fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: accept,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
      } catch (err) {
        if (attempt < 3) { await sleep(500 * 2 ** attempt); continue; }
        throw new SyncError("Can't reach GitHub — you may be offline. Your entries are safe on this device.", { code: "offline" });
      }
      if (res.ok || okStatuses.includes(res.status)) {
        if (raw) return res;
        if (res.status === 204) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const remaining = res.headers.get("x-ratelimit-remaining");
      let message = "";
      try { message = (await res.json()).message || ""; } catch { /* no body */ }
      if ((res.status === 403 || res.status === 429) && (retryAfter || remaining === "0" || /secondary rate|abuse/i.test(message))) {
        if (attempt < 3 && retryAfter && retryAfter <= 30) { await sleep(retryAfter * 1000); continue; }
        throw new SyncError("GitHub is rate-limiting requests. Sync will try again later.", { code: "rate-limit", status: res.status, retryAfter });
      }
      if (res.status >= 500 && attempt < 3) { await sleep(800 * 2 ** attempt); continue; }
      if (res.status === 401) throw new SyncError("GitHub rejected the token (expired or revoked). Paste a new one in Settings → Sync.", { code: "auth", status: 401 });
      if (res.status === 404) throw new SyncError(`Not found: ${this.owner}/${this.repo}. Check the name, and that the token has access to it.`, { code: "not-found", status: 404 });
      if (res.status === 403) throw new SyncError(`The token can't do this on ${this.owner}/${this.repo}. It needs "Contents: Read and write" on that repository. (${message})`, { code: "forbidden", status: 403 });
      throw new SyncError(`GitHub error ${res.status}: ${message}`, { code: "http", status: res.status });
    }
    throw new SyncError("GitHub request failed after retries.", { code: "http" });
  }

  async getRepoInfo() {
    const r = await this.request("GET", `/repos/${this.owner}/${this.repo}`);
    if (!this.branch) this.branch = r.default_branch || "main";
    // canPush is null when GitHub doesn't say (it may omit permissions for some tokens):
    // then we just try, and a refused write explains itself.
    const canPush = r.permissions && typeof r.permissions.push === "boolean" ? r.permissions.push : null;
    return { private: r.private === true, visibility: r.visibility, defaultBranch: r.default_branch, canPush, fullName: r.full_name, empty: r.size === 0 };
  }

  /** {commit, tree} of the branch head, or null if the repo/branch is empty. */
  async getHead() {
    const ref = await this.request("GET", `/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`, null, { okStatuses: [404, 409] }).catch((err) => {
      if (err.status === 404 || err.status === 409) return null;
      throw err;
    });
    if (!ref || !ref.object) return null;
    const commit = await this.request("GET", `/repos/${this.owner}/${this.repo}/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  /** First commit of an empty repository (the Git Data API can't start one). */
  async initialize(path, content, message) {
    await this.request("PUT", `/repos/${this.owner}/${this.repo}/contents/${path}`, {
      message, content: b64encode(new TextEncoder().encode(content)), branch: this.branch,
    });
  }

  async listTree(treeSha) {
    const t = await this.request("GET", `/repos/${this.owner}/${this.repo}/git/trees/${treeSha}?recursive=1`);
    if (t.truncated) throw new SyncError("The repository tree is too large to list in one request.", { code: "truncated" });
    return t.tree.filter((x) => x.type === "blob").map((x) => ({ path: x.path, sha: x.sha, size: x.size }));
  }

  /** Text of many blobs by sha, batched through GraphQL. Returns Map sha -> text. */
  async readTexts(shas, onProgress) {
    const out = new Map();
    const unique = [...new Set(shas)];
    const BATCH = 60;
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const fields = batch.map((sha, k) => `b${k}: object(oid: "${sha}") { ... on Blob { text isTruncated isBinary } }`).join("\n");
      const query = `query { repository(owner: ${JSON.stringify(this.owner)}, name: ${JSON.stringify(this.repo)}) {\n${fields}\n} }`;
      let data;
      try {
        const res = await this.request("POST", `/graphql`, { query });
        if (res.errors?.length && !res.data) throw new SyncError(res.errors[0].message, { code: "graphql" });
        data = res.data?.repository || {};
      } catch (err) {
        if (err.code === "offline" || err.code === "auth") throw err;
        data = {};
      }
      for (let k = 0; k < batch.length; k++) {
        const b = data[`b${k}`];
        if (b && !b.isTruncated && !b.isBinary && typeof b.text === "string") out.set(batch[k], b.text);
        else out.set(batch[k], new TextDecoder().decode(await this.readBinary(batch[k])));
      }
      onProgress?.(Math.min(unique.length, i + BATCH), unique.length);
    }
    return out;
  }

  async readBinary(sha) {
    const j = await this.request("GET", `/repos/${this.owner}/${this.repo}/git/blobs/${sha}`);
    return b64decode(j.content || "");
  }

  async createBlob(bytes) {
    const j = await this.request("POST", `/repos/${this.owner}/${this.repo}/git/blobs`, { content: b64encode(bytes), encoding: "base64" });
    return j.sha;
  }

  /**
   * One commit with all changes. changes: [{path, content} | {path, sha} | {path, delete: true}]
   * Throws ConflictError if the branch moved since `parent` (caller re-pulls).
   */
  async commit({ baseTree, parent, changes, message }) {
    let tree = baseTree;
    const CHUNK = 250;
    for (let i = 0; i < changes.length; i += CHUNK) {
      const items = changes.slice(i, i + CHUNK).map((c) =>
        c.delete ? { path: c.path, mode: "100644", type: "blob", sha: null }
          : c.content != null ? { path: c.path, mode: "100644", type: "blob", content: c.content }
            : { path: c.path, mode: "100644", type: "blob", sha: c.sha });
      const t = await this.request("POST", `/repos/${this.owner}/${this.repo}/git/trees`, tree ? { base_tree: tree, tree: items } : { tree: items });
      tree = t.sha;
    }
    const c = await this.request("POST", `/repos/${this.owner}/${this.repo}/git/commits`, { message, tree, parents: parent ? [parent] : [] });
    try {
      await this.request("PATCH", `/repos/${this.owner}/${this.repo}/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: c.sha, force: false });
    } catch (err) {
      if (err.status === 422 || err.status === 409) throw new ConflictError("The journal changed on another device during sync.", { code: "conflict" });
      throw err;
    }
    return { commit: c.sha, tree };
  }

  // ---------- small helpers for integrations (tasks, Atlas) ----------

  async getFile(path, ref) {
    const j = await this.request("GET", `/repos/${this.owner}/${this.repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
    return { sha: j.sha, text: new TextDecoder().decode(b64decode(j.content || "")) };
  }

  async putFile(path, text, sha, message) {
    return this.request("PUT", `/repos/${this.owner}/${this.repo}/contents/${path}`, {
      message, content: b64encode(new TextEncoder().encode(text)), sha, ...(this.branch ? { branch: this.branch } : {}),
    });
  }

  async listDir(path) {
    const j = await this.request("GET", `/repos/${this.owner}/${this.repo}/contents/${path}`);
    return Array.isArray(j) ? j : [];
  }
}

export { b64encode, b64decode };
