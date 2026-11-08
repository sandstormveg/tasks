// A corkboard. Pin notes, sources, quotes and Infodex cards; draw red string
// between them (drag from a pin's pushpin, or Connect); frame regions and give
// them an address. Tap a string to synthesise it — say how the two connect —
// and the curator checks it against the Atlas's rules first. Zoom into a card
// and it becomes its page; zoom back out and it's a card again.
//
// The board is one DOM "world" moved by a single transform (pan and zoom), with
// the strings in an SVG layer inside it. Each pin shows more as it gets bigger
// on screen (its level of detail, 0–3), so the same board reads as a map from
// far away and as pages up close.

import { html, raw, on, sheet, toast, confirmSheet, promptSheet, debounce } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import {
  PIN_KINDS, TIERS, PIN_COLORS, makePin, makeString, synthesisPatch, unsynthesisePatch, boardParts, boardSummary,
  placeNear, tiltOf, boundsOf, framesOf, defaultSize, stringCurve,
} from "../../core/boards.js";
import { searchAtlas, refreshAtlasCard, atlasCardId, atlasRelations, spriteSvg, readable } from "../../core/atlas.js";
import { loadAtlasIndex, loadAtlasEntry, atlasFileUrl } from "../atlas.js";
import { checkSynthesis, curate } from "../../core/curator.js";
import { searchThings, fetchCard, cardFromDex, refreshCard, cardIdFor, searchCards } from "../../core/infodex.js";
import { searchSources, formatAuthors } from "../../core/sources.js";
import { renderMarkdown } from "../../core/markdown.js";
import { cardFace, cardPage, addEntry, wireCardArt } from "../cards.js";
import { saveImages, pickImages, imageOf, imagePinSize, imagesFrom } from "../images.js";
import { formatted } from "../../ui/textformat.js";
import { SIZES, COLOURS, PIN_FONTS, PIN_ALIGNS, cleanPinStyle, migratePinMarkup } from "../../core/textformat.js";

const MIN_Z = 0.08;
const MAX_Z = 6;
// How much a pin shows, from its size on screen: 0 a label, 1–2 the pin, 3 its page — reached at 480px
// (where an opened card lands on a laptop, fitted to the screen's height), or once it fills most of a phone's width.
const LOD = (screenW, vpW = 1200) => (screenW < 70 ? 0 : screenW < 300 ? 1 : screenW < Math.min(480, vpW * 0.8) ? 2 : 3);
const isClaude = (a) => a === "claude" || a === "claude-code" || String(a || "").startsWith("ai:");

export async function mount(el, ctx, route, ui) {
  const boardId = route.params[0];
  let board = ctx.store.get(boardId);
  if (!board) {
    ui.setTitle("Not found", { back: "#/boards" });
    el.innerHTML = String(html`<div class="empty"><h3>This board isn't here</h3><p><a href="#/boards">All boards</a></p></div>`);
    return;
  }
  document.body.classList.add("board-mode");
  ui.cleanup(() => document.body.classList.remove("board-mode"));
  ui.setTitle(board.title, { back: board.piece ? `#/piece/${board.piece}` : "#/boards" });
  ui.setActions(html`<button class="btn small" data-act="curator" id="curator-btn">${raw(icon("shield"))}<span>Curator</span></button>
    <button class="btn icon small ghost" data-act="board-menu" aria-label="Board settings">${raw(icon("more"))}</button>`);

  el.innerHTML = String(html`<div class="cork" id="cork">
    <div class="cork-viewport" id="cork-vp" tabindex="0" aria-label="Corkboard. Drag to move around, pinch or ctrl+scroll to zoom.">
      <div class="cork-world" id="cork-world">
        <svg class="cork-strings" id="cork-svg" aria-hidden="true"></svg>
        <div class="cork-pins" id="cork-pins"></div>
        <svg class="cork-strings cork-strings-top" id="cork-svg-top" aria-hidden="true"></svg>
        <svg class="cork-strings cork-labels" id="cork-labels" aria-hidden="true"></svg>
      </div>
    </div>
    <div class="cork-hint" id="cork-hint" hidden></div>
    <div class="cork-sel" id="cork-sel" hidden></div>
    <div class="cork-style" id="cork-style" role="toolbar" aria-label="Style the selected pin" hidden></div>
    <div class="cork-tools" role="toolbar" aria-label="Add to the board">
      <button class="btn small" data-tool="note">${raw(icon("edit"))}<span>Note</span></button>
      <button class="btn small" data-tool="card">${raw(icon("sparkle"))}<span>Card</span></button>
      <button class="btn small" data-tool="source">${raw(icon("bookmark"))}<span>Source</span></button>
      <button class="btn small" data-tool="image">${raw(icon("camera"))}<span>Picture</span></button>
      <button class="btn small" data-tool="frame">${raw(icon("map"))}<span>Frame</span></button>
      <button class="btn small cork-aa" data-tool="style" aria-label="Style the selected pin: text size, colour, font, alignment, card" aria-expanded="false" title="Style the selected pin">A<small>a</small></button>
      <span class="cork-tools-gap"></span>
      <button class="btn icon small" data-tool="zoom-out" aria-label="Zoom out">−</button>
      <button class="btn icon small" data-tool="fit" aria-label="Fit everything">${raw(icon("compass"))}</button>
      <button class="btn icon small" data-tool="zoom-in" aria-label="Zoom in">+</button>
    </div>
  </div>`);

  const vp = el.querySelector("#cork-vp");
  const world = el.querySelector("#cork-world");
  const svg = el.querySelector("#cork-svg");
  const pinsEl = el.querySelector("#cork-pins");
  const labelsEl = el.querySelector("#cork-labels"); // string labels sit above the pins so none is hidden
  // Red string runs over the notes, as on a real board. What you select is lifted above it —
  // a card or note, or everything inside a frame — so the string tucks behind what you're looking at.
  // (The bottom layer keeps the strings' tap targets; the top one only draws.)
  const svgTop = el.querySelector("#cork-svg-top");
  let lifted = new Set();
  const selEl = el.querySelector("#cork-sel");
  wireCardArt(vp);
  const hintEl = el.querySelector("#cork-hint");

  // ---- state
  let parts = { pins: [], strings: [] };
  let cardsById = {};
  let sourcesById = {};
  let cam = loadCam() || null;
  let selected = null;
  let connectFrom = null;
  let flash = new Set();
  const pinEls = new Map();

  function load() {
    board = ctx.store.get(boardId) || board;
    parts = boardParts(ctx.records(), boardId);
    cardsById = Object.fromEntries(ctx.cards().map((c) => [c.id, c]));
    sourcesById = Object.fromEntries(ctx.sources().map((s) => [s.id, s]));
  }
  const pinById = (id) => parts.pins.find((p) => p.id === id);
  const vpW = () => vp.clientWidth || 1200;
  // A pin only becomes its page (and fetches anything) while it's actually on screen.
  const onScreen = (p) => {
    const w = vp.clientWidth || 1200;
    const h = vp.clientHeight || 800;
    const x = cam.x + p.x * cam.z;
    const y = cam.y + p.y * cam.z;
    return x < w && y < h && x + p.w * cam.z > 0 && y + p.h * cam.z > 0;
  };
  const lodOf = (p) => {
    let l = LOD(p.w * cam.z, vpW());
    // A pin that fills most of the screen's height is open too, even if the screen is wide and short.
    if (l === 2 && p.h * cam.z >= (vp.clientHeight || 800) * 0.8) l = 3;
    return l === 3 && !onScreen(p) ? 2 : l;
  };

  // ---- camera
  function loadCam() { try { return JSON.parse(localStorage.getItem(`cork.cam.${boardId}`) || "null"); } catch { return null; } }
  const saveCam = debounce(() => { try { localStorage.setItem(`cork.cam.${boardId}`, JSON.stringify(cam)); } catch { /* per-device convenience only */ } }, 400);
  let raf = 0;
  function applyCam() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    world.style.setProperty("--z", cam.z);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLod(); });
    saveCam();
  }
  function fit(target = null, { pad = 60, animate = true, maxZ = 1.4 } = {}) {
    const r = vp.getBoundingClientRect();
    const b = target || boundsOf(parts.pins);
    const z = Math.max(MIN_Z, Math.min(maxZ, (r.width - pad * 2) / Math.max(b.w, 1), (r.height - pad * 2) / Math.max(b.h, 1)));
    const next = { z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
    if (animate) animateTo(next); else { cam = next; applyCam(); }
  }
  let anim = 0;
  function animateTo(next, ms = 380) {
    cancelAnimationFrame(anim);
    const from = { ...cam };
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      // Zoom moves in log space so it feels even; position follows.
      const z = Math.exp(Math.log(from.z) + (Math.log(next.z) - Math.log(from.z)) * e);
      cam = { z, x: from.x + (next.x - from.x) * e, y: from.y + (next.y - from.y) * e };
      applyCam();
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function zoomAt(px, py, factor) {
    cancelAnimationFrame(anim); // your input always wins over a camera flight in progress
    const z = Math.max(MIN_Z, Math.min(MAX_Z, cam.z * factor));
    const k = z / cam.z;
    cam = { z, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k };
    applyCam();
  }
  const toWorld = (cx, cy) => {
    const r = vp.getBoundingClientRect();
    return { x: (cx - r.left - cam.x) / cam.z, y: (cy - r.top - cam.y) / cam.z };
  };
  function viewCenter() {
    const r = vp.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ---- rendering
  function pinInner(p, lod) {
    const by = isClaude(p.author) ? html`<span class="pin-by" title="Pinned by Claude">Claude</span>` : "";
    if (p.kind === "frame") {
      const a = p.address || {};
      return html`<div class="frame-head" data-drag><span class="frame-title">${p.title || "Frame"}</span>${[a.domain, a.perspective, a.scale, a.time].filter(Boolean).map((x) => html`<span class="frame-addr">${x}</span>`)}</div>`;
    }
    if (p.kind === "card") {
      const c = cardsById[p.card];
      return html`${cardFace(c, { label: p.title })}${lod >= 3 ? html`<div class="pin-page">${cardPage(c, pageCtx(p))}</div>` : ""}`;
    }
    if (p.kind === "source" && imageOf(sourcesById[p.source])) {
      const s = sourcesById[p.source], m = imageOf(s);
      return html`${by}<img class="pin-img" draggable="false" data-media="${lod >= 2 ? m.path : m.thumb || m.path}" data-fallback="${m.path}" alt="${s.title || ""}">
        <div class="pin-caption">${s.title || p.title || "Picture"}${lod >= 2 ? html` · <a href="#/source/${p.source}" class="pin-open">Open</a>` : ""}</div>`;
    }
    if (p.kind === "source") {
      const s = sourcesById[p.source];
      return html`${by}<div class="pin-kicker">${s?.site || "Source"}${s?.status ? html` · ${s.status === "inbox" ? "deposit" : s.status}` : ""}</div>
        <div class="pin-title">${s?.title || p.title || p.url || "Source"}</div>
        ${s?.authors?.length ? html`<div class="pin-meta">${formatAuthors(s.authors)}${s.year ? `, ${s.year}` : ""}</div>` : ""}
        ${lod >= 1 && (s?.why || p.body) ? html`<div class="pin-text">${formatted(s?.why || p.body)}</div>` : ""}
        ${lod >= 2 ? html`<div class="pin-foot"><a href="#/source/${p.source}" class="pin-open">Open in Research</a>${s?.url ? html` · <a href="${s.url}" target="_blank" rel="noopener noreferrer">Link</a>` : ""}</div>` : ""}`;
    }
    if (p.kind === "quote") return html`${by}<blockquote class="pin-quote">${formatted(p.body)}</blockquote>${p.title ? html`<div class="pin-meta">— ${p.title}</div>` : ""}`;
    if (p.kind === "link") return html`${by}<div class="pin-title">${p.title || p.url}</div>${p.url ? html`<a class="pin-meta" href="${p.url}" target="_blank" rel="noopener noreferrer">${p.url.replace(/^https?:\/\//, "").slice(0, 60)}</a>` : ""}${lod >= 1 && p.body ? html`<div class="pin-text">${formatted(p.body)}</div>` : ""}`;
    return html`${by}${p.title ? html`<div class="pin-title">${p.title}</div>` : ""}${p.body && lod >= 1 ? html`<div class="pin-text${p.kind === "note" ? " pin-md" : ""}">${p.kind === "note" ? raw(renderMarkdown(p.body, { tags: false, concepts: false, headingOffset: 3 })) : formatted(p.body)}</div>` : ""}${!p.title && !p.body ? html`<div class="pin-text faint">Empty note</div>` : ""}`;
  }

  function pageCtx(p) {
    const c = cardsById[p.card];
    const onBoards = ctx.store.all("pin").filter((x) => x.kind === "card" && x.card === p.card).map((x) => ctx.store.get(x.board)).filter(Boolean);
    const strings = parts.strings.filter((s) => s.from === p.id || s.to === p.id).map((s) => {
      const o = pinById(s.from === p.id ? s.to : s.from);
      return { state: s.state, label: s.label, other: o ? o.title || cardsById[o.card]?.label || sourcesById[o.source]?.title || o.kind : "?" };
    });
    const base = { boards: [...new Map(onBoards.map((b) => [b.id, b])).values()], strings, here: boardId, infodex: ctx.settings().infodexUrl, card: c };
    if (c?.source !== "atlas") return base;
    if (!atlasEntries.has(c.path) && c.path) {
      atlasEntries.set(c.path, null); // fetching
      loadAtlasEntry(ctx, c.path).then((entry) => { atlasEntries.set(c.path, entry || { data: {}, notes: "" }); const n = pinEls.get(p.id); if (n?._lod === 3) renderPin(p); });
    }
    const names = Object.fromEntries((ctx.store.getKv("atlas-index", null)?.index?.entries || []).map((e) => [e.id, e.name]));
    return { ...base, entry: atlasEntries.get(c.path) || null, names, fileUrl: c.path ? atlasFileUrl(ctx, c.path) : "" };
  }
  const atlasEntries = new Map();

  // Frames, notes and pictures resize from their corner (a card keeps its card shape; a picture keeps its own).
  const resizable = (p) => p.kind === "frame" || p.kind === "note" || p.kind === "quote" || p.kind === "link" || (p.kind === "source" && !!imageOf(sourcesById[p.source]));
  const MIN = { frame: [220, 140], note: [120, 80] };

  function renderPin(p) {
    let node = pinEls.get(p.id);
    if (!node) {
      node = document.createElement("div");
      node.dataset.id = p.id;
      pinEls.set(p.id, node);
      pinsEl.appendChild(node);
    }
    const lod = lodOf(p);
    node.className = `pin pin-${p.kind}${p.color ? ` c-${p.color}` : ""}${styleClasses(p)}${selected === p.id ? " sel" : ""}${lifted.has(p.id) ? " lift" : ""}${flash.has(p.id) ? " flash" : ""}${isClaude(p.author) ? " by-claude" : ""}`;
    node.dataset.lod = lod;
    node.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;--tilt:${p.kind === "frame" ? 0 : tiltOf(p.id)}deg`;
    if (lod === 3) node.style.setProperty("--u", (1 / cam.z).toFixed(4));
    node.innerHTML = String(html`${p.kind !== "frame" ? html`<span class="pushpin" data-pushpin title="Drag to another pin to connect"></span>` : ""}<div class="pin-body">${pinInner(p, lod)}</div>${resizable(p) ? html`<span class="pin-grip" data-grip title="Drag to resize" aria-hidden="true"></span>` : ""}`);
    node._lod = lod;
    if (node.querySelector("img[data-media]")) ctx.media.hydrate(node);
  }

  // While you drag a pin its strings belly away from the motion, then settle back with a little spring.
  let sway = { ids: new Set(), vx: 0, vy: 0 };
  let settle = 0;
  function stringPath(s) {
    const a = pinById(s.from);
    const b = pinById(s.to);
    if (!a || !b) return null;
    const moving = sway.ids.has(s.from) || sway.ids.has(s.to);
    const c = stringCurve({ x: a.x + a.w / 2, y: a.y + 10 }, { x: b.x + b.w / 2, y: b.y + 10 }, { state: s.state, vx: moving ? sway.vx : 0, vy: moving ? sway.vy : 0 });
    return { d: c.d, mx: c.mid.x, my: c.mid.y };
  }
  function settleStrings(v0) {
    cancelAnimationFrame(settle);
    const t0 = performance.now();
    const step = (t) => {
      const k = t - t0;
      const f = Math.exp(-k / 160) * Math.cos(k / 85);
      sway = { ...sway, vx: v0.vx * f, vy: v0.vy * f };
      renderStrings();
      if (k < 700) settle = requestAnimationFrame(step);
      else { sway = { ids: new Set(), vx: 0, vy: 0 }; renderStrings(); }
    };
    settle = requestAnimationFrame(step);
  }

  function renderStrings(temp = null) {
    const all = [...parts.pins];
    const b = boundsOf(all.length ? all : [{ x: 0, y: 0, w: 1, h: 1 }]);
    const pad = 600;
    const vb = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) };
    for (const layer of [svg, svgTop, labelsEl]) {
      layer.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      layer.style.cssText = `left:${vb.x}px;top:${vb.y}px;width:${vb.w}px;height:${vb.h}px`;
    }
    const labels = [];
    const { bridges } = curateNow();
    const out = [];
    const top = [];
    for (const s of parts.strings) {
      const p = stringPath(s);
      if (!p) continue;
      const cls = `str ${s.state === "synthesised" ? "syn" : "red"}${bridges.includes(s.id) ? " bridge" : ""}${flash.has(s.id) ? " flash" : ""}${isClaude(s.author) ? " by-claude" : ""}`;
      out.push(html`<g class="${cls}" data-string="${s.id}"><path class="str-hit" d="${p.d}"/></g>`);
      top.push(html`<g class="${cls}"><path class="str-shadow" d="${p.d}"/><path class="str-line" d="${p.d}"/></g>`);
      if (s.label) labels.push(html`<g class="str"><text x="${p.mx}" y="${p.my}" text-anchor="middle">${s.label}</text></g>`);
    }
    if (temp) top.push(html`<path class="str-temp" d="M${temp.ax},${temp.ay} L${temp.bx},${temp.by}"/>`);
    svg.innerHTML = String(html`${out}`);
    svgTop.innerHTML = String(html`${top}`);
    labelsEl.innerHTML = String(html`${labels}`);
  }

  let curated = null;
  function curateNow() { return (curated ||= curate(parts, { cards: cardsById, sources: sourcesById })); }

  function renderAll() {
    curated = null;
    const live = new Set(parts.pins.map((p) => p.id));
    for (const [id, node] of pinEls) if (!live.has(id)) { node.remove(); pinEls.delete(id); }
    lifted = liftFor(selected);
    // Frames first so they sit underneath.
    const order = [...parts.pins].sort((a, b) => (a.kind === "frame") === (b.kind === "frame") ? 0 : a.kind === "frame" ? -1 : 1);
    for (const p of order) { renderPin(p); pinsEl.appendChild(pinEls.get(p.id)); }
    renderStrings();
    renderCuratorBadge();
    renderSelection();
    if (!parts.pins.length) showHint("Empty board. Add a note, an Infodex card or a source below — then drag from one pin's pushpin to another to tie red string.");
    else hideHint();
  }

  function updateLod() {
    for (const p of parts.pins) {
      const node = pinEls.get(p.id);
      if (!node) continue;
      const lod = lodOf(p);
      if (lod !== node._lod) renderPin(p);
      else if (lod === 3) node.style.setProperty("--u", (1 / cam.z).toFixed(4));
    }
    positionSelection();
  }

  function renderCuratorBadge() {
    const btn = document.querySelector("#curator-btn");
    if (!btn) return;
    const sum = boardSummary(parts);
    const { findings } = curateNow();
    const checks = findings.filter((f) => f.level !== "info").length;
    btn.querySelector("span").textContent = `${sum.red} red${checks ? ` · ${checks} to check` : ""}`;
    btn.classList.toggle("warn", checks > 0);
  }

  let hintTimer = 0;
  function showHint(text, { timeout = 0 } = {}) {
    clearTimeout(hintTimer);
    hintEl.textContent = text;
    hintEl.hidden = false;
    if (timeout) hintTimer = setTimeout(hideHint, timeout);
  }
  function hideHint() { clearTimeout(hintTimer); hintEl.hidden = true; }

  // ---- selection bar
  function renderSelection() {
    const p = selected && pinById(selected);
    if (!p) { selEl.hidden = true; return; }
    selEl.hidden = false;
    selEl.innerHTML = String(html`
      ${p.kind === "card" ? html`<button class="btn small" data-sel="open">${raw(icon("external"))}Open</button>` : html`<button class="btn small" data-sel="zoom">${raw(icon("search"))}Zoom</button>`}
      ${p.kind !== "card" && p.kind !== "source" ? html`<button class="btn small" data-sel="edit">${raw(icon("edit"))}Edit</button>` : ""}
      ${p.kind !== "frame" ? html`<button class="btn small ${connectFrom ? "primary" : ""}" data-sel="connect">〰 Connect</button>` : ""}
      <button class="btn icon small danger" data-sel="delete" aria-label="Remove from board">${raw(icon("trash"))}</button>`);
    positionSelection();
  }
  function positionSelection() {
    const p = selected && pinById(selected);
    if (!p || selEl.hidden) return;
    const r = vp.getBoundingClientRect();
    const x = cam.x + (p.x + p.w / 2) * cam.z;
    const y = cam.y + p.y * cam.z;
    selEl.style.left = `${Math.max(8, Math.min(r.width - selEl.offsetWidth - 8, x - selEl.offsetWidth / 2))}px`;
    selEl.style.top = `${Math.max(8, y - selEl.offsetHeight - 14)}px`;
  }
  function liftFor(id) {
    const p = id && pinById(id);
    if (!p) return new Set();
    if (p.kind !== "frame") return new Set([p.id]);
    return new Set(parts.pins.filter((q) => q.id !== p.id && framesOf(q, parts.pins).some((f) => f.id === p.id)).map((q) => q.id));
  }
  function applyLift(ids) {
    lifted = ids;
    for (const [pid, node] of pinEls) node.classList.toggle("lift", lifted.has(pid));
  }
  function select(id) {
    selected = id;
    for (const [pid, node] of pinEls) node.classList.toggle("sel", pid === id);
    applyLift(liftFor(id));
    renderSelection();
    renderStyle();
    if (pinById(id)?.kind === "frame" && !connectFrom) showHint("Drag inside the frame to move it with everything in it — or drag its corner to resize.", { timeout: 3500 });
  }

  // ---- saving
  const now = () => ctx.now();
  async function savePin(p, patch) {
    const cur = ctx.store.get(p.id) || p;
    await ctx.store.put({ ...cur, ...patch, updated: now() });
  }
  async function addPin(fields, { near = null } = {}) {
    const size = defaultSize(fields.kind);
    const anchor = near ? pinById(near) : null;
    const c = viewCenter();
    const spot = anchor ? placeNear(parts.pins, { anchor, ...size }) : placeNear(parts.pins.filter((p) => Math.abs(p.x - c.x) < 1200 && Math.abs(p.y - c.y) < 900), { anchor: { x: c.x - size.w / 2, y: c.y - size.h / 2, ...size }, ...size });
    const pin = makePin({ board: boardId, ...spot, ...fields }, { now: now() });
    await ctx.store.put(pin);
    select(pin.id);
    return pin;
  }
  async function connect(from, to) {
    if (!from || !to || from === to) return;
    const dup = parts.strings.find((s) => (s.from === from && s.to === to) || (s.from === to && s.to === from));
    if (dup) { toast("They're already connected"); openString(dup.id); return; }
    await ctx.store.put(makeString({ board: boardId, from, to }, { now: now() }));
    toast("Red string tied — tap it when you can say how they connect", { timeout: 3200 });
  }

  // ---- pointer handling: pan, pinch, drag pins, draw string, tap
  const pointers = new Map();
  let gesture = null;
  let lastTap = { id: null, t: 0 };

  vp.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest("a, input, textarea, select, button:not([data-pushpin])")) return;
    if (e.target.closest(".pin[data-lod='3'] .pin-page")) return; // a card's page scrolls like a page
    vp.setPointerCapture?.(e.pointerId);
    cancelAnimationFrame(anim);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      gesture = { type: "pinch", d: Math.hypot(p2.x - p1.x, p2.y - p1.y), z: cam.z, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, cam: { ...cam } };
      return;
    }
    const pinNode = e.target.closest(".pin");
    const strNode = e.target.closest("[data-string]");
    if (e.target.closest("[data-grip]") && pinNode) {
      const p = pinById(pinNode.dataset.id);
      select(p.id);
      gesture = { type: "resize", id: p.id, x0: e.clientX, y0: e.clientY, w: p.w, h: p.h, ratio: p.kind === "source" ? (p.h - 34) / p.w : 0 };
      return;
    }
    if (e.target.closest("[data-pushpin]") && pinNode) {
      gesture = { type: "string", from: pinNode.dataset.id, x0: e.clientX, y0: e.clientY };
      return;
    }
    if (pinNode) {
      const p = pinById(pinNode.dataset.id);
      const isFrame = p.kind === "frame";
      // A frame moves by its title bar, or from anywhere inside once it's selected (so an unselected
      // frame still lets you pan the board by dragging inside it); it carries what's in it.
      if (isFrame && !e.target.closest("[data-drag]") && selected !== p.id) { gesture = { type: "pan", x0: e.clientX, y0: e.clientY, cam: { ...cam }, moved: false, frameTap: p.id }; return; }
      const carry = isFrame ? parts.pins.filter((q) => q.id !== p.id && framesOf(q, parts.pins).some((f) => f.id === p.id)).map((q) => ({ q, x: q.x, y: q.y })) : [];
      gesture = { type: "pin", id: p.id, x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, moved: false, carry };
      if (!isFrame) applyLift(new Set([...liftFor(selected), p.id]));
      return;
    }
    if (strNode) { gesture = { type: "tap-string", id: strNode.dataset.string, x0: e.clientX, y0: e.clientY }; return; }
    gesture = { type: "pan", x0: e.clientX, y0: e.clientY, cam: { ...cam }, moved: false };
  });

  vp.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.type === "pinch" && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const r = vp.getBoundingClientRect();
      const z = Math.max(MIN_Z, Math.min(MAX_Z, gesture.z * (d / gesture.d)));
      const k = z / gesture.cam.z;
      const ox = gesture.cx - r.left;
      const oy = gesture.cy - r.top;
      cam = { z, x: ox - (ox - gesture.cam.x) * k + (cx - gesture.cx), y: oy - (oy - gesture.cam.y) * k + (cy - gesture.cy) };
      applyCam();
      return;
    }
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (gesture.type === "pan") {
      if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
      cam = { ...gesture.cam, x: gesture.cam.x + dx, y: gesture.cam.y + dy };
      applyCam();
    } else if (gesture.type === "pin") {
      if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      gesture.moved = true;
      const p = pinById(gesture.id);
      const nx = Math.round(gesture.px + dx / cam.z);
      const ny = Math.round(gesture.py + dy / cam.z);
      // Velocity in board units per ~frame, smoothed, for the strings' sway.
      const now = performance.now();
      const dt = Math.max(8, now - (gesture.t || now - 16));
      const k = 16 / dt;
      gesture.vx = 0.6 * (gesture.vx || 0) + 0.4 * (nx - p.x) * k;
      gesture.vy = 0.6 * (gesture.vy || 0) + 0.4 * (ny - p.y) * k;
      gesture.t = now;
      sway = { ids: new Set([p.id, ...gesture.carry.map((c) => c.q.id)]), vx: gesture.vx * 6, vy: gesture.vy * 6 };
      p.x = nx;
      p.y = ny;
      for (const c of gesture.carry) { c.q.x = Math.round(c.x + dx / cam.z); c.q.y = Math.round(c.y + dy / cam.z); }
      for (const q of [p, ...gesture.carry.map((c) => c.q)]) { const n = pinEls.get(q.id); n.style.left = `${q.x}px`; n.style.top = `${q.y}px`; }
      renderStrings();
      positionSelection();
    } else if (gesture.type === "resize") {
      const p = pinById(gesture.id);
      const [mw, mh] = MIN[p.kind] || MIN.note;
      p.w = Math.max(mw, Math.round(gesture.w + dx / cam.z));
      p.h = gesture.ratio ? Math.round(p.w * gesture.ratio) + 34 : Math.max(mh, Math.round(gesture.h + dy / cam.z));
      const n = pinEls.get(p.id);
      n.style.width = `${p.w}px`;
      n.style.height = `${p.h}px`;
      gesture.moved = true;
      renderStrings();
      positionSelection();
    } else if (gesture.type === "string") {
      const a = pinById(gesture.from);
      const w = toWorld(e.clientX, e.clientY);
      renderStrings({ ax: a.x + a.w / 2, ay: a.y + 10, bx: w.x, by: w.y });
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".pin:not(.pin-frame)");
      for (const n of pinEls.values()) n.classList.toggle("target", n === over && over.dataset.id !== gesture.from);
    }
  });

  async function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g?.type === "pinch") { if (pointers.size < 2) gesture = null; return; }
    gesture = null;
    if (!g) return;
    if (g.type === "pan") {
      if (!g.moved) {
        if (g.frameTap) { if (connectFrom) return; select(g.frameTap); }
        else { select(null); connectFrom = null; hideHint(); }
      }
      return;
    }
    if (g.type === "resize") {
      if (g.moved) { const p = pinById(g.id); await savePin(p, { w: p.w, h: p.h }); curated = null; renderStrings(); }
      return;
    }
    if (g.type === "tap-string") { if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 8) openString(g.id); return; }
    if (g.type === "string") {
      for (const n of pinEls.values()) n.classList.remove("target");
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".pin:not(.pin-frame)");
      renderStrings();
      if (over && over.dataset.id !== g.from) await connect(g.from, over.dataset.id);
      else if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 8) { select(g.from); startConnect(); }
      return;
    }
    if (g.type === "pin") {
      if (g.moved) {
        settleStrings({ vx: sway.vx, vy: sway.vy });
        applyLift(liftFor(selected));
        const p = pinById(g.id);
        await savePin(p, { x: p.x, y: p.y });
        for (const c of g.carry) await savePin(c.q, { x: c.q.x, y: c.q.y });
        return;
      }
      if (connectFrom && connectFrom !== g.id) { const from = connectFrom; connectFrom = null; hideHint(); await connect(from, g.id); select(g.id); return; }
      const t = performance.now();
      // Double-tap: a card or note flies open; a frame's title badge opens its name and address to edit.
      if (lastTap.id === g.id && t - lastTap.t < 320) { lastTap = { id: null, t: 0 }; if (pinById(g.id)?.kind === "frame") editPin(g.id); else openPin(g.id); return; }
      lastTap = { id: g.id, t };
      select(g.id);
    }
  }
  vp.addEventListener("pointerup", endPointer);
  vp.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); gesture = null; renderStrings(); });

  vp.addEventListener("wheel", (e) => {
    if (e.target.closest(".pin[data-lod='3'] .pin-page") && !e.ctrlKey && !e.metaKey) return; // scroll a card's page
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    // Trackpad pinch and ctrl/cmd+wheel zoom; so does a mouse wheel (whole notches, no sideways motion). Two-finger scroll pans.
    const mouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouseWheel) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    else { cancelAnimationFrame(anim); cam = { ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY }; applyCam(); }
  }, { passive: false });

  vp.addEventListener("keydown", (e) => {
    if (e.target !== vp) return;
    const step = 60;
    const r = vp.getBoundingClientRect();
    if (e.key === "+" || e.key === "=") zoomAt(r.width / 2, r.height / 2, 1.25);
    else if (e.key === "-") zoomAt(r.width / 2, r.height / 2, 0.8);
    else if (e.key === "ArrowLeft") { cam.x += step; applyCam(); }
    else if (e.key === "ArrowRight") { cam.x -= step; applyCam(); }
    else if (e.key === "ArrowUp") { cam.y += step; applyCam(); }
    else if (e.key === "ArrowDown") { cam.y -= step; applyCam(); }
    else if (e.key === "Escape") { select(null); connectFrom = null; hideHint(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && selected) removePin(selected);
    else return;
    e.preventDefault();
  });

  // ---- actions
  function startConnect() {
    connectFrom = selected;
    showHint("Now tap the pin to tie red string to. (Esc or tap the board to cancel.)");
    renderSelection();
  }

  function openPin(id) {
    const p = pinById(id);
    if (!p) return;
    // Zoom so the pin fills the view: a card becomes its page.
    const r = vp.getBoundingClientRect();
    const room = { w: r.width - 24, h: r.height - 90 }; // leave the toolbar clear
    const target = p.kind === "card" ? Math.min(Math.min(room.w, 640) / p.w, room.h / p.h) : Math.min(2.2, (r.width * 0.7) / p.w, room.h / p.h);
    const z = Math.max(MIN_Z, Math.min(MAX_Z, target));
    animateTo({ z, x: r.width / 2 - (p.x + p.w / 2) * z, y: Math.max(12, (room.h - p.h * z) / 2 + 12) - p.y * z });
  }

  async function removePin(id) {
    const p = pinById(id);
    if (!p) return;
    const strings = parts.strings.filter((s) => s.from === id || s.to === id);
    const copies = [p, ...strings].map((r) => structuredClone({ ...r, _sync: undefined, _rev: undefined }));
    for (const s of strings) await ctx.store.remove(s.id, { reason: "pin removed" });
    await ctx.store.remove(id, { reason: "removed from board" });
    select(null);
    toast(p.kind === "card" ? "Card taken off this board (its page is kept)" : "Removed", { action: "Undo", timeout: 8000, onAction: async () => { for (const c of copies) await ctx.store.put(c); } });
  }

  async function editPin(id) {
    const p = pinById(id);
    if (!p) return;
    if (p.kind === "frame") return editFrame(p);
    const res = await sheet({
      title: p.kind === "quote" ? "Quote" : p.kind === "link" ? "Link" : "Note",
      body: html`<label class="field"><span>${p.kind === "quote" ? "Who said it / where" : "Title"}</span><input class="input" data-t value="${p.title || ""}" autocomplete="off"></label>
        ${p.kind === "link" ? html`<label class="field"><span>Link</span><input class="input" data-u value="${p.url || ""}" inputmode="url" autocomplete="off"></label>` : ""}
        <label class="field"><span>${p.kind === "quote" ? "The words" : "Text"}</span><textarea class="textarea" data-b rows="6">${p.body || ""}</textarea></label>
        ${isClaude(p.author) ? html`<p class="small faint">Pinned by Claude. Editing it makes it yours.</p>` : ""}`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => { d.querySelector("[data-ok]").addEventListener("click", () => close({ title: d.querySelector("[data-t]").value, body: d.querySelector("[data-b]").value, url: d.querySelector("[data-u]")?.value })); },
    });
    if (!res) return;
    await savePin(p, { title: res.title.trim() || undefined, body: res.body.replace(/\s+$/, ""), ...(p.kind === "link" ? { url: res.url.trim() || undefined } : {}), author: "self" });
  }

  async function editFrame(p) {
    const a = p.address || {};
    const res = await sheet({
      title: "Frame",
      body: html`<p class="small muted" style="margin-top:0">A frame is a region: what you place inside it is part of it. Give it a domain and it becomes a boundary — the curator then asks connections that cross it to say what kind of connection they are, where they hold and where they break. Without one it's just a grouping.</p>
        <label class="field"><span>Name</span><input class="input" data-t value="${p.title || ""}" autocomplete="off"></label>
        <div class="row wrap"><label class="field grow"><span>Domain</span><input class="input" data-a="domain" value="${a.domain || ""}" placeholder="e.g. psychology" autocomplete="off"></label>
        <label class="field grow"><span>Perspective</span><input class="input" data-a="perspective" value="${a.perspective || ""}" placeholder="e.g. clinical" autocomplete="off"></label></div>
        <div class="row wrap"><label class="field grow"><span>Scale</span><input class="input" data-a="scale" value="${a.scale || ""}" placeholder="e.g. individual" autocomplete="off"></label>
        <label class="field grow"><span>Time</span><input class="input" data-a="time" value="${a.time || ""}" placeholder="e.g. 2020s" autocomplete="off"></label></div>`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ title: d.querySelector("[data-t]").value, address: Object.fromEntries([...d.querySelectorAll("[data-a]")].map((i) => [i.dataset.a, i.value.trim()]).filter(([, v]) => v)) })),
    });
    if (!res) return;
    await savePin(p, { title: res.title.trim() || undefined, address: Object.keys(res.address).length ? res.address : undefined });
  }

  async function openString(id) {
    const s = parts.strings.find((x) => x.id === id);
    if (!s) return;
    const a = pinById(s.from);
    const b = pinById(s.to);
    const nm = (p) => p?.title || cardsById[p?.card]?.label || sourcesById[p?.source]?.title || PIN_KINDS[p?.kind] || "?";
    const syn = s.state === "synthesised";
    const res = await sheet({
      title: syn ? "Synthesised" : "Red string",
      body: html`<p class="str-ends"><b>${nm(a)}</b> 〰 <b>${nm(b)}</b></p>
        <p class="small muted" style="margin-top:0">${syn ? `Synthesised ${String(s.synthesised || "").slice(0, 10)}.` : "Not synthesised yet: you've noticed these connect, but not worked out how."}${isClaude(s.author) ? " Proposed by Claude." : ""}</p>
        ${(() => {
          const rel = atlasRelations(cardsById[a?.card], cardsById[b?.card]);
          return rel.length ? html`<p class="small atlas-says">The Atlas already links these: ${rel.map((r) => `${readable(r.relation)}${r.tier ? ` (${readable(r.tier)})` : ""}`).join("; ")}.</p>`
            : cardsById[a?.card]?.source === "atlas" && cardsById[b?.card]?.source === "atlas" ? html`<p class="small atlas-says">Uncharted: the Atlas doesn't link these yet.</p>` : "";
        })()}
        <label class="field"><span>Label <span class="faint">(optional, shown on the string)</span></span><input class="input" data-f="label" value="${s.label || ""}" autocomplete="off"></label>
        <label class="field"><span>How do they connect?</span><textarea class="textarea" data-f="text" rows="4" placeholder="In your words — this is the synthesis">${s.body || ""}</textarea></label>
        <label class="field"><span>Kind of connection <span class="faint">(the Atlas's tiers)</span></span><select class="select" data-f="tier"><option value="">—</option>${Object.entries(TIERS).map(([k, t]) => html`<option value="${k}" ${s.tier === k ? "selected" : ""}>${t.name} — ${t.hint}</option>`)}</select></label>
        <label class="field"><span>Holds in</span><input class="input" data-f="holds_in" value="${s.holds_in || ""}" placeholder="Where this connection works" autocomplete="off"></label>
        <label class="field"><span>Breaks at</span><input class="input" data-f="breaks_at" value="${s.breaks_at || ""}" placeholder="Where it stops working" autocomplete="off"></label>
        <div class="curator-says" data-problems></div>`,
      foot: html`<button class="btn danger ghost" data-del>${raw(icon("trash"))}</button>${syn ? html`<button class="btn" data-red>Back to red</button>` : ""}<span class="grow"></span><button class="btn" data-close>Close</button><button class="btn primary" data-ok>${syn ? "Save" : "Synthesise"}</button>`,
      setup: (d, close) => {
        const val = (k) => d.querySelector(`[data-f="${k}"]`).value;
        d.querySelector("[data-del]").addEventListener("click", () => close({ op: "delete" }));
        d.querySelector("[data-red]")?.addEventListener("click", () => close({ op: "red" }));
        d.querySelector("[data-ok]").addEventListener("click", () => {
          const patch = synthesisPatch({ text: val("text"), tier: val("tier"), holds_in: val("holds_in"), breaks_at: val("breaks_at"), label: val("label") }, { now: now() });
          const problems = checkSynthesis(parts, s, patch, { cards: cardsById, sources: sourcesById });
          const hard = problems.filter((p) => !p.soft);
          const box = d.querySelector("[data-problems]");
          box.innerHTML = String(html`${problems.map((p) => html`<p class="${p.soft ? "soft" : ""}">${raw(icon(p.soft ? "info" : "shield"))}${p.text}</p>`)}`);
          for (const f of ["text", "tier", "holds_in", "breaks_at"]) d.querySelector(`[data-f="${f}"]`).classList.toggle("invalid", hard.some((p) => p.field === f));
          if (hard.length) return;
          if (problems.length && !box.dataset.warned) { box.dataset.warned = "1"; d.querySelector("[data-ok]").textContent = "Synthesise anyway"; return; }
          close({ op: "synth", patch });
        });
        // Just relabelling a red string doesn't need a synthesis.
        d.querySelector('[data-f="label"]').addEventListener("change", async (e) => { if (s.state === "red") await ctx.store.put({ ...ctx.store.get(s.id), label: e.target.value.trim() || undefined, updated: now() }); });
      },
    });
    if (!res) return;
    if (res.op === "delete") {
      const copy = structuredClone({ ...s, _sync: undefined, _rev: undefined });
      await ctx.store.remove(s.id, { reason: "string cut" });
      toast("String cut", { action: "Undo", onAction: () => ctx.store.put(copy) });
    } else if (res.op === "red") {
      await ctx.store.put({ ...ctx.store.get(s.id), ...unsynthesisePatch({ now: now() }) });
    } else if (res.op === "synth") {
      await ctx.store.put({ ...ctx.store.get(s.id), ...res.patch });
      toast("Synthesised");
    }
  }

  async function addNote() {
    const res = await promptSheet({ title: "New note", label: "Note", multiline: true, placeholder: "A thought, a claim, a question…", confirm: "Pin it" });
    if (!res?.trim()) return;
    const [first, ...rest] = res.trim().split("\n");
    const title = first.length <= 80 && rest.length ? first : undefined;
    await addPin({ kind: "note", title, text: title ? rest.join("\n").trim() : res.trim() }, { near: selected });
  }

  async function addFrame() {
    const title = await promptSheet({ title: "New frame", label: "Name the region", placeholder: "e.g. Psychology", confirm: "Add frame" });
    if (title == null) return;
    const c = viewCenter();
    const size = defaultSize("frame");
    const pin = makePin({ board: boardId, kind: "frame", title: title.trim() || "Frame", x: c.x - size.w / 2, y: c.y - size.h / 2 }, { now: now() });
    await ctx.store.put(pin);
    select(pin.id);
    toast("Frame added — drag pins into it; tap its name to move it, Edit to give it an address", { timeout: 4500 });
  }

  async function addSourcePin() {
    let picked = null;
    await sheet({
      title: "Pin a source",
      body: html`<input class="input" data-q placeholder="Search your library" autocomplete="off" autofocus><div class="pick-list" data-list></div>`,
      foot: html`<button class="btn" data-close>Cancel</button>`,
      setup: (d, close) => {
        const list = d.querySelector("[data-list]");
        const draw = () => {
          const q = d.querySelector("[data-q]").value.trim();
          const found = (q ? searchSources(ctx.sources(), q) : ctx.sources().sort((a, b) => String(b.updated || b.added).localeCompare(String(a.updated || a.added)))).slice(0, 30);
          list.innerHTML = String(found.length ? html`${found.map((s) => html`<button type="button" class="pick" data-id="${s.id}"><b>${s.title || s.url}</b><span>${[s.site, s.status === "inbox" ? "Deposit" : s.status].filter(Boolean).join(" · ")}</span></button>`)}`
            : html`<p class="faint">Nothing in your library matches.</p>`);
        };
        d.querySelector("[data-q]").addEventListener("input", draw);
        on(list, "click", "[data-id]", (e, b) => { picked = b.dataset.id; close(true); });
        draw();
      },
    });
    if (!picked) return;
    const s = sourcesById[picked] || ctx.store.get(picked);
    await addPin({ kind: "source", source: picked, title: s?.title }, { near: selected });
  }

  // Pictures: each becomes an image source in your library (filed, not in the
  // Deposit) and is pinned here at its own shape. Paste or drop works too.
  async function addImagePins(files) {
    if (!files.length) return;
    const saved = await saveImages(ctx, files, { status: "filed" });
    for (const s of saved) { sourcesById[s.id] = s; await addPin({ kind: "source", source: s.id, title: s.title, ...imagePinSize(s) }, { near: selected }); }
    if (saved.length) toast(saved.length === 1 ? "Picture pinned — tap its caption to rename it in Research" : `${saved.length} pictures pinned`, { timeout: 3500 });
  }

  async function addCardPin() {
    let pick = null;
    const atlas = await loadAtlasIndex(ctx);
    await sheet({
      title: "Pin a card",
      body: html`<p class="small muted" style="margin-top:0">Search your own cards (all of your Dex) and your Atlas — each Atlas entry comes with its sprite, its domain and its epistemic status, and zooms into its own page. Not in your Atlas? It searches Wikidata too.</p>
        <input class="input" data-q placeholder="Search your cards, the Atlas and Wikidata" autocomplete="off" autofocus>
        <p class="small faint" data-atlas-state style="margin:6px 0 0">${atlas.index ? `Atlas: ${atlas.index.count} entries${atlas.error ? " (this device's copy — couldn't check for a newer one)" : ""}` : `Atlas not reachable: ${atlas.error || "no index yet"} See Settings → Atlas.`}</p>
        <div class="pick-list" data-list></div>
        <details class="layer"><summary>${raw(icon("upload"))}Bring cards from your Infodex Dex</summary>
          <p class="small">In the Infodex, open your Dex and Export (JSON). Then choose that file here: your cards — with their finish, Insight and your questions — join your library, ready to pin.</p>
          <input type="file" accept="application/json,.json" data-dex></details>`,
      foot: html`<button class="btn" data-close>Cancel</button>`,
      setup: (d, close) => {
        const list = d.querySelector("[data-list]");
        const mine = () => ctx.cards().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
        const atlasRow = (e) => html`<button type="button" class="pick pick-atlas" data-atlas="${e.id}"><span class="pick-sprite">${raw(spriteSvg(e))}</span><b>${e.name}</b><span>${[readable(e.type), readable(e.address?.domain), e.status ? readable(e.status) : ""].filter(Boolean).join(" · ")}</span></button>`;
        const cardRow = (c) => (c.source === "atlas" ? atlasRow({ id: c.atlas, name: c.label, type: c.kind, address: c.address, status: c.status, sprite: c.sprite }) : html`<button type="button" class="pick" data-qid="${c.qid}"><b>${c.label}</b><span>${c.subtitle || c.desc || ""}</span></button>`);
        // All your cards, newest first — the list scrolls; typing searches every one of them.
        const drawMine = () => {
          const m = mine();
          list.innerHTML = String(m.length ? html`<div class="pick-head">Your cards · ${m.length}</div>${m.map(cardRow)}` : "");
        };
        const look = debounce(async () => {
          const q = d.querySelector("[data-q]").value.trim();
          if (!q) return drawMine();
          const ownHits = searchCards(ctx.cards(), q);
          const own = ownHits.length ? html`<div class="pick-head">Your cards · ${ownHits.length}</div>${ownHits.map(cardRow)}` : "";
          const have = new Set(ownHits.filter((c) => c.source === "atlas").map((c) => c.atlas));
          const found = atlas.index ? searchAtlas(atlas.index, q, { limit: 10 }).filter((e) => !have.has(e.id)) : [];
          const head = html`${own}${found.length ? html`<div class="pick-head">In your Atlas</div>${found.map(atlasRow)}` : ""}`;
          list.innerHTML = String(html`${head}<div class="pick-head">On Wikidata</div><p class="faint" data-wd>Searching…</p>`);
          try {
            const res = await searchThings(q);
            if (d.querySelector("[data-q]").value.trim() !== q) return;
            list.innerHTML = String(html`${head}<div class="pick-head">On Wikidata</div>${res.length ? res.map((r) => html`<button type="button" class="pick" data-qid="${r.qid}"><b>${r.label}</b><span>${r.desc}</span></button>`) : html`<p class="faint">Nothing on Wikidata by that name.</p>`}`);
          } catch (err) {
            if (d.querySelector("[data-q]").value.trim() !== q) return;
            list.innerHTML = String(html`${head}<div class="pick-head">On Wikidata</div><p class="faint">Couldn't reach Wikidata (${err.message}).</p>`);
          }
        }, 300);
        d.querySelector("[data-q]").addEventListener("input", look);
        on(list, "click", "[data-qid]", (e, b) => { pick = { qid: b.dataset.qid }; close(true); });
        on(list, "click", "[data-atlas]", (e, b) => { pick = { atlas: b.dataset.atlas }; close(true); });
        d.querySelector("[data-dex]").addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            const cards = (data.cards || []).map((c) => cardFromDex(c, { now: now() })).filter(Boolean);
            const fresh = cards.map((c) => refreshCard(ctx.store.get(c.id), c, { now: now() }));
            if (fresh.length) await ctx.store.putMany(fresh);
            toast(`${fresh.length} card${fresh.length === 1 ? "" : "s"} from your Dex`);
            drawMine();
          } catch (err) { toast(`That file didn't read as a Dex export (${err.message})`, { error: true }); }
        });
        drawMine();
      },
    });
    if (!pick) return;
    let card;
    if (pick.atlas) {
      const entry = atlas.index?.entries.find((e) => e.id === pick.atlas);
      const have = ctx.store.get(atlasCardId(pick.atlas));
      card = entry ? refreshAtlasCard(have, entry, { now: now(), version: atlas.index.version }) : have;
      if (!card) { toast("That entry isn't in this device's copy of the Atlas.", { error: true }); return; }
      await ctx.store.put(card);
    } else {
      card = ctx.store.get(cardIdFor(pick.qid));
      if (!card) {
        toast("Making the card…", { timeout: 1200 });
        try { card = await fetchCard(pick.qid, { now: now() }); await ctx.store.put(card); }
        catch (err) { toast(`Couldn't make that card: ${err.message}`, { error: true }); return; }
      }
    }
    cardsById[card.id] = card;
    await addPin({ kind: "card", card: card.id, title: card.label }, { near: selected });
  }

  async function addCardEntry(cardId) {
    const card = ctx.store.get(cardId);
    if (!card) return;
    const text = await promptSheet({ title: `Entry: ${card.label}`, label: "What do you make of it?", multiline: true, confirm: "Add entry" });
    if (!text?.trim()) return;
    await ctx.store.put({ ...card, body: addEntry(card.body, ctx.today(), text), updated: now() });
  }

  // ---- style inspector (the Aa in the dock)
  // Like a drawing app's style panel: select a pin, then size, colour, font, alignment and card
  // colour apply to the whole pin. Kept as the pin's own `style` field, never as marks in its words.
  const styleEl = el.querySelector("#cork-style");
  const styleBtn = el.querySelector('[data-tool="style"]');
  const TEXT_KINDS = new Set(["note", "quote", "link", "frame"]);
  const styleable = (p) => !!p && (TEXT_KINDS.has(p.kind) || (p.kind === "source" && !imageOf(sourcesById[p.source])));
  const cardable = (p) => !!p && (p.kind === "note" || p.kind === "frame" || p.kind === "quote" || p.kind === "link");
  function styleClasses(p) {
    const st = cleanPinStyle(p.style);
    if (!st) return "";
    return [" styled", st.size && `ps-${st.size}`, st.colour && `ps-c-${st.colour}`, st.font && `ps-f-${st.font}`, st.align && `ps-a-${st.align}`, st.bold && "ps-b", st.italic && "ps-i"].filter(Boolean).join(" ");
  }
  let styleOpen = false;
  function renderStyle() {
    styleBtn.setAttribute("aria-expanded", String(styleOpen));
    styleBtn.classList.toggle("on", styleOpen);
    const p = selected && pinById(selected);
    styleBtn.classList.toggle("dim", !styleable(p));
    if (!styleOpen) { styleEl.hidden = true; return; }
    styleEl.hidden = false;
    if (!styleable(p)) {
      styleEl.innerHTML = String(html`<p class="small muted">${p ? "A card or picture keeps its own look." : "Select a pin, then style it here: text size, colour, font, alignment and card colour."}</p>`);
      return;
    }
    const st = cleanPinStyle(p.style) || {};
    const on_ = (v) => (v ? "on" : "");
    styleEl.innerHTML = String(html`
      <div class="cs-row" aria-label="Text">
        <button type="button" class="${on_(st.bold)}" data-st="bold" aria-pressed="${!!st.bold}" aria-label="Bold"><b>B</b></button>
        <button type="button" class="${on_(st.italic)}" data-st="italic" aria-pressed="${!!st.italic}" aria-label="Italic"><i>I</i></button>
        <span class="fmt-sep"></span>
        ${SIZES.map(([k, l]) => html`<button type="button" class="${on_((st.size || "") === k)} fmt-size-${k || "m"}" data-st-size="${k}" aria-pressed="${(st.size || "") === k}" aria-label="Text size ${l}">${l}</button>`)}
      </div>
      <div class="cs-row" aria-label="Text colour">
        <button type="button" class="fmt-dot ${on_(!st.colour)}" data-st-colour="" aria-label="Ink" title="Ink"><span class="ink"></span></button>
        ${COLOURS.map(([k, l]) => html`<button type="button" class="fmt-dot fmt-${k} ${on_(st.colour === k)}" data-st-colour="${k}" aria-label="${l} text" title="${l}"><span></span></button>`)}
      </div>
      <div class="cs-row" aria-label="Font and alignment">
        ${PIN_FONTS.map(([k, l]) => html`<button type="button" class="${on_((st.font || "") === k)} ps-f-${k || "serif"}" data-st-font="${k}" aria-pressed="${(st.font || "") === k}">${l}</button>`)}
        <span class="fmt-sep"></span>
        ${PIN_ALIGNS.map(([k, l]) => html`<button type="button" class="${on_((st.align || "") === k)}" data-st-align="${k}" aria-pressed="${(st.align || "") === k}" aria-label="Align ${l}">${raw(alignIcon(k))}</button>`)}
      </div>
      ${cardable(p) ? html`<div class="cs-row" aria-label="Card colour">${PIN_COLORS.map((c) => html`<button type="button" class="swatch-dot c-${c} ${on_(p.color === c || (!p.color && c === "paper"))}" data-st-card="${c}" aria-label="${c} card" title="${c} card"></button>`)}
        <span class="fmt-sep"></span><button type="button" data-st="reset">Reset</button></div>` : html`<div class="cs-row"><button type="button" data-st="reset">Reset</button></div>`}`);
  }
  const alignIcon = (k) => {
    const lines = k === "center" ? [[3, 13], [5, 11], [3, 13]] : k === "right" ? [[3, 13], [7, 13], [5, 13]] : [[3, 13], [3, 9], [3, 11]];
    return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${lines.map(([a, b], i) => `<line x1="${a}" x2="${b}" y1="${4 + i * 4}" y2="${4 + i * 4}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`).join("")}</svg>`;
  };
  function toggleStyle() {
    styleOpen = !styleOpen;
    if (styleOpen && !styleable(selected && pinById(selected))) showHint("Select a pin to style it.", { timeout: 2500 });
    renderStyle();
  }
  // Buttons in the inspector don't take focus from the board, so keys like Delete still work there.
  on(styleEl, "pointerdown", "button", (e) => e.preventDefault());
  on(styleEl, "click", "button", async (e, b) => {
    const p = selected && pinById(selected);
    if (!styleable(p)) return;
    const d = b.dataset;
    const st = { ...(cleanPinStyle(p.style) || {}) };
    const patch = {};
    if (d.st === "bold") st.bold = !st.bold;
    else if (d.st === "italic") st.italic = !st.italic;
    else if (d.stSize !== undefined) st.size = d.stSize;
    else if (d.stColour !== undefined) st.colour = d.stColour;
    else if (d.stFont !== undefined) st.font = d.stFont;
    else if (d.stAlign !== undefined) st.align = d.stAlign;
    else if (d.stCard !== undefined) patch.color = d.stCard === "paper" ? undefined : d.stCard;
    if (d.st === "reset") { patch.style = undefined; if (cardable(p)) patch.color = undefined; }
    else if (d.stCard === undefined) patch.style = cleanPinStyle(st);
    await savePin(p, patch);
  });

  // Pins styled with the first Aa carried marks in their words; move those into the pin's style
  // (or unwrap them, keeping every word) and drop the stray placeholder "text" it could leave.
  async function migrateMarkup() {
    for (const p of parts.pins) { const m = migratePinMarkup(p); if (m) await savePin(p, m); }
  }

  function openCurator() {
    const { findings, insights } = curateNow();
    const sum = boardSummary(parts);
    const nm = (id) => { const p = pinById(id); return p?.title || cardsById[p?.card]?.label || sourcesById[p?.source]?.title || "?"; };
    sheet({
      title: "Curator",
      body: html`<p class="small muted" style="margin-top:0">${sum.pins} pins · ${sum.red} red · ${sum.synthesised} synthesised. The curator checks connections against the Atlas's rules: bridges between frames say what kind of connection they are, where they hold and where they break; chains don't carry across boundaries; contradictions need aligned addresses. It points things out — it never decides.</p>
        ${findings.length ? html`${findings.map((f, i) => html`<button type="button" class="finding ${f.level}" data-i="${i}">${raw(icon(f.level === "info" ? "info" : f.level === "warn" ? "warn" : "shield"))}<span>${f.text}</span></button>`)}` : html`<p>Nothing to check.</p>`}
        ${insights.length ? html`<div class="section-title">Most surprising connections</div><p class="small faint" style="margin-top:0">True links between things that looked far apart: different domains, little shared vocabulary, otherwise many steps apart.</p>
          ${insights.map((x) => html`<button type="button" class="finding insight" data-s="${x.string}">✦<span><b>${nm(x.from)}</b> — <b>${nm(x.to)}</b> · surprise ${x.score}</span></button>`)}` : ""}`,
      foot: html`<button class="btn" data-close>Close</button>`,
      setup: (d, close) => {
        on(d, "click", "[data-i]", (e, b) => { close(); focusOn(findings[Number(b.dataset.i)]); });
        on(d, "click", "[data-s]", (e, b) => { close(); const s = parts.strings.find((x) => x.id === b.dataset.s); focusOn({ pins: [s.from, s.to], strings: [s.id] }); });
      },
    });
  }

  function focusOn(f) {
    const ids = new Set([...(f.pins || []), ...(f.strings || []).flatMap((sid) => { const s = parts.strings.find((x) => x.id === sid); return s ? [s.from, s.to] : []; })]);
    const ps = parts.pins.filter((p) => ids.has(p.id));
    if (ps.length) fit(boundsOf(ps), { pad: 80, maxZ: 1.2 });
    flash = new Set([...(f.pins || []), ...(f.strings || [])]);
    renderAll();
    setTimeout(() => { flash = new Set(); renderAll(); }, 2400);
  }

  async function boardMenu() {
    const res = await sheet({
      title: "Board",
      body: html`<label class="field"><span>Name</span><input class="input" data-t value="${board.title}" autocomplete="off"></label>
        <label class="field"><span>What it's for</span><input class="input" data-a value="${board.about || ""}" autocomplete="off"></label>
        <p class="small faint">${isClaude(board.author) ? "Started by Claude. " : ""}Created ${String(board.created || "").slice(0, 10)}.</p>`,
      foot: html`<button class="btn danger ghost" data-del>${raw(icon("trash"))}Delete board</button><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => {
        d.querySelector("[data-ok]").addEventListener("click", () => close({ title: d.querySelector("[data-t]").value.trim(), about: d.querySelector("[data-a]").value.trim() }));
        d.querySelector("[data-del]").addEventListener("click", () => close({ del: true }));
      },
    });
    if (!res) return;
    if (res.del) {
      if (!(await confirmSheet(`Delete “${board.title}” and everything pinned to it? Cards keep their pages; sources stay in your library.`, { confirm: "Delete board", danger: true }))) return;
      for (const r of [...parts.strings, ...parts.pins]) await ctx.store.remove(r.id, { reason: "board deleted" });
      await ctx.store.remove(boardId, { reason: "deleted" });
      ctx.navigate("#/boards", { replace: true });
      return;
    }
    await ctx.store.put({ ...ctx.store.get(boardId), title: res.title || board.title, about: res.about || undefined, updated: now() });
    ui.setTitle(res.title || board.title, { back: board.piece ? `#/piece/${board.piece}` : "#/boards" });
  }

  // ---- wiring
  // Paste a screenshot, or drop pictures onto the board, to pin them.
  const onPaste = (e) => { if (e.target.closest?.("input, textarea, [contenteditable]")) return; const imgs = imagesFrom(e.clipboardData); if (imgs.length) { e.preventDefault(); addImagePins(imgs); } };
  document.addEventListener("paste", onPaste);
  ui.cleanup(() => document.removeEventListener("paste", onPaste));
  vp.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.type.startsWith("image/"))) e.preventDefault(); });
  vp.addEventListener("drop", (e) => { const imgs = imagesFrom(e.dataTransfer); if (imgs.length) { e.preventDefault(); addImagePins(imgs); } });
  ui.onAction((e, b) => { if (b.dataset.act === "curator") openCurator(); if (b.dataset.act === "board-menu") boardMenu(); });
  on(el, "click", "[data-tool]", (e, b) => {
    const t = b.dataset.tool;
    const r = vp.getBoundingClientRect();
    if (t === "note") addNote();
    if (t === "card") addCardPin();
    if (t === "source") addSourcePin();
    if (t === "image") pickImages().then(addImagePins);
    if (t === "frame") addFrame();
    if (t === "style") toggleStyle();
    if (t === "fit") fit();
    if (t === "zoom-in") zoomAt(r.width / 2, r.height / 2, 1.35);
    if (t === "zoom-out") zoomAt(r.width / 2, r.height / 2, 1 / 1.35);
  });
  on(selEl, "click", "[data-sel]", (e, b) => {
    const a = b.dataset.sel;
    if (a === "open" || a === "zoom") openPin(selected);
    if (a === "edit") editPin(selected);
    if (a === "connect") { if (connectFrom) { connectFrom = null; hideHint(); renderSelection(); } else startConnect(); }
    if (a === "delete") removePin(selected);
  });
  on(pinsEl, "click", "[data-act=card-entry]", (e, b) => { e.stopPropagation(); addCardEntry(b.dataset.card); });
  on(pinsEl, "pointerdown", "[data-act=card-entry]", (e) => e.stopPropagation());

  ui.onStore((c) => {
    if (c.op !== "put" && c.op !== "remove" && c.op !== "synced") return;
    if (gesture?.type === "pin") return; // don't yank a pin out from under your finger
    load();
    renderAll();
    renderStyle();
  });
  const ro = new ResizeObserver(() => positionSelection());
  ro.observe(vp);
  ui.cleanup(() => { ro.disconnect(); cancelAnimationFrame(anim); cancelAnimationFrame(raf); cancelAnimationFrame(settle); });

  load();
  if (!cam) { cam = { x: 0, y: 0, z: 1 }; requestAnimationFrame(() => { fit(null, { animate: false, maxZ: 1 }); renderAll(); }); }
  applyCam();
  renderAll();
  renderStyle();
  migrateMarkup();
  vp.focus({ preventScroll: true });
  // Opened from a deposit or a curator link: #/board/<id>?focus=<pin>
  if (route.query.focus) requestAnimationFrame(() => { const p = pinById(route.query.focus); if (p) { select(p.id); fit(boundsOf([p]), { pad: 120, maxZ: 1.2 }); } });
}
