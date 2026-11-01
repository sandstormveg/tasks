// Keeps the journal inside one folder of a shared repository — e.g. `journal/`
// in the private repo your tasks already live in. The sync engine only ever
// sees paths inside the folder (with the folder stripped), and every path it
// writes is put back inside it, so it can't read, change or delete anything
// else in the repository. Wraps any remote with GitHubRemote's interface.

/** "journal", "/journal/", " journal " → "journal/"; "" → "". Throws on unsafe input. */
export function cleanFolder(folder) {
  const s = String(folder || "").trim().replace(/^\/+|\/+$/g, "");
  if (!s) return "";
  const parts = s.split("/");
  if (parts.some((p) => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(p))) {
    throw new Error(`"${folder}" isn't a usable folder name — use letters, numbers, dashes or underscores, like journal.`);
  }
  return parts.join("/") + "/";
}

export class FolderRemote {
  constructor(remote, folder) {
    this.remote = remote;
    this.root = cleanFolder(folder);
  }

  // Part of the sync-state key: another folder in the same repo is another journal.
  get label() { return this.root ? `${this.remote.label}:${this.root}` : this.remote.label; }
  get branch() { return this.remote.branch; }

  getRepoInfo() { return this.remote.getRepoInfo(); }
  getHead() { return this.remote.getHead(); }
  readTexts(shas, onProgress) { return this.remote.readTexts(shas, onProgress); }
  readBinary(sha) { return this.remote.readBinary(sha); }
  createBlob(bytes) { return this.remote.createBlob(bytes); }

  initialize(path, content, message) { return this.remote.initialize(this.root + path, content, message); }

  async listTree(treeSha) {
    const all = await this.remote.listTree(treeSha);
    if (!this.root) return all;
    return all.filter((f) => f.path.startsWith(this.root)).map((f) => ({ ...f, path: f.path.slice(this.root.length) }));
  }

  commit({ changes, ...rest }) {
    return this.remote.commit({ ...rest, changes: changes.map((c) => ({ ...c, path: this.root + c.path })) });
  }
}
