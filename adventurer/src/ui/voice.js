// Joy's voice: her pre-rendered Piper clips when the line has them (core/voicepack.js),
// else the browser's own speech (speechSynthesis). Either way nothing is sent
// anywhere and no AI runs. Off unless Settings › Receptionist voice is on; the
// voice, volume, speed and pitch are set there too. Sergeant Brass, the Train tab's
// coach, speaks through here as well, with a male voice (kind: "male"). While she talks, every
// portrait on screen gets .talking (mouth flaps, in CSS); word boundaries, where
// the browser reports them, give the mouth an extra snap. Tapping a portrait stops her.

// Device voices that sound most like a friendly receptionist, best first. The
// "Online (Natural)" and Google ones are far less robotic than the system defaults.
const PREFERRED = [/aria.*natural/i, /jenny.*natural/i, /natasha.*natural/i, /sonia.*natural/i, /libby.*natural/i, /michelle.*natural/i,
  /natural/i, /google uk english female/i, /samantha/i, /serena/i, /karen/i, /moira/i, /tessa/i, /google us english/i, /zira/i, /hazel/i, /susan/i, /female/i];

// The coach's: male voices, best first (Microsoft's British "Natural" ones lead, then Apple's and Google's).
// "\bmale" never matches "Female".
const MALE = [/ryan.*natural/i, /thomas.*natural/i, /oliver.*natural/i, /alfie.*natural/i, /elliot.*natural/i, /ethan.*natural/i, /noah.*natural/i,
  /guy.*natural/i, /andrew.*natural/i, /brian.*natural/i, /christopher.*natural/i, /eric.*natural/i, /davis.*natural/i,
  /google uk english male/i, /\bdaniel\b/i, /\barthur\b/i, /\bgeorge\b/i, /\boliver\b/i, /\bdavid\b/i, /\bmark\b/i, /\bfred\b/i, /\balex\b/i, /\bmale\b/i];

import { clipPaths, sentences } from "../core/voicepack.js";

// The clips on hand: voices/index.json, read once (and precached, so it's there offline).
// Browsers that can't play Opus use device speech. A line asked for before it arrives waits for it.
let clips = null;
const clipsReady = typeof Audio !== "undefined" && new Audio().canPlayType('audio/ogg; codecs="opus"')
  ? fetch(new URL("../../voices/index.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => {
    clips = j && Object.fromEntries(Object.entries(j).map(([who, vs]) => [who, Object.fromEntries(Object.entries(vs).map(([v, x]) => [v, new Set(x.keys)]))]));
  }).catch(() => {})
  : Promise.resolve();
/** Whether a pack voice ("joy:cori") can say this whole line from clips. */
export const hasClips = (pack, text) => !!clipPaths(clips, pack, text);

export const voices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : []);

/** The voice to use: the one picked in Settings if this device has it, else the best match above. */
function pickVoice(name, kind) {
  const all = voices();
  if (name) { const v = all.find((x) => x.name === name); if (v) return v; }
  if (kind === "male") {
    // British first, then any English; with no male voice at all, the en-GB one at a lower pitch (see coachVoice).
    for (const pool of [all.filter((x) => /^en[-_]GB/i.test(x.lang)), all]) for (const re of MALE) { const v = pool.find((x) => re.test(x.name)); if (v) return v; }
    return all.find((x) => /^en[-_]GB/i.test(x.lang)) || all[0] || null;
  }
  for (const re of PREFERRED.slice(0, 8)) { const v = all.find((x) => re.test(x.name)); if (v) return v; }
  // Android names its voices by language only ("English United Kingdom"); there the en-GB one is female.
  const gb = all.find((x) => /^en[-_]GB/i.test(x.lang));
  if (gb) return gb;
  for (const re of PREFERRED.slice(8)) { const v = all.find((x) => re.test(x.name)); if (v) return v; }
  return all[0] || null;
}
export const bestVoice = (kind) => pickVoice("", kind)?.name || "";

// Only the speaker's portrait moves: the coach's carry data-who="coach", Joy's carry nothing.
let who = "";
const portraits = (w = who) => document.querySelectorAll(w ? `.portrait[data-who="${w}"]` : ".portrait:not([data-who])");
const setTalking = (on) => { (on ? portraits() : document.querySelectorAll(".portrait")).forEach((p) => p.classList.toggle("talking", on)); };

let playing = null;
function stopClips() { if (playing) { playing.forEach((a) => { a.onended = a.onerror = null; a.pause(); }); playing = null; } }

let turn = 0, ctxA = null;
const clipUrl = (p) => new URL(`../../${p}`, import.meta.url).href;

/**
 * Plays a line sentence by sentence: each from its clip, at the chosen speed (pitch kept) and pitch
 * (shifted without changing the speed). A sentence with no clip, or whose clip won't play, is said by
 * the device voice only when s.deviceFallback is on; otherwise it's skipped, so the voice never
 * switches mid-line.
 */
function playLine(pack, text, s) {
  const mine = turn, parts = sentences(text);
  // Clip pitch is relative to the recording; Joy's comes from her pitch slider, whose default (1.1) is "as recorded".
  const rate = num(s.voiceRate, 1, 0.5, 2), pitch = num(s.clipPitch ?? num(s.voicePitch, 1.1, 0.5, 2) / 1.1, 1, 0.5, 2), vol = num(s.voiceVolume, 1, 0, 1);
  const next = (i) => {
    if (mine !== turn) return;
    if (i >= parts.length) return setTalking(false);
    const path = clipPaths(clips, pack, parts[i])?.[0];
    const fallback = () => (s.deviceFallback ? deviceSpeak(parts[i], s, () => next(i + 1)) : next(i + 1));
    if (!path) return fallback();
    (Math.abs(pitch - 1) < 0.02 ? playPlain : playShifted)(clipUrl(path), { rate, pitch, vol }, mine).then(() => next(i + 1), () => mine === turn && fallback());
  };
  next(0);
}

function playPlain(url, { rate, vol }, mine) {
  return new Promise((ok, fail) => {
    const a = new Audio(url);
    a.volume = vol; a.playbackRate = rate; a.preservesPitch = true;
    playing = [a];
    a.onended = ok; a.onerror = fail;
    a.play().then(() => mine === turn && setTalking(true), fail);
  });
}

// Pitch without speed: stretch the clip in time (WSOLA), then play it faster or slower by the pitch
// factor, which shifts the pitch and brings the length back to what the speed asks for.
async function playShifted(url, { rate, pitch, vol }, mine) {
  ctxA ||= new AudioContext();
  if (ctxA.state === "suspended") await ctxA.resume();
  const buf = await ctxA.decodeAudioData(await (await fetch(url)).arrayBuffer());
  if (mine !== turn) return;
  const src = ctxA.createBufferSource(), gain = ctxA.createGain();
  src.buffer = stretch(buf, pitch / rate);
  src.playbackRate.value = pitch;
  gain.gain.value = vol;
  src.connect(gain).connect(ctxA.destination);
  return new Promise((ok) => {
    src.onended = ok;
    playing = [{ pause: () => { src.onended = null; try { src.stop(); } catch {} } }];
    src.start();
    setTalking(true);
  });
}

/** Time-stretches a mono buffer by factor f (2 = twice as long) with waveform-similarity overlap-add. */
function stretch(buf, f) {
  const x = buf.getChannelData(0), sr = buf.sampleRate;
  const N = Math.round(sr * 0.03), Hs = N >> 1, Ha = Hs / f, tol = Math.round(sr * 0.008);
  const outLen = Math.ceil(x.length * f) + N;
  const y = new Float32Array(outLen), w = new Float32Array(N);
  for (let n = 0; n < N; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
  let prev = 0;
  for (let k = 0; k * Hs + N < outLen; k++) {
    const target = Math.round(k * Ha);
    if (target + N + tol >= x.length) break;
    let best = target;
    if (k) {
      let bestC = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const at = target + d; if (at < 0) continue;
        let c = 0; for (let n = 0; n < Hs; n += 2) c += x[at + n] * x[prev + Hs + n];
        if (c > bestC) { bestC = c; best = at; }
      }
    }
    for (let n = 0; n < N; n++) y[k * Hs + n] += x[best + n] * w[n];
    prev = best;
  }
  const out = new AudioBuffer({ length: outLen, sampleRate: sr, numberOfChannels: 1 });
  out.copyToChannel(y, 0);
  return out;
}

/**
 * Say a line. s: voiceName, voiceVolume, voiceRate, voicePitch, and for the coach kind: "male", who: "coach".
 * pack ("joy:cori") plays the pre-rendered clips when every sentence has one; Joy's comes from s.voicePack.
 */
export function speak(text, s = {}) {
  if (!text) return;
  hush();
  who = s.who || "";
  const pack = s.pack ?? (s.voicePack ? `joy:${s.voicePack}` : "");
  if (!pack) return deviceSpeak(text, s);
  const mine = turn;
  clipsReady.then(() => {
    if (mine !== turn) return;
    // No clips at all (a browser that can't play them, or the index didn't load): the device voice, if allowed.
    if (!clips?.[pack.split(":")[0]]?.[pack.split(":")[1]]) return s.deviceFallback ? deviceSpeak(text, s) : undefined;
    playLine(pack, text, s);
  });
}

function deviceSpeak(text, s, done) {
  if (!("speechSynthesis" in window)) return done ? done() : setTalking(false);
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(s.voiceName, s.kind);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.volume = num(s.voiceVolume, 1, 0, 1); u.rate = num(s.voiceRate, 1, 0.5, 2); u.pitch = num(s.voicePitch, 1.1, 0, 2);
  u.onstart = () => setTalking(true);
  u.onend = u.onerror = () => (done ? done() : setTalking(false));
  u.onboundary = () => portraits().forEach((p) => { p.classList.remove("snap"); void p.offsetWidth; p.classList.add("snap"); });
  speechSynthesis.speak(u);
}
const num = (x, d, lo, hi) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function hush() { turn++; stopClips(); if ("speechSynthesis" in window) speechSynthesis.cancel(); setTalking(false); }

if ("speechSynthesis" in window) speechSynthesis.getVoices(); // Chrome loads the list late; this starts it
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => { if (e.target.closest(".portrait.talking")) { e.preventDefault(); hush(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hush(); });
}
