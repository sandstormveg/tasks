// The app context every view gets: the store, settings with the host's
// defaults, the token (your own, or the Tasks site's when installed there),
// sync, and the derived numbers (XP, level, grade, attributes) computed on demand.
// Your guild rank is your grade (core/grades.js): earned by passing grade tests,
// not by XP. XP still sets your level.

import { Store, sync, writeSteps, writePrimerSwitchOff } from "./data/store.js";
import { QuestRemote } from "./data/github.js";
import { health, readDelta } from "./data/health.js";
import { setNoticesAuth, clearNoticesAuth as clearNoticesAuthPlugin, requestNotify, notify } from "./data/notices.js";
import { attributeStats, totalXp, levelOf, streak } from "./core/stats.js";
import { isExpired, OPEN, payout, localDay } from "./core/quests.js";
import { workoutCandidates, workoutQuest, workoutMinutes, workoutId } from "./core/workouts.js";
import { newNoticeIds, brassDue } from "./core/notices.js";
import { enduranceUpdates } from "./core/endurance.js";
import { journalUpdates } from "./core/journalquest.js";
import { toast } from "./ui/dom.js";
import { skillStats } from "./core/skills.js";
import { cabinet } from "./core/achievements.js";
import { taskIdFor, GUILD_CATEGORY } from "./core/tasklink.js";
import { gradeOf, trainingPlan } from "./core/grades.js";

export const DEFAULTS = {
  owner: "sandstormveg",
  repo: "tasks-data",
  publicRepo: "tasks",
  folder: "quests",
  relay: true,
  relayName: "Joy",
  voicePack: "cori",
  chattiness: "normal",
  voice: false,
  voiceName: "",
  voiceVolume: 1,
  voiceRate: 1,
  voicePitch: 1.1,
  deviceFallback: false,
  coachVoice: true,
  coachName: "Sergeant Brass",
  coachVoiceName: "",
  coachVoicePack: "northern",
  coachVolume: 1,
  coachRate: 1,
  coachPitch: 1,
  autoSync: true,
  trainingReminders: true,
};

export async function loadHost() {
  try {
    const res = await fetch("host.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const h = await res.json();
    const home = typeof h.home === "string" && /^(\.\.?\/|\/(?!\/))[\w./#?=&%-]*$/.test(h.home) ? h.home : "";
    const tokenKey = typeof h.tokenKey === "string" && /^[\w.-]{1,64}$/.test(h.tokenKey) ? h.tokenKey : "";
    return h.name ? { name: String(h.name).slice(0, 40), home, tokenKey, defaults: h.defaults || {} } : null;
  } catch { return null; }
}

export function createContext(host) {
  const store = new Store();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ctx = {
    store,
    host,
    settings() {
      const s = { ...DEFAULTS, ...(host?.defaults || {}), ...store.settings };
      return s.relayName === "Relay" ? { ...s, relayName: DEFAULTS.relayName } : s; // the receptionist's old default name
    },
    today() { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); },
    now() { return new Date().toISOString(); },
    token() {
      if (store.secrets.githubToken) return { token: store.secrets.githubToken, from: "own" };
      if (host?.tokenKey && !store.secrets.ignoreHostToken) {
        try { const t = localStorage.getItem(host.tokenKey); if (t) return { token: t, from: host.name }; } catch {}
      }
      return { token: "", from: null };
    },
    syncing: false,
    importing: false,
    async syncNow() {
      const { token } = ctx.token();
      if (!token || ctx.syncing || !navigator.onLine) return;
      ctx.syncing = true;
      store.emit({ op: "sync-start" });
      let synced = false;
      try {
        const s = ctx.settings();
        await sync(store, { token, owner: s.owner, repo: s.repo, publicRepo: s.publicRepo, folder: s.folder, device: deviceName() });
        await setNoticesAuth(token, s.owner, s.repo, { journalNudge: s.journalNudge !== false });
        ctx.notifyNewNotices();
        ctx.checkBrassReminder();
        synced = true;
      } catch (err) {
        store.status = { ...store.status, error: err.message || String(err) };
        store.persist();
        store.emit({ op: "sync-error" });
      } finally {
        ctx.syncing = false;
        store.emit({ op: "sync-end" });
      }
      if (synced) { ctx.checkEndurance(); ctx.checkJournal(); ctx.importWorkouts().catch(() => {}); }
    },
    /** Quests with expiry applied (an open quest past its date reads as expired, and is saved so). */
    quests() {
      const today = ctx.today();
      return store.all().map((q) => (isExpired(q, today) ? { ...q, status: "expired" } : q));
    },
    derived() {
      const quests = ctx.quests();
      const history = store.tasks.history;
      const xp = totalXp({ quests, history });
      const attributes = attributeStats({ quests, history, measurements: store.measurements(), profile: store.profile(), today: ctx.today(), stepsDays: store.steps?.days || {} });
      const skills = skillStats(store.skills(), quests);
      return {
        xp, level: levelOf(xp), rank: gradeOf(quests),
        streak: streak({ quests, history, today: ctx.today() }),
        attributes, skills,
        trophies: cabinet({ quests, history, attributes, skills }, store.trophies()),
        open: quests.filter((q) => OPEN.has(q.status)),
      };
    },
    /** Accepting puts the quest on the task list: its own task if it has one, else a new private Guild task. */
    accept(q) {
      let next = { ...q, status: "accepted", accepted: ctx.now() };
      if (!q.taskIds.length) {
        const id = taskIdFor(q.title);
        store.queueTaskOp({ op: "create", task: { id, title: q.title, category: GUILD_CATEGORY, created: ctx.today(), notes: "", questId: q.id } });
        next = { ...next, taskIds: [id], taskCreated: id };
        store.tasks = { ...store.tasks, active: [...store.tasks.active, { id, title: q.title, category: GUILD_CATEGORY, created: ctx.today(), repo: "private", questId: q.id }] };
      }
      store.put(next);
    },
    /** After a turn-in: complete the task the Guild made, or leave a note on a private task it's built on. */
    afterTurnIn(done) {
      const note = `Quest turned in: +${done.xp} XP (${done.evidence?.type}).`;
      if (done.taskCreated) {
        store.queueTaskOp({ op: "complete", taskId: done.taskCreated, questId: done.id, date: ctx.today(), note });
      } else {
        for (const id of done.taskIds) {
          const t = store.tasks.active.find((x) => x.id === id);
          if (t?.repo === "private") store.queueTaskOp({ op: "note", taskId: id, noteId: `n-guild-${done.id}`.slice(0, 60), text: `⚔ ${note}` });
        }
      }
    },
    /** Un-accept or fail: the quest lets go of the Guild task it made; a private task it's built on gets a note. */
    release(q, next, note) {
      if (q.taskCreated) {
        store.queueTaskOp({ op: "drop", taskId: q.taskCreated, questId: q.id });
        store.tasks = { ...store.tasks, active: store.tasks.active.filter((t) => t.id !== q.taskCreated) };
        next = { ...next, taskIds: q.taskIds.filter((id) => id !== q.taskCreated), taskCreated: undefined };
      } else if (note) {
        for (const id of q.taskIds) {
          const t = store.tasks.active.find((x) => x.id === id);
          if (t?.repo === "private") store.queueTaskOp({ op: "note", taskId: id, noteId: `n-guild-${q.id}-${Date.now().toString(36)}`.slice(0, 60), text: `⚔ ${note}` });
        }
      }
      store.put(next);
    },
    /** Back to the board, no penalty. Objectives you ticked stay ticked. */
    abandon(q) { ctx.release(q, { ...q, status: "posted", accepted: undefined }); },
    /** Handed in as failed: logged, 0 XP, with what you learned if you said. */
    fail(q, lesson) {
      ctx.release(q, { ...q, status: "failed", completed: ctx.now(), evidence: { type: "failed", ...(lesson ? { note: lesson } : {}) }, xp: 0 },
        `Quest handed in as failed.${lesson ? ` Lesson: ${lesson}` : ""}`);
    },
    payout,
    /** An accepted quest whose linked tasks were all finished in Tasks: its XP is waiting on a turn-in. */
    taskDone(q) {
      return q.status === "accepted" && q.taskIds.length > 0
        && q.taskIds.every((id) => store.tasks.history.some((h) => h.id === id) && !store.tasks.active.some((t) => t.id === id));
    },
    taskTitle(id) {
      const t = [...store.tasks.active, ...store.tasks.history].find((x) => x.id === id);
      return t ? t.title : null;
    },
    /** Retire one line of the journal's Primer feed (Settings only; themes are never edited). */
    async switchOffPrimer(id) {
      const { token } = ctx.token();
      if (!token) throw new Error("No GitHub token yet: add one in Settings > Access/Key.");
      const s = ctx.settings();
      const remote = new QuestRemote({ token, owner: s.owner, repo: s.repo, folder: s.folder });
      const res = await writePrimerSwitchOff(remote, id);
      store.primer = { text: res.text, sha: res.sha };
      store.persist();
      store.emit({ op: "primer" });
      return res;
    },
    /** Today's phone steps to quests/steps.json (Train only, throttled there). */
    async saveSteps(date, steps) {
      const { token } = ctx.token();
      if (!token) return null;
      const s = ctx.settings();
      const remote = new QuestRemote({ token, owner: s.owner, repo: s.repo, folder: s.folder });
      const doc = await writeSteps(remote, { date, steps, message: `Steps: ${date} (phone)` });
      store.steps = doc;
      store.persist();
      store.emit({ op: "stats" });
      return doc;
    },
    /** Turn recent watch workouts into completed jogs (native only). Returns how many were logged. */
    async importWorkouts() {
      const plugin = health();
      if (!plugin || ctx.importing) return 0;
      ctx.importing = true;
      try {
        const st = await plugin.status().catch(() => null);
        if (!st?.available || !st?.exercise) return 0;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
        const lastAt = store.workoutsImportedAt && Date.parse(store.workoutsImportedAt) > Date.parse(weekAgo) ? store.workoutsImportedAt : weekAgo;
        const r = await plugin.readExercise({ start: lastAt, end: now.toISOString() });
        const newest = (r?.sessions || []).filter((x) => x?.start).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0];
        if (newest && newest.start !== store.lastWorkout?.start) store.setLastWorkout({ name: newest.name || newest.type || "workout", start: newest.start, at: now.toISOString() });
        const todo = workoutCandidates(r?.sessions, { since: lastAt, imported: new Set(store.importedWorkouts) });
        const imported = [];
        let logged = 0;
        for (const session of todo) {
          const id = workoutId(session);
          if (store.get(id)) { imported.push(session.id); continue; }
          const delta = await readDelta(plugin, session.start, session.end).catch(() => null);
          if (!delta || delta.steps <= 0) continue;
          store.put(workoutQuest(session, { steps: delta.steps, meters: delta.meters, minutes: workoutMinutes(session) }, { now: ctx.now() }));
          imported.push(session.id);
          logged += 1;
        }
        if (!imported.length) return 0;
        store.markWorkoutsImported(imported, new Date().toISOString());
        if (!logged) return 0;
        toast(`Logged ${logged} workout${logged === 1 ? "" : "s"} from your watch`);
        ctx.checkEndurance();
        ctx.syncNow();
        return logged;
      } catch {
        return 0;
      } finally {
        ctx.importing = false;
      }
    },
    /** Post today's Journal quest and tick off any day the journal shows an entry for. */
    checkJournal() {
      try {
        const today = ctx.today();
        const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
        const updates = journalUpdates(store.all(), store.journalActivity, { today, yesterday: d.toISOString().slice(0, 10), now: ctx.now() });
        for (const q of updates) store.put(q);
        if (updates.some((q) => q.status === "done")) toast("Journal written: +WIS");
        return updates.length;
      } catch {
        return 0;
      }
    },
    /** Post today's endurance mission and tick off any a jog has earned. Returns how many changed. */
    checkEndurance() {
      try {
        const today = ctx.today();
        const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
        const updates = enduranceUpdates(store.all(), { today, yesterday: d.toISOString().slice(0, 10), now: ctx.now() });
        for (const q of updates) store.put(q);
        if (updates.some((q) => q.status === "done")) toast("Endurance done for the day");
        return updates.length;
      } catch {
        return 0;
      }
    },
    /** Local notification for each notice id that wasn't there at the last sync (first sync only records them). */
    notifyNewNotices() {
      const doc = store.notices?.doc;
      if (!doc) {
        if (store.noticesSeen == null) store.setNoticesSeen([]);
        return;
      }
      const ids = doc.notices.map((n) => n.id);
      if (store.noticesSeen == null) { store.setNoticesSeen(ids); return; }
      const fresh = newNoticeIds(doc, store.noticesSeen);
      store.setNoticesSeen(ids);
      for (const id of fresh) {
        const n = doc.notices.find((x) => x.id === id);
        if (n) notify({ id, title: `Another World: ${n.giver || "notice"}`, body: n.title });
      }
    },
    /** Brass's 18:00 nudge, once on a training day with nothing done (opt-out in Settings). */
    checkBrassReminder() {
      try {
        const s = ctx.settings();
        const today = ctx.today();
        const quests = ctx.quests();
        const todays = quests.filter((q) => q.origin === "training" && localDay(q.posted) === today);
        const plan = trainingPlan(quests, { profile: store.profile(), today, now: ctx.now() });
        const endured = quests.some((q) => q.origin === "endurance" && q.status === "done" && q.expires === today);
        const done = endured || todays.some((q) => q.status === "done" || q.status === "failed");
        const training = todays.length > 0 || plan.missions.length > 0;
        if (!brassDue({ today, now: new Date(), rest: !!plan.rest, training, done, lastDay: store.reminders.brassDay, enabled: s.trainingReminders !== false })) return false;
        store.setBrassDay(today);
        notify({ id: `brass-${today}`, title: "Sergeant Brass", body: "Today's set is waiting." });
        return true;
      } catch {
        return false;
      }
    },
    /** Ask for notification permission once, the first native run after this update. */
    async askNotifyOnce() {
      if (store.noticesAsked) return false;
      const res = await requestNotify();
      if (!res) return false;
      store.setNoticesAsked(true);
      return true;
    },
    forgetNoticesAuth() { clearNoticesAuthPlugin(); },
  };
  // Theme: "hall" (Guild Hall: parchment notices on walnut) or the default terminal look. Its
  // fonts (IM Fell English SC and Caveat, OFL) ship in fonts/ and only downloads when the theme is on.
  const applyTheme = () => {
    const hall = ctx.settings().theme === "hall";
    document.documentElement.toggleAttribute("data-guild-hall", hall);
  };
  applyTheme();
  store.on((c) => { if (c.op === "settings") applyTheme(); });
  return ctx;
}

function deviceName() {
  const ua = navigator.userAgent.toLowerCase();
  return /android/.test(ua) ? "Android" : /iphone|ipad/.test(ua) ? "iPhone" : /windows/.test(ua) ? "Windows" : /mac os/.test(ua) ? "Mac" : "device";
}
