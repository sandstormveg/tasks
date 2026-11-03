// Quests ↔ tasks. An accepted quest belongs on the task list: if it's built on
// a task already, that task is its home (and gets the quest flare on the Tasks
// site); if not, accepting creates one in the private Guild category. When a
// quest the Guild made a task for is turned in, that task is completed the way
// the Tasks site completes one (history entry first, notes carried over).
// Tasks the Guild didn't create are never completed or edited here — at most
// an append-only claudeNote, and only on private tasks.
//
// Pure: ops are applied to the parsed files and are idempotent, so a sync that
// hits a conflict can refetch and apply the same ops again.

export const GUILD_CATEGORY = "Guild";
export const AUTHOR = "Adventurer (Guild)";

export function taskIdFor(title, stamp = Date.now()) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quest";
  return `${base}-${stamp.toString(36)}`;
}

/** Apply queued ops to tasks-data's task and history lists. */
export function applyTaskOps(tasks, history, ops, now = new Date().toISOString()) {
  let t = tasks.slice(), h = history.slice(), tasksChanged = false, historyChanged = false;
  for (const op of ops) {
    if (op.op === "create") {
      if (t.some((x) => x.id === op.task.id) || h.some((x) => x.id === op.task.id)) continue;
      t.push(op.task);
      tasksChanged = true;
    } else if (op.op === "complete") {
      const task = t.find((x) => x.id === op.taskId);
      if (!task || task.questId !== op.questId) continue; // gone, or not one the Guild made
      if (!h.some((x) => x.id === task.id)) {
        h.push({
          id: task.id, title: task.title, category: task.category, completedDate: op.date, note: op.note || "", images: [],
          ...(task.noteItems?.length ? { noteItems: task.noteItems } : {}),
          ...(task.claudeNotes?.length ? { claudeNotes: task.claudeNotes } : {}),
          ...(task.suggestions?.length ? { suggestions: task.suggestions } : {}),
        });
        historyChanged = true;
      }
      t = t.filter((x) => x.id !== op.taskId);
      tasksChanged = true;
    } else if (op.op === "note") {
      const task = t.find((x) => x.id === op.taskId);
      if (!task || (task.claudeNotes || []).some((n) => n.id === op.noteId)) continue;
      const note = { id: op.noteId, text: op.text, done: false, created: now, updated: now, author: AUTHOR };
      t = t.map((x) => (x === task ? { ...x, claudeNotes: [...(x.claudeNotes || []), note] } : x));
      tasksChanged = true;
    }
  }
  return { tasks: t, history: h, tasksChanged, historyChanged };
}

/** quests/index.json: what the Tasks site needs for the flare, nothing more. */
export function questIndex(quests, payout, updated = new Date().toISOString()) {
  return {
    updated,
    quests: quests.filter((q) => q.status === "accepted" && q.taskIds?.length)
      .map((q) => ({ id: q.id, title: q.title, status: q.status, difficulty: q.difficulty, xp: payout(q), taskIds: q.taskIds })),
  };
}
