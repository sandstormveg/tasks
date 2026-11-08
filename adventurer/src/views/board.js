// The quest Board: Joy at the counter, then two surfaces — accepted quests
// on the digital "Active" panel (your HUD), and posted ones pinned as paper
// notices on the guild's corkboard, like a real adventurers' guild. Tapping one
// opens its sheet: what it is, which tasks it's built on, accept/decline, and
// turn-in with the proof it asks for (GPS check-in, camera-verified reps,
// photo, journal day, or your word). Accepting puts it on the task list.

import { html, sheet, toast, errorToast, promptSheet } from "../ui/dom.js";
import { OPEN, DIFFICULTY, PROOF_LABEL, PROOFS, EXERCISES, boardOrder, newId, complete, payout } from "../core/quests.js";
import { greet, seedOf, proofTip, stamped, filedRequest, inferredIntro, cheerAccept, cheerTurnIn, cheerLevel, sayAbandon, sayFailed, questPitch } from "../core/relay.js";
import { questMap, mappable } from "../ui/questmap.js";
import { openEncounter } from "../ui/encounter.js";
import { OBJECTIVE_TYPES, hasObjectives, objectiveXp, objectiveCount, ready, isDone, isAuto, howItCompletes, markDone, unmark, claimed } from "../core/objectives.js";
import { speak } from "../ui/voice.js";
import { checkIn } from "../core/geo.js";
import { geosearchUrl, scoutQuests } from "../core/scout.js";
import { relayCounter, relayBubble } from "../ui/relay.js";
import { announce } from "../ui/moments.js";
import { trackJog } from "../ui/jog.js";
import { attributeGains } from "../core/stats.js";
import { uploadPhoto } from "../data/media.js";

const ORIGIN_TAG = { task: "From your tasks", inferred: "Inferred", request: "Your request", guild: "Guild master", local: "Nearby", self: "Self-posted", training: "Trainer", test: "Grade test" };
const FILTERS = { open: "Open", requested: "Requests", closed: "Closed" };

export async function mount(el, ctx, route, ui) {
  let filter = "open";
  let nudged = false;
  // A push-up quest on the board: warm the pose model now so its camera turn-in is instant.
  if (ctx.quests().some((q) => OPEN.has(q.status) && q.proof?.type === "reps" && q.giver !== "trainer")) import("../vision/reps-sheet.js").then((m) => m.preloadPose()).catch(() => {});
  const draw = () => {
    const d = ctx.derived();
    const quests = ctx.quests().filter((q) => q.giver !== "trainer"); // the trainer's sets live on the Train tab
    const s = ctx.settings();
    const today = ctx.today();
    const soon = new Date(Date.parse(today) + 2 * 864e5).toISOString().slice(0, 10);
    const board = {
      fresh: quests.filter((q) => q.status === "posted" && (q.posted || "").slice(0, 10) >= new Date(Date.parse(today) - 3 * 864e5).toISOString().slice(0, 10)).length,
      inferred: quests.filter((q) => q.status === "posted" && q.origin === "inferred").length,
      accepted: quests.filter((q) => q.status === "accepted").length,
      expiringSoon: quests.filter((q) => OPEN.has(q.status) && q.expires && q.expires <= soon).length,
      streak: d.streak,
    };
    const shown = quests.filter((q) => filter === "open" ? OPEN.has(q.status) : filter === "requested" ? q.status === "requested" : !OPEN.has(q.status) && q.status !== "requested").sort(boardOrder);
    const active = shown.filter((q) => q.status === "accepted"), posted = shown.filter((q) => q.status === "posted");
    // A task finished in Tasks doesn't turn its quest in (only proof does), so say so once per visit.
    const ready = quests.filter((q) => ctx.taskDone(q));
    if (ready.length && !nudged) {
      nudged = true;
      toast(ready.length === 1 ? `“${ready[0].title}” — its task is done in Tasks. Turn the quest in to claim the XP.` : `${ready.length} quests have their tasks done in Tasks. Turn them in to claim the XP.`, { timeout: 7000 });
    }
    el.innerHTML = String(html`
      ${s.relay ? relayCounter(s.relayName, greet(board, { chattiness: s.chattiness })) : ""}
      <div class="board-head">
        <div class="rankline"><span class="rank-badge">${d.rank.id}</span><span>${d.rank.title}</span><span class="muted">Lv ${d.level.level} · ${d.xp} XP</span></div>
        <div class="row wrap">
          ${Object.entries(FILTERS).map(([k, v]) => html`<button class="chip ${filter === k ? "on" : ""}" data-filter="${k}">${v}</button>`)}
        </div>
        <div class="row wrap actions">
          <button class="btn small" data-act="scout">⌖ Scout nearby</button>
          <button class="btn small" data-act="request">✉ File a request</button>
          <button class="btn small ghost" data-act="new">+ Post my own</button>
          ${mappable(shown.filter((q) => OPEN.has(q.status))).length ? html`<button class="btn small" data-act="map">🗺 Map</button>` : ""}
        </div>
      </div>
      ${filter !== "open" ? html`<div class="quests">${shown.length ? shown.map(card) : html`<div class="empty"><p>Nothing here.</p></div>`}</div>` : html`
        <section class="active-panel" aria-label="Accepted quests">
          <h2 class="panel-title"><span>▮ Active</span><span class="muted small">${active.length} accepted</span></h2>
          ${active.length ? html`<div class="quests">${active.map(card)}</div>` : html`<p class="muted small panel-empty">No quest accepted. Take one off the board.</p>`}
        </section>
        <section class="cork" aria-label="Quest board">
          <h2 class="cork-title">Quest Board</h2>
          ${posted.length ? html`<div class="notes">${posted.map(note)}</div>` : html`<p class="cork-empty">Nothing pinned. Scout nearby, file a request, or wait for the guild master's next pass.</p>`}
        </section>`}`);
    function note(q) {
      const tilt = ((seedOf(q.id) % 7) - 3) * 0.6;
      const tasks = q.taskIds.length;
      return html`<button class="note n-${q.origin} d-${q.difficulty}" data-id="${q.id}" style="--tilt:${tilt}deg">
        <span class="pin" aria-hidden="true"></span>
        <span class="note-tag">${ORIGIN_TAG[q.origin] || q.origin}</span>
        <span class="note-title">${q.title}</span>
        ${q.origin === "inferred" && q.why ? html`<span class="note-why">${q.why}</span>` : q.brief ? html`<span class="note-brief">${q.brief}</span>` : ""}
        <span class="note-foot"><span class="note-diff">${DIFFICULTY[q.difficulty].label}</span><span class="note-xp">${payout(q)} XP</span></span>
        <span class="note-meta">${PROOF_LABEL[q.proof.type]}${q.expires ? ` · until ${q.expires}` : ""}${tasks ? ` · ⛓ ${tasks}` : ""}</span>
      </button>`;
    }
    function card(q) {
      const tasks = q.taskIds.map((id) => ctx.taskTitle(id)).filter(Boolean);
      return html`<button class="quest ${q.status} ${q.origin}" data-id="${q.id}">
        <div class="quest-top"><span class="tag">${ORIGIN_TAG[q.origin] || q.origin}</span><span class="diff d-${q.difficulty}">${DIFFICULTY[q.difficulty].label}</span>
          <span class="reward">+${payout(q)} XP</span></div>
        <div class="quest-title">${q.title}</div>
        ${q.origin === "inferred" && q.why ? html`<div class="why">${q.why}</div>` : q.brief ? html`<div class="brief">${q.brief}</div>` : ""}
        <div class="quest-foot"><span>${hasObjectives(q) ? `☑ ${objectiveCount(q).done}/${objectiveCount(q).total} objectives` : PROOF_LABEL[q.proof.type]}</span>${q.encounter ? html`<span>${q.encounter.type === "chest" ? "📦 chest" : "📜 scholar"}</span>` : ""}${q.expires ? html`<span>⏳ ${q.expires}</span>` : ""}${tasks.length ? html`<span>⛓ ${tasks.length} task${tasks.length > 1 ? "s" : ""}</span>` : ""}
          ${ctx.taskDone(q) ? html`<span class="status ready">✓ task done · turn in</span>` : q.status !== "posted" ? html`<span class="status">${q.status}</span>` : ""}</div>
      </button>`;
    }
  };
  draw();
  ui.onStore((c) => { if (["quest", "sync", "sync-end", "settings", "stats", "showcase"].includes(c.op)) draw(); });

  el.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { filter = f.dataset.filter; draw(); return; }
    const card = e.target.closest(".quest[data-id], .note[data-id]");
    if (card) return openQuest(ctx, ctx.quests().find((q) => q.id === card.dataset.id));
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "scout") return scout(ctx);
    if (act === "request") return fileRequest(ctx);
    if (act === "new") return postOwn(ctx);
    if (act === "map") { const id = await questMap(ctx.quests().filter((q) => OPEN.has(q.status) && q.giver !== "trainer")); if (id) openQuest(ctx, ctx.quests().find((q) => q.id === id)); return; }
  });
}

async function scout(ctx) {
  try {
    const pos = await position({ highAccuracy: false });
    const res = await fetch(geosearchUrl(pos));
    const data = await res.json();
    const found = scoutQuests(data?.query?.geosearch, { taken: ctx.store.ids(), now: ctx.now() });
    if (!found.length) return toast("No new landmarks within 5 km. Try again somewhere else.");
    for (const q of found) ctx.store.put(q);
    toast(`${found.length} scouting quest${found.length > 1 ? "s" : ""} posted.`);
    ctx.syncNow();
  } catch (err) { errorToast(err, "Couldn't scout"); }
}

async function fileRequest(ctx) {
  const text = await promptSheet({ title: `${ctx.settings().relayName} · new request`, label: "What do you want to do?", multiline: true, placeholder: "e.g. get back into climbing; read more fiction; see the coast", confirm: "File it", hint: "The guild master shapes it into a quest on the next pass." });
  if (!text?.trim()) return;
  const title = text.trim().split("\n")[0].slice(0, 90);
  ctx.store.put({ id: newId(`req-${title}`, ctx.store.ids()), title, detail: text.trim(), status: "requested", origin: "request", giver: "relay", author: "self", taskIds: [], difficulty: "normal", attributes: {}, proof: { type: "honor" }, posted: ctx.now() });
  toast(filedRequest());
  ctx.syncNow();
}

async function postOwn(ctx) {
  const opts = (list, labels) => list.map((v) => html`<option value="${v}">${labels?.[v] || v}</option>`);
  const tasks = ctx.store.tasks.active.slice().sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const out = await sheet({
    title: "Post a quest",
    body: html`<form class="form" data-f>
      <label class="field"><span>Title</span><input class="input" name="title" required autofocus></label>
      <label class="field"><span>Brief</span><input class="input" name="brief"></label>
      <div class="grid2">
        <label class="field"><span>Difficulty</span><select class="input" name="difficulty">${opts(Object.keys(DIFFICULTY))}</select></label>
        <label class="field"><span>Proof</span><select class="input" name="proof">${opts(PROOFS, PROOF_LABEL)}</select></label>
        <label class="field"><span>Exercise (reps)</span><select class="input" name="exercise">${opts(EXERCISES)}</select></label>
        <label class="field"><span>Reps (or steps, for a jog)</span><input class="input" name="count" type="number" min="1" value="20"></label>
        <label class="field"><span>Attribute</span><select class="input" name="attr">${opts(["", "str", "vit", "agi", "int", "wis", "cha", "wil"])}</select></label>
        <label class="field"><span>Trains skill</span><select class="input" name="skill"><option value="">—</option>${ctx.store.skills().map((k) => html`<option value="${k.id}">${k.name}</option>`)}</select></label>
        <label class="field"><span>Expires</span><input class="input" name="expires" type="date"></label>
      </div>
      <label class="field"><span>Built on a task</span><select class="input" name="task"><option value="">—</option>${tasks.map((t) => html`<option value="${t.id}">${t.title}</option>`)}</select></label>
    </form>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Post</button>`,
    setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => {
      const f = d.querySelector("[data-f]");
      if (!f.reportValidity()) return;
      close(Object.fromEntries(new FormData(f)));
    }),
  });
  if (!out) return;
  if (out.proof === "gps") return toast("GPS quests come from Scout nearby or the guild master — they need a public place.", { error: true });
  const proof = out.proof === "reps" ? { type: "reps", exercise: out.exercise, count: Number(out.count) } : out.proof === "jog" ? { type: "jog", steps: Number(out.count) } : { type: out.proof };
  try {
    ctx.store.put({ id: newId(out.title, ctx.store.ids()), title: out.title.trim(), brief: out.brief?.trim() || undefined, status: "posted", origin: out.task ? "task" : "self", giver: "self", author: "self",
      taskIds: out.task ? [out.task] : [], difficulty: out.difficulty, attributes: out.attr ? { [out.attr]: 1 } : out.proof === "reps" ? { str: 1 } : {},
      skills: out.skill ? { [out.skill]: 1 } : undefined, proof, posted: ctx.now(), expires: out.expires || undefined });
    ctx.syncNow();
  } catch (err) { errorToast(err); }
}

function position({ highAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Location permission was refused." : "Couldn't get a location fix.")),
      { enableHighAccuracy: highAccuracy, timeout: 20000, maximumAge: highAccuracy ? 0 : 300000 },
    );
  });
}

async function openQuest(ctx, q) {
  if (!q) return;
  const s = ctx.settings();
  const tasks = q.taskIds.map((id) => ({ id, title: ctx.taskTitle(id) }));
  const ev = q.evidence;
  const pitch = q.origin === "inferred" && q.status === "posted" ? inferredIntro(q) : questPitch(q, payout(q), DIFFICULTY[q.difficulty]?.label || "Normal");
  const act = await sheet({
    title: q.title,
    body: html`
      ${s.relay ? relayBubble(s.relayName, pitch) : ""}
      ${q.brief ? html`<p>${q.brief}</p>` : ""}
      ${q.detail ? html`<p class="muted pre">${q.detail}</p>` : ""}
      ${ctx.taskDone(q) ? html`<p class="notice">You finished its task in Tasks. Turn it in below to claim the XP.</p>` : ""}
      <dl class="facts">
        ${hasObjectives(q) ? html`<dt>Reward</dt><dd>+${objectiveXp(q).potential} XP${objectiveXp(q).bonus ? html` <span class="muted">(+${objectiveXp(q).bonus} bonus)</span>` : ""}</dd>` : html`<dt>Reward</dt><dd>+${payout(q)} XP${q.proof.type !== "honor" ? html` <span class="muted">(+${payout(q, "honor")} on your word alone)</span>` : ""}</dd>`}
        ${hasObjectives(q) ? "" : html`<dt>Proof</dt><dd>${PROOF_LABEL[q.proof.type]}<button class="info-tip" type="button" data-tip aria-label="How this proof works" title="${proofTip(q)}">ⓘ</button>${q.proof.type === "reps" ? ` · ${q.proof.count} ${q.proof.exercise}` : q.proof.type === "jog" ? ` · ${q.proof.steps.toLocaleString()} steps` : q.proof.type === "gps" ? ` · ${q.proof.target.place || "marked spot"}` : ""}</dd>`}
        ${Object.keys(q.attributes).length || q.skills ? html`<dt>Trains</dt><dd>${[...Object.keys(q.attributes).map((a) => a.toUpperCase()), ...Object.keys(q.skills || {}).map((id) => ctx.store.skills().find((k) => k.id === id)?.name || id)].join(" · ")}</dd>` : ""}
        ${q.expires ? html`<dt>Closes</dt><dd>${q.expires}</dd>` : ""}
        <dt>Posted by</dt><dd>${q.giver === "guildmaster" ? "the guild master" : q.giver === "relay" ? s.relayName : q.giver === "board" ? "the board" : "you"}</dd>
        ${tasks.length ? html`<dt>Tasks</dt><dd>${tasks.map((t) => html`<div>⛓ ${t.title || t.id}</div>`)}</dd>` : ""}
        ${q.link ? html`<dt>About</dt><dd><a href="${q.link}" target="_blank" rel="noopener">Read about it</a></dd>` : ""}
        ${ev ? html`<dt>${ev.type === "failed" ? "Handed in" : "Turned in"}</dt><dd>${(q.completed || "").slice(0, 10)} · ${PROOF_LABEL[ev.type]}${ev.reps ? ` · ${ev.reps} reps` : ""}${ev.distance != null ? ` · ${ev.distance} m away` : ""}${ev.note ? html`<div class="muted">${ev.type === "failed" ? "Lesson: " : ""}${ev.note}</div>` : ""} · +${q.xp} XP</dd>` : ""}
      </dl>
      ${hasObjectives(q) ? objectiveList(q) : ""}
      ${q.encounter && q.status !== "done" ? html`<p class="notice">${q.encounter.type === "chest" ? "📦 Something's waiting there: a chest, opened when you check in." : "📜 Someone's waiting there: a scholar, met when you check in."}</p>` : ""}
      ${q.proof.type === "gps" && mappable([q]).length ? html`<button class="btn small" data-map>🗺 Show on the map</button>` : ""}
      ${q.status === "done" && q.encounter ? html`<button class="btn small" data-a="encounter">${q.encounter.type === "chest" ? "📦 Look in the chest again" : "📜 Revisit the scholar"}</button>` : ""}`,
    foot: html`${q.status === "posted" ? html`<button class="btn" data-a="decline">Decline</button><button class="btn" data-a="accept">Accept</button>` : ""}
      ${hasObjectives(q) ? (q.status === "accepted" && ready(q) ? html`<button class="btn primary" data-a="turnin">Turn in</button>` : "") : OPEN.has(q.status) ? html`${q.proof.type !== "honor" ? html`<button class="btn ghost" data-a="honor">On my word</button>` : ""}<button class="btn primary" data-a="turnin">Turn in</button>` : ""}
      ${q.status === "declined" || q.status === "expired" || (q.status === "failed" && q.origin !== "training" && q.origin !== "test") ? html`<button class="btn" data-a="repost">Put back on the board</button>` : ""}
      ${q.status === "accepted" && q.giver !== "trainer" ? html`<div class="sheet-more"><button class="btn ghost small" data-a="abandon">Abandon</button><button class="btn ghost small" data-a="fail">Hand in as failed</button></div>` : ""}`,
    setup: (d, close) => {
      d.addEventListener("click", (e) => { if (e.target.closest("[data-tip]")) return toast(proofTip(q), { timeout: 7000 }); const a = e.target.closest("[data-a]"); if (a) close(a.dataset.a); if (e.target.closest("[data-map]")) close("map"); const o = e.target.closest("[data-obj]"); if (o) close(`obj:${o.dataset.obj}`); });
      if (s.voice) speak(pitch, s);
    },
  });
  try {
    if (act === "accept") {
      ctx.accept(q);
      const line = cheerAccept({ chattiness: s.chattiness });
      toast(`${s.relay ? `${s.relayName}: ${line} ` : ""}${q.taskIds.length ? "Flagged on its task." : "Added to your Guild tasks."}`);
      if (s.voice) speak(line, s);
    }
    else if (act === "decline") ctx.store.put({ ...q, status: "declined" });
    else if (act === "repost") ctx.store.put({ ...q, status: "posted", expires: undefined, completed: undefined, evidence: undefined, xp: undefined });
    else if (act === "abandon") { ctx.abandon(q); joySays(s, sayAbandon()); }
    else if (act === "fail") {
      const lesson = await promptSheet({ title: "Hand in as failed", label: "Lesson learned (optional)", multiline: true, confirm: "Hand it in", hint: "Logged with 0 XP. No penalty beyond that." });
      if (lesson == null) return;
      ctx.fail(q, lesson.trim());
      joySays(s, sayFailed());
    }
    else if (act === "turnin") await turnIn(ctx, q, q.proof.type);
    else if (act?.startsWith("obj:")) { const next = await objectiveAction(ctx, q, act.slice(4)); return openQuest(ctx, next || ctx.quests().find((x) => x.id === q.id)); }
    else if (act === "encounter") await openEncounter(q, { taskTitle: ctx.taskTitle });
    else if (act === "map") { const id = await questMap([q], { focus: q.id }); if (id) openQuest(ctx, q); }
    else if (act === "honor") await turnIn(ctx, q, "honor");
    else return;
    ctx.syncNow();
  } catch (err) { errorToast(err); }
}

async function turnIn(ctx, q, type) {
  let evidence;
  if (hasObjectives(q)) {
    if (!ready(q)) return toast(`${objectiveCount(q).left} objective${objectiveCount(q).left === 1 ? "" : "s"} still to go.`);
    evidence = {};
  } else if (type === "gps") {
    const pos = await position();
    const t = q.proof.target;
    const r = checkIn(pos, t, t.radius || 60, pos.accuracy);
    if (!r.inRange) return toast(`Not there yet: ${r.distance} m ${r.direction}. Get within ${r.allowed} m.`, { timeout: 7000 });
    evidence = { distance: r.distance }; // never your coordinates
  } else if (type === "reps") {
    const { countReps } = await import("../vision/reps-sheet.js");
    const res = await countReps(q.proof.exercise, q.proof.count);
    if (!res) return;
    if (res.reps < q.proof.count) return toast(`${res.reps}/${q.proof.count} counted. Not enough for the stamp — try again when you're ready.`, { timeout: 7000 });
    evidence = { exercise: q.proof.exercise, reps: res.reps, verified: true };
  } else if (type === "jog") {
    const res = await trackJog(ctx.settings(), { steps: q.proof.steps, title: q.title });
    if (!res) return;
    if (res.steps < q.proof.steps) return toast(`${res.steps.toLocaleString()}/${q.proof.steps.toLocaleString()} steps. Not enough for the stamp yet — go again when you're ready.`, { timeout: 7000 });
    if (res.manual) { type = "honor"; evidence = { steps: res.steps, manual: true }; }
    else evidence = { meters: res.meters, steps: res.steps, minutes: res.minutes, tracked: true }; // totals only, never the route
  } else if (type === "photo") {
    const path = await uploadPhoto(ctx, q.id);
    if (!path) return;
    evidence = { photo: path };
  } else if (type === "journal") {
    const day = await promptSheet({ title: "Which journal day?", type: "date", value: ctx.today(), confirm: "Link it", hint: "Only the date is saved; the entry isn't read." });
    if (!day) return;
    evidence = { journalDay: day };
  } else {
    const note = await promptSheet({ title: "How did it go?", multiline: true, confirm: "Turn in", hint: "Optional. Your word pays a bit over half." });
    if (note == null) return;
    evidence = note.trim() ? { note: note.trim() } : {};
  }
  const before = ctx.derived();
  const done = complete(q, { proofType: type, evidence, at: ctx.now() });
  ctx.store.put(done);
  ctx.afterTurnIn(done);
  const after = ctx.derived();
  const gains = attributeGains(before.attributes, after.attributes)
    .map((g) => `${g.name}${g.xp ? ` +${g.xp} XP` : ""}${g.from !== g.to ? ` (tier ${g.from || "–"} → ${g.to || "–"})` : ""}`).join(" · ");
  toast(`${stamped(done, done.xp)}${gains ? ` ${gains}.` : ""}`, { timeout: 6000 });
  const s = ctx.settings();
  const levelUp = after.level.level > before.level.level;
  const ding = levelUp && cheerLevel(after.level.level, { chattiness: s.chattiness });
  if (s.voice) speak(ding || cheerTurnIn(done, done.xp, { chattiness: s.chattiness }), s);
  if (ding && s.relay) toast(`${s.relayName}: ${ding}`, { timeout: 6000 });
  celebrate();
  if (done.encounter) await openEncounter(done, { taskTitle: ctx.taskTitle });
  await announce(before, after);
}

/** A line from Joy: a toast with her name, and her voice when it's on. */
function joySays(s, line) {
  if (s.relay) toast(`${s.relayName}: ${line}`);
  if (s.voice) speak(line, s);
}

function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.add("stamp");
  setTimeout(() => document.body.classList.remove("stamp"), 900);
}


// An expedition's checklist: each objective with its type, what finishes it and its XP.
// Linked ones (a task, a quest, a Research source) tick themselves on sync; the rest are yours.
function objectiveList(q) {
  const x = objectiveXp(q), n = objectiveCount(q), live = q.status === "accepted";
  return html`<section class="objectives">
    <h4><span>Objectives · ${n.done}/${n.total}</span><span class="muted small">${x.earned} of ${x.potential + x.bonus} XP earned</span></h4>
    <ul>${q.objectives.map((o) => {
      const done = isDone(q, o), by = q.progress?.[o.id]?.by;
      const act = !live || isAuto(o) ? "" : done ? (by === "you" ? html`<button class="btn small ghost" data-obj="${o.id}" aria-label="Untick">↺</button>` : "")
        : html`<button class="btn small" data-obj="${o.id}">${{ gps: "Check in", reps: "Count", journal: "Link day" }[o.link?.system] || "Tick"}</button>`;
      return html`<li class="obj ${done ? "done" : ""} ${o.optional ? "optional" : ""}">
        <span class="obj-box" aria-hidden="true">${done ? "☑" : "☐"}</span>
        <div class="obj-main"><div><span class="obj-type" title="${o.type}">${OBJECTIVE_TYPES[o.type]}</span> ${o.text}${o.optional ? html` <span class="tag">bonus</span>` : ""}</div>
          <div class="muted small">${done ? (by === "auto" ? "Found it: ticked off automatically" : "Done") : howItCompletes(o)}</div></div>
        <span class="obj-xp">+${o.xp}</span>${act}</li>`;
    })}</ul></section>`;
}

/** Does one objective's own step (tick, check-in, count, journal day) and saves it. Returns the updated quest. */
async function objectiveAction(ctx, q, id) {
  const o = q.objectives.find((x) => x.id === id);
  if (!o || q.status !== "accepted" || isAuto(o)) return null;
  const at = ctx.now();
  if (isDone(q, o)) { const next = unmark(q, id); ctx.store.put(next); return next; }
  const l = o.link || {};
  let refs = [];
  if (l.system === "gps") {
    const pos = await position();
    const r = checkIn(pos, l.target, l.target.radius || 60, pos.accuracy);
    if (!r.inRange) { toast(`Not there yet: ${r.distance} m ${r.direction}. Get within ${r.allowed} m.`, { timeout: 7000 }); return null; }
  } else if (l.system === "reps") {
    const { countReps } = await import("../vision/reps-sheet.js");
    const res = await countReps(l.exercise, l.count);
    if (!res) return null;
    if (res.reps < l.count) { toast(`${res.reps}/${l.count} counted. Not quite: try again when you're ready.`, { timeout: 7000 }); return null; }
  } else if (l.system === "journal") {
    const day = await promptSheet({ title: "Which journal day?", type: "date", value: ctx.today(), confirm: "Link it", hint: "Only the date is saved; the entry isn't read." });
    if (!day) return null;
    refs = [`journal:${day}`];
    if (claimed(ctx.quests()).has(refs[0])) { toast("That journal day already counted for another objective. Each record pays once."); return null; }
  }
  const next = markDone(q, id, { refs, at });
  ctx.store.put(next);
  if (ready(next) && !ready(q)) toast("All the required objectives are done. Turn it in when you're ready.", { timeout: 6000 });
  return next;
}
