// The status screen: level, guild grade and XP up top; a radar of the seven
// attributes by percentile; then one row per attribute with its tier, value and
// a distribution curve showing where you sit. Tap a row and Joy explains it;
// "Measure" types in a new value. Below them: Skills and the Achievements
// cabinet (views/showcase.js). Sources live in a small footnote at the
// bottom — the data behind them is swappable (core/norms.js).
//
// Charts: one series each (no legend), recessive grid, tooltips on hover/tap,
// and the attribute list itself is the table view of the radar.

import { html, raw, sheet, toast } from "../ui/dom.js";
import { METRICS, ATTRIBUTES, NORMS_VERSION } from "../core/norms.js";
import { TIERS, LEVEL_NOTE } from "../core/stats.js";
import { explainTier } from "../core/relay.js";
import { skillsSection, editSkill, trophiesSection, openTrophy, editTrophy } from "./showcase.js";

const fmt = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));

export async function mount(el, ctx, route, ui) {
  let open = null, filter = "all";
  const draw = () => {
    const d = ctx.derived();
    const s = ctx.settings();
    const prof = ctx.store.profile();
    const xpPct = Math.round((d.level.into / d.level.need) * 100);
    el.innerHTML = String(html`
      <section class="status-head">
        <div class="lv" title="${LEVEL_NOTE}"><span class="lv-label">LV</span><span class="lv-num">${d.level.level}</span></div>
        <div class="grow">
          <div class="rankline"><span class="rank-badge">${d.rank.id}</span><span>${d.rank.title}</span></div>
          <div class="xpbar" role="progressbar" aria-valuenow="${d.level.into}" aria-valuemax="${d.level.need}" aria-label="XP to next level"><i style="width:${xpPct}%"></i></div>
          <div class="muted small">${d.level.into}/${d.level.need} XP to Lv ${d.level.level + 1} · ${d.xp} total${d.rank.next ? ` · grade ${d.rank.next.id} by test (Train tab)` : ""}${d.streak ? ` · ${d.streak}-day streak` : ""}</div>
        </div>
      </section>
      ${!prof.ageBand ? html`<p class="notice">Set your age band in <a href="#/settings">Settings</a> so strength is compared with people your age.</p>` : ""}
      <section class="radar-wrap">${raw(radar(d.attributes))}<div class="tip" hidden></div></section>
      <section class="attrs">${d.attributes.map((a) => attrRow(a, open === a.id, s))}</section>
      ${skillsSection(d.skills)}
      ${trophiesSection(d.trophies, filter)}
      <details class="footnote"><summary>Sources & method</summary>
        <p>${LEVEL_NOTE} Skills unlock at Lv 1 when you turn in a quest that trains them; rare, epic and legendary feats train them 1.5×, 2× and 3×.</p>
        <p>Tiers come from where a value sits in a distribution: F under the 10th percentile, then E 10, D 30, C 50, B 70, A 85, S 95, SS 99. Population metrics compare you with published data; "guild ladder" metrics have no good population data and use the guild's own scale. XP comes only from turned-in quests (verified proof pays in full, your word about 60%) and finished tasks (+15). Missing data is shown as unranked, never as zero. Reference data version ${NORMS_VERSION}.</p>
        <ul>${Object.entries(METRICS).filter(([k]) => ATTRIBUTES.some((a) => a.metric === k)).map(([, m]) => html`<li><b>${m.label}</b> (${m.scale === "game" ? "guild ladder" : "population"}): ${m.source}</li>`)}</ul>
      </details>`);
  };
  draw();
  ui.onStore((c) => { if (["quest", "sync", "stats", "settings", "showcase"].includes(c.op)) draw(); });

  el.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-measure]");
    if (m) return measure(ctx, m.dataset.measure);
    if (e.target.closest("[data-sk=add]")) return editSkill(ctx);
    const sk = e.target.closest("[data-skill]");
    if (sk) return editSkill(ctx, ctx.store.skills().find((x) => x.id === sk.dataset.skill));
    if (e.target.closest("[data-tr=add]")) return editTrophy(ctx);
    const tf = e.target.closest("[data-tf]");
    if (tf) { filter = tf.dataset.tf; return draw(); }
    const tr = e.target.closest("[data-trophy]");
    if (tr) return openTrophy(ctx, ctx.derived().trophies.find((x) => x.id === tr.dataset.trophy));
    const row = e.target.closest("[data-attr]");
    if (row) { open = open === row.dataset.attr ? null : row.dataset.attr; draw(); }
  });
  el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-attr]")) { e.preventDefault(); e.target.click(); } });
  // Tooltips for radar vertices and curve markers: hover on desktop, tap on phones.
  el.addEventListener("pointerover", (e) => tipFor(el, e));
  el.addEventListener("pointerout", (e) => { if (e.target.closest?.("[data-tip]")) el.querySelector(".tip").hidden = true; });
}

function tipFor(el, e) {
  const t = e.target.closest?.("[data-tip]");
  const tip = el.querySelector(".radar-wrap .tip");
  if (!t || !tip || !t.closest(".radar-wrap")) return;
  const box = el.querySelector(".radar-wrap").getBoundingClientRect(), r = t.getBoundingClientRect();
  tip.textContent = t.dataset.tip;
  tip.style.left = `${r.left - box.left + r.width / 2}px`;
  tip.style.top = `${r.top - box.top - 8}px`;
  tip.hidden = false;
}

function attrRow(a, isOpen, s) {
  const p = a.percentile;
  return html`<div class="attr ${isOpen ? "open" : ""}" data-attr="${a.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
    <div class="attr-main">
      <span class="attr-name">${a.name}</span>
      <span class="attr-lv" title="${a.xp} XP here. ${a.level.into}/${a.level.need} to Lv ${a.level.level + 1}. ${LEVEL_NOTE}">Lv ${a.level.level}</span>
      <span class="tier t-${a.tier?.id || "none"}">${a.tier?.id || "?"}</span>
      <span class="attr-label">${a.label}</span>
      <span class="attr-val">${fmt(a.value)} <small>${a.value == null ? "unranked" : a.unit}</small></span>
    </div>
    <div class="pbar" aria-hidden="true"><i style="width:${p ?? 0}%"></i>${TIERS.slice(1).map((t) => html`<b style="left:${t.min}%"></b>`)}</div>
    ${isOpen ? html`<div class="attr-detail">
      ${s.relay ? html`<p class="relay-line">${s.relayName}: ${explainTier(a)}</p>` : ""}
      ${raw(curve(a))}
      <div class="row wrap small muted">
        ${p != null ? html`<span>${Math.round(p)}th percentile</span>` : ""}
        ${a.from ? html`<span>from ${a.from === "verified" ? "camera-verified reps" : a.from === "typed" ? "your entry" : a.from}</span>` : ""}
        ${a.xp ? html`<span>${a.xp} XP earned here · Lv ${a.level.level} (${a.level.into}/${a.level.need} to the next)</span>` : ""}
        ${a.scale === "game" ? html`<span>guild ladder</span>` : ""}
      </div>
      ${["pushups", "activeMinutes", "books"].includes(a.metric) ? html`<button class="btn small" data-measure="${a.metric}">Measure</button>` : ""}
    </div>` : ""}
  </div>`;
}

/** Radar of percentiles, 0–100, seven axes. Unranked axes sit at the centre with a hollow marker. */
function radar(attrs) {
  const W = 300, c = W / 2, R = 108, n = attrs.length;
  const pt = (i, r) => { const t = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(t), c + r * Math.sin(t)]; };
  const ring = (f) => attrs.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" class="grid"/>`).join("");
  const spokes = attrs.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="grid"/>`; }).join("");
  const shape = attrs.map((a, i) => pt(i, (R * (a.percentile ?? 0)) / 100).map((v) => v.toFixed(1)).join(",")).join(" ");
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const dots = attrs.map((a, i) => {
    const [x, y] = pt(i, (R * (a.percentile ?? 0)) / 100);
    const tip = a.percentile == null ? `${a.name}: unranked` : `${a.name} ${a.tier.id} · ${Math.round(a.percentile)}th pct · ${fmt(a.value)} ${a.unit}`;
    return `<g data-tip="${esc(tip)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" class="hit"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="${a.percentile == null ? "dot empty" : "dot"}"/></g>`;
  }).join("");
  const labels = attrs.map((a, i) => {
    const [x, y] = pt(i, R + 22);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="axis" text-anchor="middle" dominant-baseline="middle">${a.name}<tspan class="axis-tier" x="${x.toFixed(1)}" dy="13">${a.tier?.id || "–"}</tspan></text>`;
  }).join("");
  return `<svg viewBox="-10 -10 ${W + 20} ${W + 20}" class="radar" role="img" aria-label="Attribute percentiles: ${esc(attrs.map((a) => `${a.name} ${a.percentile == null ? "unranked" : Math.round(a.percentile)}`).join(", "))}">
    ${rings}${spokes}<polygon points="${shape}" class="shape"/>${dots}${labels}</svg>`;
}

/** The distribution as a density curve (from the CDF), tier bands underneath, and "you". */
function curve(a) {
  const W = 320, H = 96, pad = 6;
  const cdf = a.cdf;
  // Plot up to ~the 98th percentile (or you, if further): the far tail is empty and squashes the shape.
  const p99 = cdf.find(([, p]) => p >= 98)?.[0] ?? cdf[cdf.length - 1][0];
  const xMax = Math.max(p99, a.value ?? 0) || 1;
  const N = 80;
  const P = (x) => { for (let i = 1; i < cdf.length; i++) if (x <= cdf[i][0]) { const [x0, p0] = cdf[i - 1], [x1, p1] = cdf[i]; return x1 === x0 ? p1 : p0 + ((x - x0) / (x1 - x0)) * (p1 - p0); } return cdf[cdf.length - 1][1]; };
  const xs = Array.from({ length: N + 1 }, (_, i) => (i / N) * xMax);
  const steps = xs.map((x, i) => (i === 0 ? 0 : Math.max(0, P(x) - P(xs[i - 1]))));
  // The CDF is piecewise linear, so its slope is a staircase; a Gaussian kernel turns it into a readable curve.
  const k = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((j) => [j, Math.exp(-(j * j) / (2 * 3.2 * 3.2))]);
  const dens = steps.map((_, i) => { let s = 0, w = 0; for (const [j, g] of k) { const v = steps[i + j]; if (v !== undefined) { s += v * g; w += g; } } return s / w; });
  const yMax = Math.max(...dens) || 1;
  const X = (x) => pad + (x / xMax) * (W - 2 * pad), Y = (v) => H - 18 - (v / yMax) * (H - 30);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(dens[i]).toFixed(1)}`).join("");
  const area = `${line}L${X(xMax).toFixed(1)},${H - 18}L${pad},${H - 18}Z`;
  const you = a.value != null ? Math.min(a.value, xMax) : null;
  const marker = you != null ? `<line x1="${X(you)}" x2="${X(you)}" y1="8" y2="${H - 18}" class="you"/><text x="${X(you)}" y="7" class="you-label" text-anchor="${X(you) > W - 40 ? "end" : X(you) < 40 ? "start" : "middle"}">you · ${fmt(a.value)}</text>` : "";
  const ticks = [0, 0.5, 1].map((f) => `<text x="${X(f * xMax)}" y="${H - 4}" class="tick" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}">${fmt(Math.round(f * xMax * 10) / 10)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="curve" role="img" aria-label="${a.label}: distribution of ${a.unit}${you != null ? `, you at ${fmt(a.value)}` : ""}">
    <path d="${area}" class="area"/><path d="${line}" class="line"/><line x1="${pad}" x2="${W - pad}" y1="${H - 18}" y2="${H - 18}" class="base"/>${marker}${ticks}</svg>`;
}

async function measure(ctx, metric) {
  const m = METRICS[metric];
  const out = await sheet({
    title: m.label,
    body: html`<label class="field"><span>${m.unit}</span><input class="input" type="number" min="0" step="any" data-in autofocus></label>
      ${metric === "pushups" ? html`<p class="hint">Camera-verified sets from quests count automatically. A typed value moves your tier but doesn't pay XP.</p>` : html`<p class="hint">Moves your tier; XP only comes from quests and tasks.</p>`}`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close(d.querySelector("[data-in]").value)),
  });
  const v = Number(out);
  if (out == null || out === "" || !Number.isFinite(v) || v < 0) return;
  ctx.store.setStats({ measurements: [...ctx.store.measurements(), { metric, value: v, date: ctx.today() }] });
  toast("Measured. Tier updated.");
  ctx.syncNow();
}

