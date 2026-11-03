// The Train tab: your grade, the trainer's missions for today, and the grade
// test when you've earned a shot at it. Everything here is derived from quest
// records (core/grades.js) — the grade is never stored, so it can't drift from
// the evidence. Sets are counted by the camera (vision/reps-sheet.js); frames
// never leave the device, only the count does.
//
// Opening the tab posts today's missions (stable ids, so a second visit posts
// nothing). A set that falls short is still logged, as "failed" with the reps
// you did: the trainer holds you there, and it still counts as a training day.
// A set the camera counted nothing for (it didn't start, or you stopped) logs
// nothing at all — missing is not zero.

import { html, sheet, toast, errorToast, confirmSheet } from "../ui/dom.js";
import { complete } from "../core/quests.js";
import { GRADES, PUSHUP_PERCENTILE, PREREQ, RETAKE_DAYS, eligibility, trainingPlan, testSets, attempts } from "../core/grades.js";

const dayOf = (iso) => String(iso || "").slice(0, 10);
const NAME = { pushup: "Push-ups", squat: "Squats", situp: "Sit-ups" };
const who = (p) => `${p.sex === "female" ? "women" : "men"} ${(p.ageBand || "20-29").replace("-", "–")}`;

export async function mount(el, ctx, route, ui) {
  postToday(ctx);
  const draw = () => {
    const today = ctx.today();
    const quests = ctx.quests();
    const profile = ctx.store.profile();
    const el2 = eligibility(quests, { profile, today });
    const { grade, next } = el2;
    const todays = quests.filter((q) => q.origin === "training" && dayOf(q.posted) === today);
    const plan = todays.length ? null : trainingPlan(quests, { profile, today, now: ctx.now() });
    const record = attempts(quests).slice(0, 6);
    el.innerHTML = String(html`
      <section class="grade-head">
        <div class="grade-badge">${grade.id}</div>
        <div class="grow">
          <div class="grade-title">${grade.title}</div>
          <div class="muted small">${grade.since ? `Grade ${grade.id} since ${grade.since}` : "Everyone starts here."}${next ? ` · next: ${next.id}, ${next.title}` : " · the top grade"}</div>
        </div>
      </section>
      ${!profile.sex || !profile.ageBand ? html`<p class="notice">Push-up targets come from population norms for your sex and age band. Set them in <a href="#/settings">Settings</a> — until then the targets are for men 20–29.</p>` : ""}
      ${next ? testPanel(el2, profile) : html`<p class="empty">You've passed every grade. The trainer keeps setting max sets so you can see where you stand.</p>`}
      <section class="train-day">
        <h3>Today from the trainer</h3>
        ${todays.length ? html`<div class="missions">${todays.map((q) => mission(q, today))}</div>`
          : plan?.rest ? html`<p class="muted">Rest day — three training days in a row earn one. Quests from the rest of your life still count toward the test.</p>`
          : el2.eligible ? html`<p class="muted">Nothing set: you've hit every target. Sit the test when you're ready.</p>`
          : html`<p class="muted">Nothing set today.</p>`}
        <div class="free-sets">
          <span class="muted small">Free set, any day, counted by the camera:</span>
          ${FREE.map((ex) => html`<button class="btn" data-free="${ex}">◉ ${ex}s</button>`)}
        </div>
      </section>
      ${record.length ? html`<section class="train-record"><h3>Test record</h3>${record.map(attemptRow)}</section>` : ""}
      <details class="footnote"><summary>How grades work</summary>
        <p>Your grade only changes by passing a grade test: one camera-counted set per exercise, each reaching its target, in one sitting. You can't skip a grade. To sit a test you need training days (a day with at least one camera-counted set from the trainer) and quests from the rest of your life (tasks, reading, places), both since your last promotion: ${Object.entries(PREREQ).map(([g, p]) => `${g} ${p.sessions}+${p.life}`).join(", ")}. Fail a test and you can retake it after ${RETAKE_DAYS} days.</p>
        <p>Push-up targets are percentiles of published population norms for your sex and age band (${Object.entries(PUSHUP_PERCENTILE).map(([g, p]) => `${g} ${p}th`).join(", ")}; women's norms are for knee push-ups). Squats and sit-ups have no comparable norms in our sources, so they use the guild's own ladder.</p>
        <p>The trainer starts with an assessment max set, then sets you about 70% of your best and adds a rep each time you hit it, re-tests your max weekly, and rests you after three days in a row. It's a fixed rule, not an AI.</p>
      </details>`);
  };
  draw();
  ui.onStore((c) => { if (["quest", "sync", "sync-end", "stats"].includes(c.op)) draw(); });

  el.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-mission]");
    if (m) return runMission(ctx, ctx.quests().find((q) => q.id === m.dataset.mission));
    if (e.target.closest("[data-sit]")) return sitTest(ctx);
    const f = e.target.closest("[data-free]");
    if (f) return runMission(ctx, freeSet(ctx, f.dataset.free));
  });
}

function postToday(ctx) {
  try {
    const { missions } = trainingPlan(ctx.quests(), { profile: ctx.store.profile(), today: ctx.today(), now: ctx.now() });
    const have = ctx.store.ids();
    const fresh = missions.filter((m) => !have.has(m.id));
    for (const m of fresh) ctx.store.put(m);
    if (fresh.length) ctx.syncNow();
  } catch (err) { errorToast(err, "The trainer couldn't post today's missions"); }
}

function testPanel(e, profile) {
  const pct = (n) => Math.min(100, Math.round((n.have / n.need) * 100));
  return html`<section class="test-panel">
    <h3>${e.next.id}-grade test</h3>
    <div class="prereq">
      <div><span>Training days</span><span class="muted">${Math.min(e.sessions.have, e.sessions.need)}/${e.sessions.need}</span></div>
      <div class="xpbar" role="progressbar" aria-label="Training days" aria-valuenow="${e.sessions.have}" aria-valuemax="${e.sessions.need}"><i style="width:${pct(e.sessions)}%"></i></div>
      <div><span>Quests from your life</span><span class="muted">${Math.min(e.life.have, e.life.need)}/${e.life.need}</span></div>
      <div class="xpbar" role="progressbar" aria-label="Quests from your life" aria-valuenow="${e.life.have}" aria-valuemax="${e.life.need}"><i style="width:${pct(e.life)}%"></i></div>
    </div>
    <table class="bench">
      <thead><tr><th>Set</th><th>Your best</th><th>Target</th></tr></thead>
      <tbody>${Object.entries(e.targets).map(([ex, target]) => {
        const best = e.best[ex];
        return html`<tr class="${best != null && best >= target ? "met" : ""}">
          <td>${NAME[ex] || ex}<div class="muted small">${ex === "pushup" ? `${PUSHUP_PERCENTILE[e.next.id]}th percentile, ${who(profile)}` : "guild ladder"}</div></td>
          <td>${best == null ? html`<span class="muted">not yet measured</span>` : best}</td>
          <td>${target}</td></tr>`;
      })}</tbody>
    </table>
    <p class="muted small">Best is your top camera-counted set in the last 30 days.</p>
    ${e.eligible ? html`<button class="btn primary" data-sit>Sit the ${e.next.id}-grade test</button>`
      : html`<p class="muted">To sit it: ${e.missing.join("; ")}.</p>`}
  </section>`;
}

function mission(q, today) {
  const ev = q.evidence;
  const open = q.status === "posted" || q.status === "accepted";
  const retry = q.status === "failed" && dayOf(q.completed) === today;
  return html`<div class="mission ${q.status}">
    <div class="grow">
      <div class="mission-title">${q.title}</div>
      ${q.brief ? html`<div class="muted small">${q.brief}</div>` : ""}
      ${q.status === "done" ? html`<div class="small ok">✓ ${ev?.reps ?? "?"} counted · +${q.xp} XP</div>`
        : q.status === "failed" ? html`<div class="small warn">${ev?.reps ?? 0}/${q.proof.count} counted — logged</div>`
        : q.status === "expired" ? html`<div class="small muted">Expired</div>` : ""}
    </div>
    ${open || retry ? html`<button class="btn ${open ? "primary" : ""}" data-mission="${q.id}">${open ? "◉ Start" : "Try again"}</button>` : ""}
  </div>`;
}

function attemptRow(a) {
  return html`<div class="attempt ${a.passed ? "passed" : "failed"}">
    <span class="grade-chip">${a.grade}</span><span>${a.day}</span>
    <span class="grow small">${a.sets.map((s) => `${NAME[s.exercise] || s.exercise} ${s.reps}/${s.target}`).join(" · ")}</span>
    <b>${a.passed ? "Passed" : "Not yet"}</b>
  </div>`;
}

// Free sets are max sets you start yourself: they count as training and as your best,
// so the trainer's targets follow them, but they're never posted to the board.
const FREE = ["pushup", "squat", "situp"];

function freeSet(ctx, ex) {
  const now = ctx.now();
  return { id: `free-${now.replace(/[^0-9]/g, "").slice(0, 14)}-${ex}`, title: `Free set: ${ex}s`, status: "accepted", origin: "training", giver: "trainer", author: "trainer",
    kind: "max", taskIds: [], difficulty: "normal", attributes: { str: ex === "situp" ? 0.5 : 1, vit: ex === "situp" ? 0.5 : 0 },
    proof: { type: "reps", exercise: ex, count: 1 }, posted: now };
}

async function count(q, opts) {
  const { countReps } = await import("../vision/reps-sheet.js");
  return countReps(q.proof.exercise, q.proof.count, opts);
}

/** Log one counted set: done (paid) if it reached the target, failed (with the reps) if not. */
function logSet(ctx, q, reps) {
  const evidence = { exercise: q.proof.exercise, reps, verified: true };
  const rec = reps >= q.proof.count ? complete(q, { proofType: "reps", evidence, at: ctx.now() })
    : { ...q, status: "failed", completed: ctx.now(), evidence: { type: "reps", ...evidence } };
  ctx.store.put(rec);
  return rec;
}

async function runMission(ctx, q) {
  if (!q) return;
  try {
    const res = await count(q, { max: q.kind === "max" });
    if (!res) return;
    if (!res.reps) return toast("Nothing was counted, so nothing was logged.");
    const rec = logSet(ctx, q, res.reps);
    if (rec.status === "done") { toast(q.kind === "max" ? `${res.reps} — noted. The trainer sets your next sets from this.` : `${res.reps}/${q.proof.count}. Stamped: +${rec.xp} XP.`, { timeout: 5000 }); celebrate(); }
    else toast(`${res.reps}/${q.proof.count}. Logged — it still counts as training. The trainer will hold you here.`, { timeout: 6000 });
    ctx.syncNow();
  } catch (err) { errorToast(err); }
}

async function sitTest(ctx) {
  const profile = ctx.store.profile();
  const e = eligibility(ctx.quests(), { profile, today: ctx.today() });
  if (!e.eligible) return;
  const g = e.next;
  const sets = testSets(g.id, { profile, now: ctx.now() });
  const list = sets.map((q) => `${q.proof.count} ${q.proof.exercise}s`).join(", then ");
  const go = await confirmSheet(`${list}. Each set must reach its target, counted by the camera. Rest as long as you like between sets.`, { title: `${g.id}-grade test`, confirm: "Begin", detail: `Stop partway and it counts as a failed attempt (retake after ${RETAKE_DAYS} days). Stopping before the first set is counted changes nothing.` });
  if (!go) return;
  const done = [];
  try {
    for (const [i, q] of sets.entries()) {
      if (i > 0) {
        const prev = done[i - 1];
        const ready = await sheet({
          title: `Set ${i + 1} of ${sets.length}`,
          body: html`<p>${prev.status === "done" ? `✓ ${prev.evidence.reps}/${prev.proof.count} ${prev.proof.exercise}s.` : `${prev.evidence.reps}/${prev.proof.count} ${prev.proof.exercise}s — short of the target, so this attempt won't pass, but the rest of the sets still tell the trainer where you are.`}</p>
            <p>Next: <b>${q.proof.count} ${q.proof.exercise}s</b>. Start when you've got your breath back.</p>`,
          foot: html`<button class="btn" data-close>Stop the test</button><button class="btn primary" data-go>Start</button>`,
          setup: (d, close) => d.querySelector("[data-go]").addEventListener("click", () => close(true)),
        });
        if (!ready) break;
      }
      const res = await count(q, { title: `${g.id} test · set ${i + 1}/${sets.length}: ${q.proof.count} ${q.proof.exercise}s` });
      if (!res || !res.reps) { if (!done.length) return toast("Test not started — nothing was logged."); break; }
      done.push(logSet(ctx, q, res.reps));
    }
  } catch (err) { errorToast(err); }
  if (!done.length) return;
  ctx.syncNow();
  const passed = done.length === sets.length && done.every((r) => r.status === "done");
  if (passed) {
    celebrate();
    await sheet({
      title: `Promoted: grade ${g.id}`,
      body: html`<p class="promo"><span class="grade-badge big">${g.id}</span></p><p>You're now <b>${g.title}</b>. Every set reached its target, counted by the camera.</p>
        ${GRADES[GRADES.findIndex((x) => x.id === g.id) + 1] ? html`<p class="muted">The trainer now works you toward the next test.</p>` : ""}`,
      foot: html`<button class="btn primary" data-close>On we go</button>`,
    });
  } else {
    const retake = new Date(Date.parse(`${ctx.today()}T12:00:00Z`) + RETAKE_DAYS * 864e5).toISOString().slice(0, 10);
    toast(`Not this time. Keep training — you can retake it from ${retake}.`, { timeout: 7000 });
  }
}

function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.add("stamp");
  setTimeout(() => document.body.classList.remove("stamp"), 900);
}
