// The Stats page's two showcase sections, in the manhwa status-window style:
// SKILLS (what Silica knows, is learning and means to learn, each with a
// level) and the ACHIEVEMENTS cabinet (the guild's medals, earned or still
// ahead with progress, plus Silica's own life trophies and goals). Rendering
// and the add/edit sheets live here; stats.js mounts them.

import { html, raw, sheet, toast, confirmSheet } from "../ui/dom.js";
import { SKILL_KINDS, SKILL_LEVELS, MAX_SKILL_LEVEL, validateSkill } from "../core/skills.js";
import { TROPHY_TIERS, validateTrophy } from "../core/achievements.js";
import { slug } from "../core/quests.js";

// ---------- skills ----------

export function skillsSection(skills) {
  const groups = [["known", "Acquired"], ["learning", "Training"], ["aspiring", "Sealed"]];
  return html`<section class="window skills" aria-label="Skills">
    <h2 class="window-title"><span>【 SKILLS 】</span><button class="btn small ghost" data-sk="add">+ Skill</button></h2>
    ${skills.length ? groups.map(([status, label]) => {
      const list = skills.filter((s) => s.status === status);
      return list.length ? html`<div class="skill-group"><h3>${label}</h3>${list.map(skillRow)}</div>` : "";
    }) : html`<p class="muted small">No skills yet. Add the things you actually know and are learning — set each one's level honestly; quests that train it level it up.</p>`}
  </section>`;
}

function skillRow(s) {
  const pct = s.max ? 100 : s.need ? Math.round((s.into / s.need) * 100) : 0;
  return html`<button class="skill k-${s.kind} ${s.level ? "" : "sealed"} ${s.max ? "maxed" : ""}" data-skill="${s.id}">
    <span class="skill-kind">[${SKILL_KINDS[s.kind]}]</span>
    <span class="skill-name">${s.name}</span>
    <span class="skill-lv">${s.level ? html`Lv.<b>${s.max ? "MAX" : s.level}</b>` : html`<b>🔒</b>`}</span>
    <span class="skill-rank">${s.rank}${s.category ? html` · ${s.category}` : ""}</span>
    <span class="skill-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
    <span class="skill-xp">${s.max ? "Mastered" : s.level ? `${s.into}/${s.need} EXP` : "Unlocks with its first quest"}${s.quests ? ` · ${s.quests} quest${s.quests > 1 ? "s" : ""}` : ""}</span>
  </button>`;
}

export async function editSkill(ctx, existing) {
  const s = existing || { kind: "active", status: "known", startLevel: 1 };
  const levels = Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => i + 1);
  const out = await sheet({
    title: existing ? s.name : "New skill",
    body: html`<form class="form" data-f>
      <label class="field"><span>Skill</span><input class="input" name="name" value="${s.name || ""}" required autofocus placeholder="e.g. Python, Handstands, Vietnamese"></label>
      <div class="grid2">
        <label class="field"><span>Type</span><select class="input" name="kind">${Object.entries(SKILL_KINDS).map(([k, v]) => html`<option value="${k}" ${s.kind === k ? "selected" : ""}>${v}</option>`)}</select></label>
        <label class="field"><span>Status</span><select class="input" name="status">${[["known", "Acquired"], ["learning", "Training"], ["aspiring", "Sealed (want to learn)"]].map(([k, v]) => html`<option value="${k}" ${s.status === k ? "selected" : ""}>${v}</option>`)}</select></label>
        <label class="field"><span>Starting level (honest)</span><select class="input" name="startLevel">${levels.map((l) => html`<option ${Number(s.startLevel) === l ? "selected" : ""}>${l}</option>`)}</select></label>
        <label class="field"><span>Category</span><input class="input" name="category" value="${s.category || ""}" placeholder="Body, Mind, Craft…"></label>
      </div>
      <label class="field"><span>Note</span><input class="input" name="note" value="${s.note || ""}" placeholder="What it covers, how you learned it"></label>
      <p class="hint">Lv1 dabbling · Lv3 comfortable · Lv5 solid · Lv7 expert · Lv10 among the best. Quests that train this skill add EXP (${SKILL_LEVELS.slice(1, 4).join(", ")}… to level).</p>
    </form>`,
    foot: html`${existing ? html`<button class="btn danger" data-a="remove">Remove</button>` : ""}<button class="btn" data-close>Cancel</button><button class="btn primary" data-a="save">Save</button>`,
    setup: (d, close) => d.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "remove") close({ remove: true });
      if (a === "save") { const f = d.querySelector("[data-f]"); if (f.reportValidity()) close(Object.fromEntries(new FormData(f))); }
    }),
  });
  if (!out) return;
  if (out.remove) {
    if (await confirmSheet(`Remove ${s.name}?`, { confirm: "Remove", danger: true })) ctx.store.upsertShowcase("skills", { ...s, removed: true });
    return ctx.syncNow();
  }
  const ids = new Set(ctx.store.skills().map((x) => x.id));
  const id = existing?.id || (ids.has(slug(out.name)) ? `${slug(out.name)}-${Date.now().toString(36).slice(-4)}` : slug(out.name));
  const next = { ...(existing || {}), id, name: out.name.trim(), kind: out.kind, status: out.status, startLevel: Number(out.startLevel), category: out.category.trim() || undefined, note: out.note.trim() || undefined, since: existing?.since || ctx.today(), author: existing?.author || "self" };
  for (const k of ["level", "rank", "xp", "into", "need", "max", "earned", "start", "quests"]) delete next[k];
  const errs = validateSkill(next);
  if (errs.length) return toast(errs.join("; "), { error: true });
  ctx.store.upsertShowcase("skills", next);
  toast(existing ? "Skill updated." : `Skill acquired: ${next.name}`);
  ctx.syncNow();
}

// ---------- achievements ----------

const TROPHY_FILTERS = { all: "All", earned: "Earned", ahead: "Ahead", mine: "Life" };

/** One medal: a hexagon crest with a ribbon, coloured by tier; locked ones are dark with a progress ring. */
export function medal(a, size = 64) {
  const r = 26, c = 2 * Math.PI * 30;
  const hex = Array.from({ length: 6 }, (_, i) => { const t = Math.PI / 6 + (i * Math.PI) / 3; return `${(32 + r * Math.cos(t)).toFixed(1)},${(30 + r * Math.sin(t)).toFixed(1)}`; }).join(" ");
  return raw(`<svg viewBox="0 0 64 72" width="${size}" height="${Math.round(size * 1.125)}" class="medal m-${a.tier} ${a.earned ? "won" : "locked"}" aria-hidden="true">
    <path d="M20 50 L14 70 L24 64 L30 72 L32 52Z M44 50 L50 70 L40 64 L34 72 L32 52Z" class="ribbon"/>
    ${a.earned ? "" : `<circle cx="32" cy="30" r="30" class="ring-bg"/><circle cx="32" cy="30" r="30" class="ring" stroke-dasharray="${(c * a.progress).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 30)"/>`}
    <polygon points="${hex}" class="crest"/>
    <polygon points="${hex}" class="crest-edge" transform="translate(32 30) scale(.78) translate(-32 -30)"/>
    <text x="32" y="31" text-anchor="middle" dominant-baseline="central" class="medal-icon">${a.earned || a.kind === "personal" ? a.icon : "?"}</text>
  </svg>`);
}

export function trophiesSection(trophies, filter) {
  const earned = trophies.filter((a) => a.earned);
  const tally = Object.keys(TROPHY_TIERS).map((t) => [t, earned.filter((a) => a.tier === t).length]);
  const shown = trophies.filter((a) => filter === "earned" ? a.earned : filter === "ahead" ? !a.earned : filter === "mine" ? a.kind === "personal" : true);
  const latest = earned.filter((a) => a.date).sort((a, b) => b.date.localeCompare(a.date))[0] || earned[0];
  return html`<section class="window trophies" aria-label="Achievements">
    <h2 class="window-title"><span>【 ACHIEVEMENTS 】</span><button class="btn small ghost" data-tr="add">+ Trophy</button></h2>
    ${latest ? html`<button class="showcase-hero t-${latest.tier}" data-trophy="${latest.id}">
      ${medal(latest, 92)}
      <span class="hero-text"><span class="hero-kicker">Latest${latest.date ? ` · ${latest.date}` : ""}</span><span class="hero-title">${latest.title}</span><span class="hero-desc">${latest.desc}</span></span>
    </button>` : ""}
    <div class="tally"><b>${earned.length}</b><span>/ ${trophies.length} earned</span>${tally.map(([t, n]) => html`<span class="tally-dot d-${t}" title="${TROPHY_TIERS[t]}">${n}</span>`)}</div>
    <div class="row wrap">${Object.entries(TROPHY_FILTERS).map(([k, v]) => html`<button class="chip ${filter === k ? "on" : ""}" data-tf="${k}">${v}</button>`)}</div>
    <div class="cabinet">${shown.length ? shown.map((a) => html`<button class="trophy t-${a.tier} ${a.earned ? "won" : "locked"}" data-trophy="${a.id}">
      ${medal(a)}
      <span class="trophy-title">${a.title}</span>
      <span class="trophy-sub">${a.earned ? a.date || "Earned" : a.kind === "personal" ? "Goal" : `${a.value}/${a.target}`}</span>
    </button>`) : html`<p class="muted small">Nothing here yet.</p>`}</div>
  </section>`;
}

export async function openTrophy(ctx, a) {
  const mine = a.kind === "personal" ? ctx.store.trophies().find((t) => t.id === a.id) : null;
  const act = await sheet({
    title: a.title,
    body: html`<div class="trophy-detail t-${a.tier} ${a.earned ? "won" : "locked"}">${medal(a, 120)}
      <p class="tier-name">${TROPHY_TIERS[a.tier]} · ${a.kind === "personal" ? "Life trophy" : a.kind === "feat" ? "Feat" : "Guild medal"}</p>
      <p>${a.desc}</p>
      ${a.earned ? html`<p class="muted">${a.date ? `Earned ${a.date}` : "Earned"}</p>` : a.target ? html`<div class="skill-bar"><i style="width:${Math.round(a.progress * 100)}%"></i></div><p class="muted small">${a.value} / ${a.target}</p>` : html`<p class="muted">Still ahead. Claim it the day it happens.</p>`}
    </div>`,
    foot: mine ? html`<button class="btn danger" data-a="remove">Remove</button><button class="btn" data-a="edit">Edit</button>${!a.earned ? html`<button class="btn primary" data-a="claim">Claim it</button>` : ""}` : html`<button class="btn" data-close>Close</button>`,
    setup: (d, close) => d.addEventListener("click", (e) => { const x = e.target.closest("[data-a]"); if (x) close(x.dataset.a); }),
  });
  if (!mine || !act) return;
  if (act === "claim") { ctx.store.upsertShowcase("achievements", { ...mine, status: "earned", date: ctx.today() }); toast(`🏆 ${a.title} — earned.`); celebrate(); }
  if (act === "edit") return editTrophy(ctx, mine);
  if (act === "remove" && await confirmSheet(`Remove ${a.title}?`, { confirm: "Remove", danger: true })) ctx.store.upsertShowcase("achievements", { ...mine, removed: true });
  ctx.syncNow();
}

const ICONS = ["★", "♛", "✦", "⚔", "✊", "⌖", "✎", "♫", "✈", "⚑", "❖", "☀", "♥", "⚙", "✿", "∞"];

export async function editTrophy(ctx, existing) {
  const t = existing || { status: "earned", tier: "gold", icon: "★" };
  const out = await sheet({
    title: existing ? "Edit trophy" : "New trophy",
    body: html`<form class="form" data-f>
      <label class="field"><span>Achievement</span><input class="input" name="title" value="${t.title || ""}" required autofocus placeholder="e.g. Finished my first half-marathon"></label>
      <label class="field"><span>Story</span><input class="input" name="detail" value="${t.detail || ""}" placeholder="One line on what it meant"></label>
      <div class="grid2">
        <label class="field"><span>Kind</span><select class="input" name="status"><option value="earned" ${t.status !== "goal" ? "selected" : ""}>Earned</option><option value="goal" ${t.status === "goal" ? "selected" : ""}>Life goal (ahead)</option></select></label>
        <label class="field"><span>When (YYYY, YYYY-MM or a date)</span><input class="input" name="date" value="${t.date || ""}" placeholder="${ctx.today().slice(0, 4)}"></label>
        <label class="field"><span>Tier</span><select class="input" name="tier">${Object.entries(TROPHY_TIERS).map(([k, v]) => html`<option value="${k}" ${t.tier === k ? "selected" : ""}>${v}</option>`)}</select></label>
        <label class="field"><span>Category</span><input class="input" name="category" value="${t.category || ""}" placeholder="Body, Career, Travel…"></label>
      </div>
      <div class="icon-pick" role="radiogroup" aria-label="Icon">${ICONS.map((i) => html`<label><input type="radio" name="icon" value="${i}" ${t.icon === i ? "checked" : ""}><span>${i}</span></label>`)}</div>
    </form>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => { const f = d.querySelector("[data-f]"); if (f.reportValidity()) close(Object.fromEntries(new FormData(f))); }),
  });
  if (!out) return;
  const ids = new Set(ctx.store.trophies().map((x) => x.id));
  const base = `life-${slug(out.title)}`.slice(0, 70);
  const next = { ...(existing || {}), id: existing?.id || (ids.has(base) ? `${base}-${Date.now().toString(36).slice(-4)}` : base), title: out.title.trim(), detail: out.detail.trim() || undefined,
    status: out.status, date: out.date.trim() || (out.status === "earned" ? ctx.today() : undefined), tier: out.tier, icon: out.icon || "★", category: out.category.trim() || undefined, author: existing?.author || "self" };
  const errs = validateTrophy(next);
  if (errs.length) return toast(errs.join("; "), { error: true });
  ctx.store.upsertShowcase("achievements", next);
  toast(next.status === "goal" ? "Goal pinned to the cabinet." : "Trophy placed in the cabinet.");
  ctx.syncNow();
}

function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.add("stamp");
  setTimeout(() => document.body.classList.remove("stamp"), 900);
}
