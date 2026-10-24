// Send a task to your tasks app (sandstormveg/tasks format). The journal never
// creates tasks on its own: you open this from an entry, write the task in
// your own words, and confirm. It defaults to the PRIVATE tasks repo.

import { html, sheet, toast, errorToast, confirmSheet } from "../ui/dom.js";
import { GitHubRemote } from "../data/github.js";
import { slugify } from "../core/ids.js";

const INTENT = /\b(i should|i need to|i must|i want to|remember to|don't forget to|todo|to do:|i'll|i will|let me)\b[^.!?\n]*/gi;

/** Sentences that read like intentions, offered as starting points. */
export function suggestTasks(text) {
  const out = [];
  for (const m of String(text || "").matchAll(INTENT)) {
    const s = m[0].replace(/^(i should|i need to|i must|i want to|remember to|don't forget to|todo|to do:|i'll|i will|let me)\s*/i, "").trim();
    if (s.length > 3 && s.length < 140 && !out.includes(s)) out.push(s.charAt(0).toUpperCase() + s.slice(1));
  }
  return out.slice(0, 5);
}

export async function sendToTasks(ctx, entry) {
  const cfg = ctx.settings().integrations.tasks;
  const token = ctx.secrets().githubToken;
  if (!token) return toast("Set up sync first — the tasks app uses the same GitHub token.");
  const [owner, repo] = String(cfg.repo || "").split("/");
  if (!owner || !repo) return toast("Set the tasks repository in Settings → Tasks & Atlas.");
  const ideas = suggestTasks(entry.body);
  const v = await sheet({
    title: "Create a task",
    body: html`${ideas.length ? html`<div class="chips" style="margin-bottom:10px">${ideas.map((i) => html`<button class="chip" data-idea="${i}">${i}</button>`)}</div>` : ""}
      <label class="field"><span>Task</span><input class="input" data-t autofocus autocomplete="off" placeholder="In your own words"></label>
      <label class="field"><span>Category</span><input class="input" data-c value="${cfg.category}" autocomplete="off"></label>
      <label class="switch"><input type="checkbox" data-link checked><span><span class="t">Add a short note pointing back to this entry</span><br><span class="d">“From journal, ${entry.day}” — not the entry's text</span></span></label>
      <p class="hint">Goes to <code>${cfg.repo}</code> (${/data$/i.test(repo) ? "private" : "check this repo is private"}). Nothing from the entry is copied unless you type it.</p>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add task</button>`,
    setup: (d, close) => {
      d.addEventListener("click", (e) => { const b = e.target.closest("[data-idea]"); if (b) d.querySelector("[data-t]").value = b.dataset.idea; });
      d.querySelector("[data-ok]").addEventListener("click", () => close({ title: d.querySelector("[data-t]").value.trim(), category: d.querySelector("[data-c]").value.trim() || cfg.category, link: d.querySelector("[data-link]").checked }));
    },
  });
  if (!v?.title) return;
  try {
    const gh = new GitHubRemote({ token, owner, repo });
    const info = await gh.getRepoInfo();
    if (!info.private && !(await confirmSheet(`${cfg.repo} is a public repository. Add this task there anyway?`, { confirm: "Add to public repo", danger: true }))) return;
    const { sha, text } = await gh.getFile(cfg.path);
    const data = JSON.parse(text);
    const task = {
      id: `${slugify(v.title, 40)}-${Date.now().toString(36)}`,
      title: v.title,
      category: v.category,
      created: ctx.today(),
      notes: v.link ? `From journal, ${entry.day}` : "",
    };
    data.tasks = [...(data.tasks || []), task];
    await gh.putFile(cfg.path, JSON.stringify(data, null, 2) + "\n", sha, `Add task from journal: ${v.title}`);
    await ctx.store.put({ ...entry, links: { ...(entry.links || {}), tasks: [...(entry.links?.tasks || []), { repo: cfg.repo, id: task.id, title: task.title }] } }, { reason: "link" });
    toast("Task added");
  } catch (err) { errorToast(err); }
}


// ---------- reading your tasks back, as memory cues ----------
// When you catch up on a past day, what you finished, added or noted in Tasks
// that day can help you remember it. Read-only, fetched only when you open a
// past day, kept in memory for a few minutes, and never sent to any AI.

let cueCache = { key: "", at: 0, value: null };

/** [{ label: "private"|"public", tasks, history }] from your tasks repos, plus how many couldn't be read. */
export async function loadTaskSources(ctx) {
  const cfg = ctx.settings().integrations.tasks;
  const token = ctx.secrets().githubToken;
  if (cfg.cues === false || !token) return { sources: [], failed: 0, off: true };
  const key = `${cfg.repo}|${cfg.publicRepo}|${cfg.path}|${token.slice(-6)}`;
  if (cueCache.value && cueCache.key === key && Date.now() - cueCache.at < 5 * 60_000) return cueCache.value;
  const dir = String(cfg.path || "data/tasks.json").replace(/[^/]*$/, "");
  const repos = [[cfg.repo, "private"], [cfg.publicRepo, "public"]].filter(([r]) => /^[\w.-]+\/[\w.-]+$/.test(String(r || "")));
  let failed = 0;
  const sources = (await Promise.all(repos.map(async ([full, label]) => {
    const [owner, repo] = full.split("/");
    const gh = new GitHubRemote({ token, owner, repo });
    const read = async (p) => {
      try { return JSON.parse((await gh.getFile(p)).text); } catch { return null; }
    };
    const [t, h] = await Promise.all([read(`${dir}tasks.json`), read(`${dir}history.json`)]);
    if (!t && !h) { failed++; return null; }
    return { label, tasks: Array.isArray(t?.tasks) ? t.tasks : [], history: Array.isArray(h?.entries) ? h.entries : [] };
  }))).filter(Boolean);
  const value = { sources, failed, off: false };
  if (sources.length) cueCache = { key, at: Date.now(), value };
  return value;
}
