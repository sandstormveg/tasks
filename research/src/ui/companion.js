// The companions on screen: an original portrait in a brass frame that blinks and
// talks (Marginalia in Research, Quicksilver in the Journal), a card of their
// lines, their voice, and their settings block. In the Guild's style (Joy,
// Sergeant Brass): each line plays from the companion's pre-rendered Piper clips
// when it has them (core/voicepack.js), else in the browser's own speech
// (speechSynthesis), so nothing is sent anywhere and no AI runs; the voice is off until you turn it on, and only plays
// when you tap the portrait. Tap again to hush. Motion stops under reduced motion.

import { html, raw, on, toast } from "./dom.js";
import { COMPANIONS, CHATTINESS, companionSettings } from "../core/companions.js";
import { PACKS, clipPaths } from "../core/voicepack.js";

// Marginalia: a tall brass automaton with scrolls at the shoulders, one great lens, a quill in ink-stained fingers.
const MARGINALIA = `<svg viewBox="0 0 64 64" aria-hidden="true" class="portrait-svg">
  <rect width="64" height="64" fill="currentColor" opacity=".05"/>
  <path d="M10 64c1-11 6-17 12-19M54 64c-1-11-6-17-12-19" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <rect x="6" y="44" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="49" y="44" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <path d="M23 8h18l3 6v20c0 7-5 11-12 11s-12-4-12-11V14z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.8"/>
  <path d="M28 4h8v4h-8zM32 45v5M27 50h10" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <circle cx="38" cy="24" r="8" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.8"/><path d="M44 30l5 5" stroke="currentColor" stroke-width="1.6"/>
  <g class="eyes"><circle cx="38" cy="24" r="2.6" fill="currentColor"/><rect x="24" y="23" width="5" height="2" fill="currentColor"/></g>
  <path class="mouth-shut" d="M27 37h10" stroke="currentColor" stroke-width="1.5"/><rect class="mouth-open" x="27" y="35.5" width="10" height="3.5" rx="1" fill="currentColor"/>
  <path d="M26 40h12" stroke="currentColor" stroke-width=".8" opacity=".5"/>
  <path d="M40 64l8-15" stroke="currentColor" stroke-width="1.3"/><path d="M48 49l5-9c-4 1-7 4-7 8z" fill="currentColor" opacity=".7"/>
  <circle cx="41" cy="60" r="2" fill="currentColor" opacity=".55"/><circle cx="37" cy="62" r="1.3" fill="currentColor" opacity=".45"/>
</svg>`;

// Quicksilver: a wide-brimmed hat with a feather, a patched coat, a lute neck at the shoulder, glowing vials, a glass-and-copper hand.
const QUICKSILVER = `<svg viewBox="0 0 64 64" aria-hidden="true" class="portrait-svg">
  <rect width="64" height="64" fill="currentColor" opacity=".05"/>
  <path d="M12 64c2-11 9-16 20-16s18 5 20 16" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.8"/>
  <rect x="20" y="54" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1"/>
  <path d="M50 64L58 30M56 30l4-2 1 4-4 1" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M21 28c0-8 5-13 11-13s11 5 11 13v3c0 7-5 12-11 12s-11-5-11-12z" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <path d="M9 21c7-1 14-1 23-1s16 0 23 1c-4-2-9-3-12-3l-3-8c-2-2-12-2-16 0l-3 8c-3 0-8 1-12 3z" fill="currentColor" fill-opacity=".55" stroke="currentColor" stroke-width="1.2"/>
  <path d="M42 11c5-6 11-7 14-6-4 2-8 5-11 9" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g class="eyes"><path d="M25 28q3-2 6 0M34 28q3-2 6 0" fill="none" stroke="currentColor" stroke-width="1.8"/></g>
  <path class="mouth-shut" d="M28 36q4 3 8 0" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse class="mouth-open" cx="32" cy="36.5" rx="3.6" ry="2.4" fill="currentColor"/>
  <g class="vials"><rect x="31" y="53" width="4" height="8" rx="2" fill="currentColor" opacity=".8"/><rect x="37" y="52" width="4" height="9" rx="2" fill="currentColor" opacity=".55"/><rect x="43" y="54" width="4" height="7" rx="2" fill="currentColor" opacity=".35"/></g>
  <path d="M8 60c2-4 6-6 9-5l1 4-6 3z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="13" cy="58" r="1.3" fill="currentColor"/>
</svg>`;

const PORTRAITS = { marginalia: MARGINALIA, quicksilver: QUICKSILVER };

export const portrait = (id, { label = "", still = false } = {}) => (still
  ? html`<span class="portrait small" data-who="${id}" role="img" aria-label="${label}">${raw(PORTRAITS[id])}</span>`
  : html`<button type="button" class="portrait" data-who="${id}" aria-label="${label || "Hear them"}">${raw(PORTRAITS[id])}</button>`);

/** The companion's card: portrait, name and their lines. Lines are { text, href?, prompt? }. */
export function companionCard(id, lines, s) {
  const c = COMPANIONS[id];
  const name = s.name || c.name;
  return html`<section class="companion" data-companion="${id}" aria-label="${name}">
    ${portrait(id, { label: s.voice ? `Hear ${name}` : `${name}` })}
    <div class="companion-body">
      <div class="companion-name">${name}<span class="companion-q">${c.question}</span></div>
      <div class="companion-lines" aria-live="polite">${lines.map((l, i) => html`<p class="companion-line" style="--i:${i}">${l.href ? html`<a href="${l.href}">${l.text}</a>` : l.prompt ? html`<button type="button" class="companion-prompt" data-companion-prompt="${l.prompt}">${l.text}</button>` : l.text}</p>`)}</div>
    </div>
    <button type="button" class="btn icon small ghost companion-x" data-companion-hide aria-label="Hide ${name} for today">×</button>
  </section>`;
}

// ---------- voice ----------

// The Journal's and Research's English voices, best first by kind. Marginalia: older and measured
// (British men's "Natural" voices lead, then Apple's and Google's). Quicksilver: warm and bright.
const OLDER = [/ryan.*natural/i, /thomas.*natural/i, /oliver.*natural/i, /alfie.*natural/i, /elliot.*natural/i, /google uk english male/i,
  /\bdaniel\b/i, /\barthur\b/i, /\bgeorge\b/i, /\boliver\b/i, /guy.*natural/i, /\bdavid\b/i, /\bmale\b/i];
const WARM = [/sonia.*natural/i, /libby.*natural/i, /maisie.*natural/i, /hollie.*natural/i, /bella.*natural/i, /natural/i,
  /google uk english female/i, /\bserena\b/i, /\bkate\b/i, /\bmartha\b/i, /\bstephanie\b/i, /\bhazel\b/i, /samantha/i, /female/i];

// The clips on hand: voices/index.json, read once. Browsers that can't play Opus use device speech.
let clips = null;
if (typeof Audio !== "undefined" && new Audio().canPlayType('audio/ogg; codecs="opus"')) {
  fetch(new URL("../../voices/index.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => {
    clips = j && Object.fromEntries(Object.entries(j).map(([who, vs]) => [who, Object.fromEntries(Object.entries(vs).map(([v, x]) => [v, new Set(x.keys)]))]));
  }).catch(() => {});
}
/** "quicksilver:poppy": the chosen rendered voice, the first one by default, "" for the device's. */
const packOf = (id, s) => (s.voicePack === "" ? "" : `${id}:${s.voicePack || PACKS[id].voices[0].id}`);
export const hasClips = (pack, text) => !!clipPaths(clips, pack, text);

export const voices = () => (typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : []);

function pickVoice(name, kind) {
  const all = voices();
  if (name) { const v = all.find((x) => x.name === name); if (v) return v; }
  const gb = all.filter((x) => /^en[-_]GB/i.test(x.lang));
  for (const pool of [gb, all]) for (const re of kind === "older" ? OLDER : WARM) { const v = pool.find((x) => re.test(x.name)); if (v) return v; }
  return gb[0] || all[0] || null;
}
export const bestVoice = (kind) => pickVoice("", kind)?.name || "";

const num = (x, d, lo, hi) => { const n = Number(x); return x != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
let speaking = "";
const setTalking = (id) => { speaking = id; document.querySelectorAll(".portrait[data-who]").forEach((p) => p.classList.toggle("talking", !!id && p.dataset.who === id)); };

let turn = 0, audio = [];

/**
 * Say a companion's lines in their voice (their settings, else their defaults): one after another,
 * each from clips when every sentence has one, else in device speech. s.pack overrides the voice.
 */
export function speak(id, text, s = {}) {
  const lines = (Array.isArray(text) ? text : [text]).filter(Boolean);
  const pack = s.pack ?? packOf(id, s);
  const queue = lines.map((t) => ({ text: t, paths: clipPaths(clips, pack, t) }));
  if (!queue.length || (typeof speechSynthesis === "undefined" && queue.some((q) => !q.paths))) return false;
  hush();
  const mine = ++turn;
  const next = (i) => {
    if (mine !== turn) return;
    if (i >= queue.length) return setTalking("");
    const q = queue[i], done = () => next(i + 1);
    if (q.paths) playClips(id, q.paths, s, done, () => deviceSay(id, q.text, s, done));
    else deviceSay(id, q.text, s, done);
  };
  next(0);
  return true;
}

function playClips(id, paths, s, done, fail) {
  const list = paths.map((p) => { const a = new Audio(new URL(`../../${p}`, import.meta.url).href); a.preload = "auto"; a.playbackRate = num(s.voiceRate, 1, 0.5, 2); return a; });
  audio = list;
  const at = (i) => {
    if (audio !== list) return;
    if (i >= list.length) return done();
    list[i].onended = () => at(i + 1);
    list[i].onerror = () => { audio = []; fail(); };
    list[i].play().then(() => setTalking(id), () => list[i].onerror?.());
  };
  at(0);
}

function deviceSay(id, text, s, done) {
  if (typeof speechSynthesis === "undefined") return done();
  const c = COMPANIONS[id];
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(s.voiceName, c.voice.kind);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = num(s.voiceRate, c.voice.rate, 0.5, 2);
  u.pitch = num(s.voicePitch, c.voice.pitch, 0, 2);
  u.onstart = () => setTalking(id);
  u.onend = u.onerror = done;
  u.onboundary = () => document.querySelectorAll(`.portrait[data-who="${id}"]`).forEach((p) => { p.classList.remove("snap"); void p.offsetWidth; p.classList.add("snap"); });
  speechSynthesis.speak(u);
}
export function hush() {
  turn++;
  audio.forEach((a) => { a.onended = a.onerror = null; a.pause(); });
  audio = [];
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  setTalking("");
}

if (typeof document !== "undefined" && typeof speechSynthesis !== "undefined") {
  speechSynthesis.getVoices(); // Chrome lists voices late; this starts it
  document.addEventListener("visibilitychange", () => { if (document.hidden) hush(); });
}

// ---------- on a page ----------

// Hidden-for-today is kept per place, so hiding Quicksilver on Today leaves it in Reflect.
const HIDDEN = (id, place) => `companion-hidden-${id}${place ? `-${place}` : ""}`;
const hiddenToday = (key, day) => { try { return localStorage.getItem(key) === day; } catch { return false; } };

/**
 * Put a companion into `box`, unless they're off or hidden for today. Tapping the portrait
 * speaks the lines (if the voice is on) or hushes them; × hides them until tomorrow.
 * onPrompt(text) is called when a prompt line is tapped. Returns true when shown.
 */
export function mountCompanion(box, ctx, id, lines, { day, onPrompt, cleanup, place = "" } = {}) {
  if (!box) return false;
  const s = companionSettings(ctx.settings());
  const key = HIDDEN(id, place);
  box._companion = { lines, day, onPrompt, place };
  const shown = place === "reflect" ? s.reflect : s.on;
  if (!shown || !lines.length || hiddenToday(key, day)) { box.innerHTML = ""; return false; }
  box.innerHTML = String(companionCard(id, lines, s));
  if (box._wired) return true;
  // Wired once per box; redraws only replace the markup and box._companion.
  box._wired = true;
  const name = () => companionSettings(ctx.settings()).name || COMPANIONS[id].name;
  on(box, "click", ".portrait[data-who]", () => {
    const now = companionSettings(ctx.settings());
    if (speaking === id) return hush();
    if (!now.voice) return toast(`Turn on ${name()}'s voice in Settings to hear them.`, { action: "Settings", onAction: () => ctx.navigate(id === "quicksilver" ? "#/settings/companion" : "#/settings") });
    if (!speak(id, box._companion.lines.map((l) => l.text), now)) toast("This browser can't speak.", { error: true });
  });
  on(box, "click", "[data-companion-prompt]", (e, b) => box._companion.onPrompt?.(b.dataset.companionPrompt));
  on(box, "click", "[data-companion-hide]", () => {
    const { day: d, lines: ls, onPrompt: op, place: pl } = box._companion;
    try { localStorage.setItem(key, d); } catch { /* private window: hidden until reload */ }
    hush();
    box.innerHTML = "";
    toast(`${name()} will be back tomorrow.`, { action: "Undo", onAction: () => { try { localStorage.removeItem(key); } catch { /* fine */ } mountCompanion(box, ctx, id, ls, { day: d, onPrompt: op, place: pl }); } });
  });
  cleanup?.(() => { if (speaking === id) hush(); });
  return true;
}

// ---------- settings ----------

/** The companion's block for a Settings page. Wire it with wireCompanionSettings. */
export function companionSettingsBlock(id, ctx, { themes = false, reflect = false } = {}) {
  const c = COMPANIONS[id];
  const s = companionSettings(ctx.settings());
  return html`<div class="card flat companion-settings" data-companion-settings="${id}">
    <div class="row" style="gap:12px;align-items:center">${portrait(id, { label: `Hear ${s.name || c.name}` })}
      <p class="small" style="margin:0"><b>${s.name || c.name}</b> — ${id === "marginalia" ? "an ancient archive automaton who greets you with the library's state, points out gaps and red strings, and suggests what to read next." : "a wandering bard-alchemist who offers a gentle question when you open the Journal, notices what's moving in Reflect, and asks rather than tells."} Lines come from templates — no AI runs when you open the app.</p></div>
    <label class="check"><input type="checkbox" data-cs="on" ${s.on ? "checked" : ""}> ${reflect ? html`Show ${c.name} on Today` : html`Show ${c.name}`}</label>
    ${reflect ? html`<label class="check"><input type="checkbox" data-cs="reflect" ${s.reflect ? "checked" : ""}> Insights in Reflect: as you open Overview, Review, Questions, Patterns or Changes, ${c.name} points out what's worth a look (worked out on this device from your meta-record and ratings; no AI, never quoting entries)</label>` : ""}
    <div class="row wrap">
      <label class="field grow"><span>Name</span><input class="input" data-cs="name" value="${s.name}" placeholder="${c.name}" maxlength="24" autocomplete="off"></label>
      <label class="field grow"><span>Chattiness</span><select class="select" data-cs="chattiness">${Object.entries(CHATTINESS).map(([k, label]) => html`<option value="${k}" ${s.chattiness === k ? "selected" : ""}>${label}</option>`)}</select></label>
    </div>
    ${themes ? html`<label class="check"><input type="checkbox" data-cs="themes" ${s.themes ? "checked" : ""}> Notice themes: mention a #tag that keeps coming back this week (counted on this device from entries that aren't sealed; nothing is sent anywhere)</label>` : ""}
    <label class="check"><input type="checkbox" data-cs="voice" ${s.voice ? "checked" : ""}> Voice: tap the portrait to hear ${c.name} (tap again to hush)</label>
    <div class="field"><span>Voice</span><div class="pack-list">
      ${PACKS[id].voices.map((v, i) => html`<div class="pack-row"><label class="check"><input type="radio" name="voicePack-${id}" data-cs="voicePack" value="${v.id}" ${(s.voicePack ?? PACKS[id].voices[0].id) === v.id ? "checked" : ""}> ${v.label}</label><button type="button" class="btn small ghost" data-cs-preview="${id}:${v.id}" aria-label="Hear ${v.label}">▶</button></div>`)}
      <div class="pack-row"><label class="check"><input type="radio" name="voicePack-${id}" data-cs="voicePack" value="" ${s.voicePack === "" ? "checked" : ""}> This device's voice (set below)</label></div>
    </div></div>
    <p class="small muted">The named voices are recorded with Piper, a free offline voice engine, and play from this site. Lines with your own words in them (titles, tags) always use the device voice, so nothing personal is ever recorded.</p>
    <div class="row wrap">
      <label class="field grow"><span>Device voice</span><select class="select" data-cs="voiceName" data-cs-voices></select></label>
      <label class="field grow"><span>Speed</span><input class="input" type="range" data-cs="voiceRate" min="0.6" max="1.6" step="0.05" value="${s.voiceRate ?? c.voice.rate}"></label>
      <label class="field grow"><span>Pitch</span><input class="input" type="range" data-cs="voicePitch" min="0.5" max="2" step="0.05" value="${s.voicePitch ?? c.voice.pitch}"></label>
    </div>
    <button type="button" class="btn small" data-cs-test>▶ Hear ${s.name || c.name}</button>
  </div>`;
}

function fillVoices(sel, chosen, kind) {
  if (!sel) return;
  const best = bestVoice(kind);
  sel.replaceChildren(new Option(best ? `Best on this device (${best})` : "Best on this device", ""), ...voices().map((v) => new Option(`${v.name} · ${v.lang}`, v.name, false, v.name === chosen)));
}

export function wireCompanionSettings(el, ctx, id) {
  const c = COMPANIONS[id];
  const fill = () => fillVoices(el.querySelector(`[data-companion-settings="${id}"] [data-cs-voices]`), companionSettings(ctx.settings()).voiceName, c.voice.kind);
  fill();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.addEventListener?.("voiceschanged", fill, { once: true });
  on(el, "change", `[data-companion-settings="${id}"] [data-cs]`, async (e, f) => {
    const k = f.dataset.cs;
    const v = f.type === "checkbox" ? f.checked : f.type === "range" ? Number(f.value) : f.value.trim();
    await ctx.saveSettings({ companion: { ...(ctx.settings().companion || {}), [k]: v } });
    toast("Saved", { timeout: 1200 });
  });
  const test = () => {
    const s = companionSettings(ctx.settings());
    if (speaking === id) return hush();
    const lines = PACKS[id].preview;
    speak(id, lines[Math.floor(Math.random() * lines.length)], s) || toast("This browser can't speak.", { error: true });
  };
  on(el, "click", `[data-companion-settings="${id}"] [data-cs-preview]`, (e, b) => {
    const s = companionSettings(ctx.settings()), lines = PACKS[id].preview, line = lines[Math.floor(Math.random() * lines.length)];
    if (!hasClips(b.dataset.csPreview, line)) toast("That voice isn't on this device yet; the device voice will say it.");
    speak(id, line, { ...s, pack: b.dataset.csPreview }) || toast("This browser can't speak.", { error: true });
  });
  on(el, "click", `[data-companion-settings="${id}"] [data-cs-test]`, test);
  on(el, "click", `[data-companion-settings="${id}"] .portrait`, test);
  return fill; // call again after the settings page redraws
}
