// What a turn-in unlocked, shown once: skills unlocked or levelled, and medals won.
// A new skill or an epic/legendary feat gets a moment of its own (a sheet);
// the rest are toasts. Compares ctx.derived() from before and after the turn-in.

import { sheet, html, toast } from "./dom.js";
import { newlyEarned } from "../core/achievements.js";
import { TROPHY_TIERS } from "../core/achievements.js";

export async function announce(before, after) {
  const had = new Map(before.skills.map((k) => [k.id, k]));
  const unlocked = after.skills.filter((k) => k.level > 0 && !(had.get(k.id)?.level > 0));
  const levelled = after.skills.filter((k) => had.get(k.id)?.level > 0 && k.level > had.get(k.id).level);
  const medals = newlyEarned(before.trophies, after.trophies);
  const big = medals.filter((a) => ["epic", "legendary", "mythic"].includes(a.tier));
  for (const k of levelled) toast(`✧ ${k.name} Lv ${had.get(k.id).level} → ${k.level}`, { timeout: 6000 });
  for (const a of medals.filter((x) => !big.includes(x))) toast(`🏆 ${TROPHY_TIERS[a.tier] || ""} achievement: ${a.title}`, { timeout: 7000 });
  if (!unlocked.length && !big.length) return;
  await sheet({
    title: big.length ? `${TROPHY_TIERS[big[0].tier]} feat` : "Skill unlocked",
    body: html`<div class="moment">
      ${big.map((a) => html`<div class="moment-row t-${a.tier}"><span class="moment-icon">${a.icon}</span><div><b>${a.title}</b><div class="muted small">${TROPHY_TIERS[a.tier]} · ${a.desc}</div></div></div>`)}
      ${unlocked.map((k) => html`<div class="moment-row"><span class="moment-icon">✧</span><div><b>${k.name} Lv ${k.level}</b><div class="muted small">Skill unlocked · ${k.rank}</div></div></div>`)}
    </div>`,
    foot: html`<button class="btn primary" data-close>Onward</button>`,
  });
}
