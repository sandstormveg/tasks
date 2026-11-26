// Adventurer's on-device state and its sync with quests/ in tasks-data.
//
// Everything lives in localStorage under "adventurer:" (the board is small),
// so the app opens instantly and works offline; a change is marked dirty and
// pushed on the next sync. Remote files are refetched only when their sha moved.
//
// Conflicts (the guild master's tool and this phone both changed a quest):
// the further-along status wins — a turn-in is never undone by a stale copy —
// and the losing version is kept on the quest as `_conflict` for a look.

import { normalize, serialize, validate, payout, STATUSES } from "../core/quests.js";
import { applyTaskOps, questIndex, nominations } from "../core/tasklink.js";
import { autoProgress, hasObjectives } from "../core/objectives.js";
import { stepsDoc, mergeStepsDoc } from "../core/steps.js";
import { setUntoggled } from "../core/primer.js";
import { noticesDoc } from "../core/notices.js";
import { QuestRemote, readPublic, GitHubError } from "./github.js";

const KEY = "adventurer:";
const TEMPLATE = ["README.md", "CLAUDE.md", ".claude/skills/quests/SKILL.md", "tools/quests.mjs"];
const STAGE = { requested: 0, posted: 1, declined: 2, expired: 2, accepted: 3, failed: 3.5, done: 4 }; // a retried set that passes beats the failed one

function load(k, fallback) {
  try { const v = localStorage.getItem(KEY + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(k, v) {
  try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (err) { console.warn("couldn't save", k, err); }
}

export function mergeQuest(local, remote) {
  const a = STAGE[local.status] ?? 0, b = STAGE[remote.status] ?? 0;
  if (b > a) return { ...remote, _conflict: undefined };
  if (a > b) return local;
  if (local.progress || remote.progress) return { ...remote, ...local, progress: { ...remote.progress, ...local.progress } }; // ticks from either device
  return { ...remote, ...local }; // same stage: keep this device's fields, take anything new from the remote
}

export class Store {
  constructor() {
    this.quests = load("quests", {});      // id -> {q, sha, dirty}
    this.stats = load("stats", { doc: { profile: {}, measurements: [] }, sha: null, dirty: false });
    this.tasks = load("tasks", { active: [], history: [] });
    this.settings = load("settings", {});
    this.secrets = load("secrets", {});
    this.showcase = load("showcase", { doc: { skills: [], achievements: [] }, sha: null, dirty: false });
    this.taskOps = load("taskOps", []);     // queued writes to tasks-data's task list (see core/tasklink.js)
    this.status = load("status", { lastSync: null, error: null });
    this.research = load("research", null); // research/ file list + source tags, for expedition objectives
    this.steps = load("steps", { days: {} }); // watch-counted daily totals, read-only from quests/steps.json
    this.journalActivity = load("journalActivity", ""); // journal/activity.json: entry counts per day, nothing else
    this.primer = load("primer", { text: "", sha: null }); // the journal's themes feed, read-only except switch-off
    this.importedWorkouts = load("importedWorkouts", []); // watch session ids already turned into jogs
    this.workoutsImportedAt = load("workoutsImportedAt", null);
    this.lastWorkout = load("lastWorkout", null); // {name, start, at}: the newest watch workout Health Connect showed
    this.lastImport = load("lastImport", null); // {at, seen, types, logged, skipped, note}: what the last workout import did
    this.notices = load("notices", { doc: null, sha: null }); // Another World notices, read-only
    this.noticesSeen = load("noticesSeen", null); // notice ids at the last sync; null means never synced
    this.noticesAsked = load("noticesAsked", false); // asked for notification permission once
    this.reminders = load("reminders", {}); // {brassDay: "YYYY-MM-DD"}
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(change) { for (const fn of this.listeners) try { fn(change); } catch (e) { console.error(e); } }
  persist() {
    save("quests", this.quests); save("stats", this.stats); save("tasks", this.tasks); save("status", this.status);
    save("showcase", this.showcase); save("taskOps", this.taskOps); save("research", this.research);
    save("steps", this.steps);
    save("primer", this.primer); save("journalActivity", this.journalActivity);
    save("importedWorkouts", this.importedWorkouts); save("workoutsImportedAt", this.workoutsImportedAt); save("lastWorkout", this.lastWorkout); save("lastImport", this.lastImport);
    save("notices", this.notices); save("noticesSeen", this.noticesSeen); save("noticesAsked", this.noticesAsked);
    save("reminders", this.reminders);
  }

  all() { return Object.values(this.quests).map((x) => normalize(x.q)); }
  get(id) { return this.quests[id] ? normalize(this.quests[id].q) : null; }
  ids() { return new Set(Object.keys(this.quests)); }

  put(q) {
    const errs = validate(q);
    if (errs.length) throw new Error(errs.join("; "));
    this.quests[q.id] = { ...(this.quests[q.id] || {}), q, dirty: true };
    this.persist();
    this.emit({ op: "quest", id: q.id });
  }

  measurements() { return this.stats.doc.measurements || []; }
  profile() { return this.stats.doc.profile || {}; }
  setStats(patch) {
    this.stats = { ...this.stats, doc: { ...this.stats.doc, ...patch }, dirty: true };
    this.persist();
    this.emit({ op: "stats" });
  }

  skills() { return (this.showcase.doc.skills || []).filter((x) => !x.removed); }
  trophies() { return (this.showcase.doc.achievements || []).filter((x) => !x.removed); }
  /** Add or replace one skill or trophy by id (kind: "skills" | "achievements"). Removal is a `removed` tombstone, so it syncs. */
  upsertShowcase(kind, item) {
    const list = (this.showcase.doc[kind] || []).filter((x) => x.id !== item.id);
    this.showcase = { ...this.showcase, doc: { ...this.showcase.doc, [kind]: [...list, { ...item, updated: new Date().toISOString() }] }, dirty: true };
    this.persist();
    this.emit({ op: "showcase" });
  }
  queueTaskOp(op) { this.taskOps = [...this.taskOps, op]; this.persist(); }
  markWorkoutsImported(ids, at) {
    this.importedWorkouts = [...new Set([...(this.importedWorkouts || []), ...ids])];
    if (at) this.workoutsImportedAt = at;
    this.persist();
  }
  setLastWorkout(w) { this.lastWorkout = w; this.persist(); }
  setLastImport(r) { this.lastImport = r; this.persist(); this.emit({ op: "stats" }); }
  setNoticesSeen(ids) { this.noticesSeen = [...ids]; this.persist(); }
  setNoticesAsked(v = true) { this.noticesAsked = !!v; this.persist(); }
  setBrassDay(day) { this.reminders = { ...this.reminders, brassDay: day }; this.persist(); }

  setSettings(patch) { this.settings = { ...this.settings, ...patch }; save("settings", this.settings); this.emit({ op: "settings" }); }
  setSecrets(patch) { this.secrets = { ...this.secrets, ...patch }; save("secrets", this.secrets); this.emit({ op: "settings" }); }
  pending() {
    return Object.values(this.quests).filter((x) => x.dirty).length + (this.stats.dirty ? 1 : 0) + (this.showcase.dirty ? 1 : 0) + this.taskOps.length;
  }
}

/**
 * Write today's phone steps into quests/steps.json: keep every other day and key,
 * set today to max(existing, new), and retry on a sha conflict (the watch writes
 * this file too). Only daily totals go in, never per-record data.
 */
export async function writeSteps(remote, { date, steps, message }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await remote.read("steps.json");
    const doc = mergeStepsDoc(stepsDoc(file?.text), date, steps);
    try {
      await remote.write("steps.json", JSON.stringify(doc, null, 2) + "\n", { sha: file?.sha, message });
      return doc;
    } catch (err) {
      if (!(err instanceof GitHubError && err.status === 409) || attempt === 2) throw err;
    }
  }
}

/**
 * Retire one Primer line: read the feed, set that line's untoggledAt, write it
 * back with its sha, and retry on a conflict. Every other line stays as it was.
 */
export async function writePrimerSwitchOff(remote, id, { now, message = `primer: switch off ${id}` } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await remote.readAny("primer/themes.jsonl");
    if (!file) throw new Error("Nothing shared with the Primer yet.");
    const text = setUntoggled(file.text, id, now || new Date().toISOString());
    if (text === file.text) throw new Error("That line is no longer in the feed.");
    try {
      const sha = await remote.writePrimer(text, { sha: file.sha, message });
      return { text, sha };
    } catch (err) {
      if (!(err instanceof GitHubError && err.status === 409) || attempt === 2) throw err;
    }
  }
}

/** One sync pass: tasks (read-only), the board, stats.json; seeds the folder's README/tool on first run. */
export async function sync(store, { token, owner, repo, folder, publicRepo, templateBase = "quests-template/", device = "device" }) {
  const remote = new QuestRemote({ token, owner, repo, folder });
  await remote.checkPrivate();
  const msg = (what) => `Adventurer (${device}): ${what}`;

  // Tasks: private from the API, public from raw. Read only, never written here.
  const parse = (t, key) => { try { return JSON.parse(t)[key] || []; } catch { return []; } };
  const [pa, ph, qa, qh] = await Promise.all([
    readPublic(owner, publicRepo, "data/tasks.json"), readPublic(owner, publicRepo, "data/history.json"),
    remote.readAny("data/tasks.json"), remote.readAny("data/history.json"),
  ]);
  store.tasks = {
    active: [...parse(pa, "tasks").map((t) => ({ ...t, repo: "public" })), ...parse(qa?.text, "tasks").map((t) => ({ ...t, repo: "private" }))]
      .map(({ id, title, category, parentId, created, repo, questId, questNominated }) => ({ id, title, category, parentId, created, repo, questId, questNominated })),
    history: [...parse(ph, "entries"), ...parse(qh?.text, "entries")].map(({ id, title, category, completedDate }) => ({ id, title, category, completedDate })),
  };

  // Watch-counted steps: read-only, the watch app owns this file. A missing file means no steps.
  const stepsFile = await remote.read("steps.json");
  store.steps = stepsDoc(stepsFile?.text);

  // The journal's Primer feed: abstract themes only, one JSON object per line. Missing means nothing shared.
  const primerFile = await remote.readAny("primer/themes.jsonl");
  store.primer = { text: primerFile?.text || "", sha: primerFile?.sha || null };

  // The journal's counts-only activity file (entries per day). Entries are never read.
  const activityFile = await remote.readAny("journal/activity.json");
  store.journalActivity = activityFile?.text || "";

  // Another World's notices: read-only, and a missing file means nothing posted yet.
  const noticesFile = await remote.readAny("anotherworld/notices.json");
  store.notices = { doc: noticesFile ? noticesDoc(noticesFile.text) : null, sha: noticesFile?.sha || null };

  // Seed the folder once: README, Claude rules and the guild master's tool.
  const top = await remote.list("");
  if (!top.some((f) => f.name === "README.md")) {
    for (const rel of TEMPLATE) {
      const res = await fetch(templateBase + rel, { cache: "no-cache" });
      if (res.ok) await remote.write(rel, await res.text(), { message: msg(`set up quests/${rel}`) });
    }
  }

  // Pull the board.
  const files = await remote.list("board");
  const seen = new Set();
  for (const f of files) {
    if (!f.name.endsWith(".json")) continue;
    const id = f.name.slice(0, -5);
    seen.add(id);
    const mine = store.quests[id];
    if (mine && mine.sha === f.sha) continue;
    const got = await remote.read(`board/${f.name}`);
    let q;
    try { q = JSON.parse(got.text); } catch { continue; }
    if (validate(q).length) continue; // a broken hand edit: leave it for the tool's validate to report
    if (mine?.dirty && mine.sha !== f.sha) store.quests[id] = { q: { ...mergeQuest(mine.q, q), _conflict: mine.q }, sha: f.sha, dirty: true };
    else store.quests[id] = { q, sha: f.sha, dirty: false };
  }
  // Gone remotely and not changed here: removed by the guild master's tool.
  for (const [id, x] of Object.entries(store.quests)) if (!seen.has(id) && x.sha && !x.dirty) delete store.quests[id];

  // Tasks nominated on the Tasks site become requests, pushed with the rest below.
  for (const q of nominations(store.tasks.active, Object.values(store.quests).map((x) => x.q), new Date().toISOString())) store.quests[q.id] = { q, sha: null, dirty: true };

  // Expeditions: tick off objectives whose record now exists (a task done, a source filed in Research).
  const live = Object.values(store.quests).map((x) => x.q);
  const open = live.filter((q) => q.status === "accepted" && hasObjectives(q));
  if (open.length) {
    if (open.some((q) => q.objectives.some((o) => o.link?.system === "research"))) store.research = await remote.researchIndex(store.research).catch(() => store.research);
    for (const q of autoProgress(live, { history: store.tasks.history, research: store.research, now: new Date().toISOString() })) store.quests[q.id] = { ...store.quests[q.id], q, dirty: true };
  }

  // Push.
  for (const [id, x] of Object.entries(store.quests)) {
    if (!x.dirty) continue;
    const { _conflict, ...q } = x.q;
    try {
      x.sha = await remote.write(`board/${id}.json`, serialize(q), { sha: x.sha, message: msg(`${q.status} "${q.title}"`) });
      x.dirty = false;
    } catch (err) {
      if (!(err instanceof GitHubError && err.status === 409)) throw err;
      const now = await remote.read(`board/${id}.json`); // someone wrote in between: merge and try once more
      const theirs = JSON.parse(now.text);
      const merged = mergeQuest(q, theirs);
      x.sha = await remote.write(`board/${id}.json`, serialize(merged), { sha: now.sha, message: msg(`${merged.status} "${merged.title}" (merged)`) });
      Object.assign(x, { q: merged, dirty: false });
    }
  }

  // stats.json: profile + measurements, one small file.
  const st = await remote.read("stats.json");
  if (st && st.sha !== store.stats.sha) {
    const theirs = JSON.parse(st.text);
    if (store.stats.dirty) {
      const key = (m) => `${m.metric}|${m.date}|${m.value}`;
      const ms = new Map([...(theirs.measurements || []), ...store.measurements()].map((m) => [key(m), m]));
      store.stats.doc = { ...theirs, ...store.stats.doc, measurements: [...ms.values()] };
    } else store.stats.doc = theirs;
    store.stats.sha = st.sha;
  }
  if (store.stats.dirty || !st) {
    store.stats.sha = await remote.write("stats.json", JSON.stringify(store.stats.doc, null, 2) + "\n", { sha: store.stats.sha || undefined, message: msg("stats") });
    store.stats.dirty = false;
  }

  // showcase.json: skills and personal trophies, merged item by item (newest `updated` wins).
  const sc = await remote.read("showcase.json");
  if (sc && sc.sha !== store.showcase.sha) {
    const theirs = JSON.parse(sc.text);
    const merge = (a = [], b = []) => [...new Map([...a, ...b].sort((x, y) => (x.updated || "").localeCompare(y.updated || "")).map((x) => [x.id, x])).values()];
    store.showcase.doc = store.showcase.dirty
      ? { ...theirs, skills: merge(theirs.skills, store.showcase.doc.skills), achievements: merge(theirs.achievements, store.showcase.doc.achievements) }
      : { skills: [], achievements: [], ...theirs };
    store.showcase.sha = sc.sha;
  }
  if (store.showcase.dirty) {
    store.showcase.sha = await remote.write("showcase.json", JSON.stringify(store.showcase.doc, null, 2) + "\n", { sha: store.showcase.sha || undefined, message: msg("skills and trophies") });
    store.showcase.dirty = false;
  }

  // Accepted quests onto the task list (private tasks-data only), then the flare index.
  if (store.taskOps.length) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ft = await remote.readAny("data/tasks.json"), fh = await remote.readAny("data/history.json");
      const r = applyTaskOps(ft ? JSON.parse(ft.text).tasks || [] : [], fh ? JSON.parse(fh.text).entries || [] : [], store.taskOps);
      try {
        // History first, then the task list, as the Tasks site does: a half-done completion leaves the task, not a gap.
        if (r.historyChanged) await remote.writeData("data/history.json", JSON.stringify({ entries: r.history }, null, 2) + "\n", { sha: fh?.sha, message: msg("quest turned in, task completed") });
        if (r.tasksChanged) await remote.writeData("data/tasks.json", JSON.stringify({ tasks: r.tasks }, null, 2) + "\n", { sha: ft?.sha, message: msg("quest tasks") });
        store.taskOps = [];
        break;
      } catch (err) {
        if (!(err instanceof GitHubError && err.status === 409) || attempt) throw err;
      }
    }
  }
  const index = questIndex(store.all(), payout);
  const indexText = JSON.stringify(index.quests);
  if (indexText !== store.status.indexText) {
    const old = await remote.read("index.json");
    await remote.write("index.json", JSON.stringify(index, null, 2) + "\n", { sha: old?.sha, message: msg("quest index") });
    store.status.indexText = indexText;
  }

  store.status = { ...store.status, lastSync: new Date().toISOString(), error: null };
  store.persist();
  store.emit({ op: "sync" });
}

export { STATUSES };
