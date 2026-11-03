// Infodex cards in Research: the card face (same type colours, glyphs, rarity
// and stats as the Atlas's Infodex), and the card's own page — your dated
// entries about the thing, the questions from your Dex, where it's pinned and
// what it's connected to. The page is what you see when you zoom right into a
// card on a board; it's the same page on every board the card is pinned to.

import { html, raw } from "../ui/dom.js";
import { typeOf, rarityByKey, FINISHES } from "../core/infodex.js";
import { spriteSvg, swatchFor, readable } from "../core/atlas.js";

// Glyphs from the Infodex (24×24).
const G = {
  star: '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" fill="currentColor"/>',
  person: '<circle cx="12" cy="7" r="4.2" fill="currentColor"/><path d="M3.5 21.5c0-5 3.8-8 8.5-8s8.5 3 8.5 8z" fill="currentColor"/>',
  leaf: '<path d="M20.5 3.5C9 3.5 3.5 9.5 3.5 20.5c11 0 17-5.5 17-17z" fill="currentColor"/><path d="M3.5 20.5L14 10" stroke="rgba(0,0,0,.35)" stroke-width="1.8"/>',
  planet: '<circle cx="12" cy="12" r="6" fill="currentColor"/><ellipse cx="12" cy="12" rx="11" ry="3.6" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-20 12 12)"/>',
  mountain: '<path d="M1.5 20.5l7.5-14 4.5 8 3-4.5 6 10.5z" fill="currentColor"/>',
  atom: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="12" rx="10.5" ry="4"/><ellipse cx="12" cy="12" rx="10.5" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10.5" ry="4" transform="rotate(120 12 12)"/></g>',
  hourglass: '<path d="M5.5 2h13l-5.5 10 5.5 10h-13L11 12z" fill="currentColor"/>',
  note: '<path d="M9 18.5V5l11-2.5v13" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6.5" cy="18.5" r="3" fill="currentColor"/><circle cx="17.5" cy="15.5" r="3" fill="currentColor"/>',
  nut: '<path d="M12 1.8l9 5.1v10.2l-9 5.1-9-5.1V6.9z" fill="currentColor"/><circle cx="12" cy="12" r="3.6" fill="rgba(0,0,0,.4)"/>',
  bolt: '<path d="M13.5 1.5L3.5 14h7l-1.5 8.5 11-13.5h-7z" fill="currentColor"/>',
  eye: '<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" fill="currentColor"/><circle cx="12" cy="12" r="3.6" fill="rgba(0,0,0,.45)"/>',
  compass: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4l2.5 8L12 20l-2.5-8z" fill="currentColor"/>',
};

export const glyph = (key) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${G[key] || G.compass}</svg>`);

/** An Atlas entry's card: its sprite, type, name, domain and epistemic standing. */
export function atlasFace(card) {
  const pct = typeof card.credence === "number" ? `${Math.round(card.credence * 100)}%` : "";
  return html`<div class="ix-card atlas-card t-${card.kind}" style="--c1:${swatchFor(card.kind)}">
    <div class="ix-top"><span class="ix-type">${readable(card.kind)}</span><span class="ix-rarity">${[card.status ? readable(card.status) : "", pct].filter(Boolean).join(" · ")}</span></div>
    <div class="ix-art atlas-sprite">${raw(spriteSvg({ id: card.atlas, type: card.kind, sprite: card.sprite }))}</div>
    <div class="ix-name">${card.label}</div>
    ${card.address?.domain ? html`<div class="ix-sub atlas-domain">${readable(card.address.domain)}</div>` : ""}
    ${card.desc ? html`<div class="ix-lineage atlas-summary">${card.desc}</div>` : ""}
    <div class="ix-finish">Atlas${card.review === "unaudited" ? " · unaudited" : ""}</div>
  </div>`;
}

/** The card face. `card` may be missing (a pin whose card hasn't synced yet). */
export function cardFace(card, { label = "" } = {}) {
  if (!card) return html`<div class="ix-card ix-missing"><div class="ix-name">${label || "Card"}</div><div class="ix-sub">not on this device yet</div></div>`;
  if (card.source === "atlas") return atlasFace(card);
  const T = typeOf(card.kind);
  const R = rarityByKey(card.rarity);
  const st = card.stats || {};
  return html`<div class="ix-card r-${R.key} f-${card.finish || "base"}" style="--c1:${T.c1};--c2:${T.c2};--rc:${R.color}">
    <div class="ix-top"><span class="ix-type" title="${T.blurb}">${glyph(T.g)}${T.name}</span><span class="ix-rarity" title="Covered by ${card.sitelinks ?? "?"} Wikipedia editions">${R.gems} ${R.name}</span></div>
    <div class="ix-art">${card.img ? html`<img src="${card.img}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ix-glyph">${glyph(T.g)}</span>`}</div>
    <div class="ix-name">${card.label}</div>
    <div class="ix-sub">${card.subtitle || card.desc || ""}</div>
    ${card.lineage?.length ? html`<div class="ix-lineage">${card.lineage.join(" › ")}</div>` : ""}
    <div class="ix-stats"><span><b>${st.depth ?? "–"}</b>DEPTH</span><span><b>${st.bonds ?? "–"}</b>BONDS</span><span><b>${st.reach ?? card.sitelinks ?? "–"}</b>REACH</span></div>
    ${card.finish && card.finish !== "base" ? html`<div class="ix-finish">${FINISHES[card.finish]}${card.insight ? ` · ${card.insight} Insight` : ""}</div>` : ""}
  </div>`;
}

/** Your entries about a card: its body, as "### date" sections, newest first. */
export function entriesOf(body) {
  const text = String(body || "").trim();
  if (!text) return [];
  const parts = text.split(/^### +/m);
  const out = [];
  if (parts[0].trim()) out.push({ date: "", text: parts[0].trim() });
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    const date = (nl < 0 ? p : p.slice(0, nl)).trim();
    out.push({ date, text: (nl < 0 ? "" : p.slice(nl + 1)).trim() });
  }
  return out.reverse();
}

export function addEntry(body, date, text) {
  const t = String(text || "").trim();
  if (!t) return body || "";
  const prev = String(body || "").replace(/\s+$/, "");
  return `${prev ? `${prev}\n\n` : ""}### ${date}\n${t}`;
}

// Notes are Markdown; on a card page they're read as plain prose (no markup interpreted).
const plain = (t) => String(t).replace(/^#{1,6}\s*/, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === "string" ? x : x?.label || x?.text || JSON.stringify(x)));

/** An Atlas card's page: the entry (fetched when you zoom in), what it's linked to, and your entries. */
function atlasPage(card, { entry = null, names = {}, boards = [], strings = [], here = "", fileUrl = "" } = {}) {
  const d = entry?.data || {};
  const entries = entriesOf(card.body);
  const ep = d.epistemics || {};
  return html`<div class="ix-page">
    <div class="ix-page-head"><b>${card.label}</b> <span class="muted">— ${readable(card.kind)}${card.address?.domain ? `, ${readable(card.address.domain)}` : ""}</span></div>
    <div class="ix-statline">${[card.status && `status: ${readable(card.status)}`, card.standing && `standing: ${readable(card.standing)}`, typeof card.credence === "number" && `credence ${card.credence}`, ep.contestation && `contestation: ${readable(ep.contestation)}`, card.review === "unaudited" && "not yet audited"].filter(Boolean).join(" · ")}</div>
    <p>${d.description || d.proposition || d.statement || card.desc || ""}</p>
    ${entry ? "" : html`<p class="faint">Fetching the full entry…</p>`}
    ${entry?.notes ? html`<div class="ix-section">Atlas notes</div>${entry.notes.split(/\n{2,}/).slice(0, 8).map((para) => /^#{1,6}\s/.test(para) ? html`<p class="ix-subhead">${plain(para)}</p>` : html`<p>${plain(para)}</p>`)}` : ""}
    ${list(d.what_would_change_mind).length ? html`<div class="ix-section">What would change the Atlas's mind</div><ul class="ix-list">${list(d.what_would_change_mind).map((x) => html`<li>${x}</li>`)}</ul>` : ""}
    <div class="ix-section">Your entries <button type="button" class="btn small" data-act="card-entry" data-card="${card.id}">Add</button></div>
    ${entries.length ? entries.map((e) => html`<div class="ix-entry">${e.date ? html`<div class="ix-date">${e.date}</div>` : ""}<p>${e.text}</p></div>`)
      : html`<p class="faint">Nothing yet. What do you make of it, and why is it on this board?</p>`}
    ${card.edges?.length ? html`<div class="ix-section">Linked in the Atlas</div><ul class="ix-list">${card.edges.slice(0, 10).map(([t, rel, tier]) => html`<li>${readable(rel)} → ${names[t] || readable(t)}${tier ? html` <span class="faint">(${readable(tier)})</span>` : ""}</li>`)}</ul>` : ""}
    ${strings.length ? html`<div class="ix-section">Connected on this board</div><ul class="ix-list">${strings.map((s) => html`<li class="${s.state === "synthesised" ? "syn" : "red"}">${s.state === "synthesised" ? "━" : "〰"} ${s.other}${s.label ? html` <span class="faint">· ${s.label}</span>` : ""}</li>`)}</ul>` : ""}
    ${boards.filter((b) => b.id !== here).length ? html`<div class="ix-section">Also pinned on</div><ul class="ix-list">${boards.filter((b) => b.id !== here).map((b) => html`<li><a href="#/board/${b.id}">${b.title}</a></li>`)}</ul>` : ""}
    ${list(d.references).length ? html`<div class="ix-section">References</div><ul class="ix-list">${(d.references || []).map((r) => html`<li>${r?.url ? html`<a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.label || r.url}</a>` : r?.label || String(r)}</li>`)}</ul>` : ""}
    <div class="ix-links">${fileUrl ? html`<a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Open in the Atlas</a>` : ""}</div>
  </div>`;
}

/** The card's page: what you see zoomed right in. */
export function cardPage(card, { boards = [], strings = [], here = "", infodex = "", ...atlas } = {}) {
  if (!card) return "";
  if (card.source === "atlas") return atlasPage(card, { boards, strings, here, ...atlas });
  const entries = entriesOf(card.body);
  return html`<div class="ix-page">
    <div class="ix-page-head"><b>${card.label}</b>${card.desc ? html` — <span class="muted">${card.desc}</span>` : ""}</div>
    <div class="ix-statline">${rarityByKey(card.rarity).name} · depth ${card.stats?.depth ?? "–"} · ${card.stats?.bonds ?? "–"} bonds · in ${card.stats?.reach ?? card.sitelinks ?? "?"} Wikipedias${card.lineage?.length ? html`<br>${card.lineage.join(" › ")}` : ""}</div>
    ${card.flavor && card.flavor !== card.desc ? html`<p class="ix-flavor">${card.flavor}</p>` : ""}
    <div class="ix-section">Your entries <button type="button" class="btn small" data-act="card-entry" data-card="${card.id}">Add</button></div>
    ${entries.length ? entries.map((e) => html`<div class="ix-entry">${e.date ? html`<div class="ix-date">${e.date}</div>` : ""}<p>${e.text}</p></div>`)
      : html`<p class="faint">Nothing yet. What do you make of it, and why is it on this board?</p>`}
    ${card.questions?.length ? html`<div class="ix-section">Your questions <span class="faint">(from your Dex)</span></div><ul class="ix-list">${card.questions.map((q) => html`<li>${q}</li>`)}</ul>` : ""}
    ${strings.length ? html`<div class="ix-section">Connected here</div><ul class="ix-list">${strings.map((s) => html`<li class="${s.state === "synthesised" ? "syn" : "red"}">${s.state === "synthesised" ? "━" : "〰"} ${s.other}${s.label ? html` <span class="faint">· ${s.label}</span>` : ""}</li>`)}</ul>` : ""}
    ${boards.filter((b) => b.id !== here).length ? html`<div class="ix-section">Also pinned on</div><ul class="ix-list">${boards.filter((b) => b.id !== here).map((b) => html`<li><a href="#/board/${b.id}">${b.title}</a></li>`)}</ul>` : ""}
    <div class="ix-links">${(card.links || []).map((u) => html`<a href="${u}" target="_blank" rel="noopener noreferrer">${/wikidata/.test(u) ? "Wikidata" : /wikipedia/.test(u) ? "Wikipedia" : "Link"}</a>`)}${infodex ? html`<a href="${infodex.replace(/\/?(#.*)?$/, "/")}#/q/${card.qid}" target="_blank" rel="noopener noreferrer">Infodex</a>` : ""}</div>
  </div>`;
}
