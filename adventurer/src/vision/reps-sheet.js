// Camera-verified reps (Cali_pro's sk_vision, rebuilt): MoveNet finds your
// joints on the device, RepCounter (core/reps.js) counts. Nothing from the
// camera leaves the phone — no frames are saved or sent; only the count is.
// The pose model (vendored code + weights in vendor/movenet, ~8 MB) loads
// only when you open this sheet.

import { sheet, html, toast } from "../ui/dom.js";
import { RepCounter, EXERCISE_RULES, MIN_SCORE } from "../core/reps.js";

// Cali_pro draws at 0.35 and counts at 0.42 (MIN_SCORE): from across the room most
// joints score 0.35–0.5, so drawing at the counting cutoff showed almost nothing.
const DRAW_SCORE = 0.35, FAINT_SCORE = 0.15;

// A short rising blip per rep, like Cali_pro's, so you know it counted without reading the screen.
let audio;
function blip() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.12);
    v.gain.setValueAtTime(0.25, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(v).connect(audio.destination); o.start(t); o.stop(t + 0.2);
  } catch { /* no sound is fine */ }
}

// One detector for the whole visit, started as soon as the Train tab opens (as Cali_pro
// does on load), so the skeleton can appear the moment the camera does.
let detecting;
export function preloadPose() {
  detecting ||= import("../../vendor/pose.js").then((m) => m.createDetector()).catch((err) => { detecting = null; throw err; }); // { detector, backend, gap }
  return detecting;
}

const BONES = [["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"], ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"]];

/**
 * Resolves {reps} when you finish, or null if closed early. `max: true` is an
 * all-out set (the trainer's assessment and weekly max): no target, just count.
 */
export function countReps(exercise, target, { max = false, title } = {}) {
  const rule = EXERCISE_RULES[exercise];
  return sheet({
    title: title || (max ? `Max set: ${exercise}s` : `${target} ${exercise}s`),
    wide: true,
    body: html`<div class="cam">
        <video playsinline muted></video><canvas></canvas>
        <div class="cam-hud"><span class="cam-count">0</span><span class="cam-of">${max ? "max" : `/ ${target}`}</span><span class="cam-angle"></span><span class="cam-engine"></span></div>
        <div class="cam-status">Loading the pose model…</div>
      </div>
      <p class="muted small">${rule.cue} Frames stay on this device.</p>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-done>Done</button>`,
    setup: (d, close) => {
      let stream, raf, stopped = false, counter = new RepCounter(exercise), detector;
      const video = d.querySelector("video"), canvas = d.querySelector("canvas"), g = canvas.getContext("2d");
      const status = d.querySelector(".cam-status"), count = d.querySelector(".cam-count"), ang = d.querySelector(".cam-angle");
      const cam = d.querySelector(".cam"), engineEl = d.querySelector(".cam-engine");
      const say = (text) => { if (status.textContent !== text) status.textContent = text; }; // no layout work when nothing changed
      try { (audio ||= new (window.AudioContext || window.webkitAudioContext)()).resume(); } catch { /* sound unlocks on this tap, or not at all */ }
      const stop = () => { stopped = true; video.cancelVideoFrameCallback ? video.cancelVideoFrameCallback(raf) : cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
      d.addEventListener("close", stop);
      d.querySelector("[data-done]").addEventListener("click", () => { const reps = counter.reps; stop(); close({ reps }); });
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          video.srcObject = stream;
          await video.play();
          cam.classList.add("loading");
          status.textContent = "Loading the pose model…";
          const engine = await preloadPose();
          detector = engine.detector;
          cam.classList.remove("loading");
          if (stopped) return;
          const label = { webgl: "GPU", wasm: "WASM", cpu: "CPU" }[engine.backend] || engine.backend;
          say(engine.backend === "cpu" ? "Ready (slow CPU mode). Get in position." : "Ready. Get in position.");
          // One inference per new camera frame (requestVideoFrameCallback where the browser has it),
          // the skeleton redrawn every time, and the last one held through a missed frame so it doesn't flicker.
          let last = null, lastAt = 0, frames = 0, fpsAt = performance.now();
          const next = () => { if (!stopped) raf = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop); };
          const loop = async () => {
            if (stopped) return;
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
            let poses = [];
            try { poses = await detector.estimatePoses(video); } catch (err) { say(`Pose model error: ${err.message}`); return next(); }
            if (stopped) return;
            const t = performance.now();
            frames++;
            if (t - fpsAt >= 1000) { engineEl.textContent = `${label} · ${Math.round((frames * 1000) / (t - fpsAt))} fps`; frames = 0; fpsAt = t; }
            let kp = poses[0]?.keypoints;
            if (kp && kp.some((k) => k.score >= DRAW_SCORE)) { last = kp; lastAt = t; } else if (last && t - lastAt < 400) kp = last;
            g.clearRect(0, 0, canvas.width, canvas.height);
            if (!kp) { cam.classList.remove("seen"); say("No one in view yet."); return next(); }
            const real = poses[0]?.keypoints;
            const repped = real ? counter.update(real, t) : false; // count only fresh frames, never the held skeleton
            draw(g, kp, exercise, counter);
            cam.classList.toggle("seen", counter.angle != null);
            if (repped) {
              count.textContent = counter.reps;
              navigator.vibrate?.(30);
              blip();
            }
            ang.textContent = counter.angle != null ? `${counter.angle}°` : "";
            const n = kp.filter((k) => k.score >= DRAW_SCORE).length;
            if (!max && counter.reps >= target) say("Target reached. Keep going or tap Done.");
            else say(counter.hint || (counter.angle == null ? `Seeing ${n} of 17 joints. ${rule.cue}` : counter.stage === "DOWN" ? "Down… now up." : "Go."));
            next();
          };
          next();
        } catch (err) {
          status.textContent = err.name === "NotAllowedError" ? "Camera permission was refused." : `Couldn't start: ${err.message}`;
          toast("Camera counting unavailable — you can still turn in on your word.", { error: true });
        }
      })();
    },
  });
}

// Cali_pro's drawPoseSkeleton: lines coloured by stage, white-ringed joints, the
// working joints circled and the live angle beside them.
const ACTIVE = { pushup: ["elbow", "shoulder"], dip: ["elbow", "shoulder"], pullup: ["elbow", "shoulder"], situp: ["hip", "shoulder"], squat: ["knee", "hip"] };
const BADGE = { pushup: "elbow", dip: "elbow", pullup: "elbow", situp: "hip", squat: "knee" };

function draw(g, kp, exercise, counter) {
  const by = Object.fromEntries(kp.map((k) => [k.name, k]));
  const down = counter.stage === "DOWN";
  const unit = Math.max(g.canvas.width, g.canvas.height) / 640; // scale marks with the camera's resolution
  g.lineCap = "round";
  g.strokeStyle = down ? "#38bdf8" : "#facc15"; g.lineWidth = 6 * unit;
  for (const [a, b] of BONES) {
    const p = by[a], q = by[b];
    if (p?.score >= DRAW_SCORE && q?.score >= DRAW_SCORE) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
  }
  for (const k of kp) {
    if (k.score < FAINT_SCORE) continue;
    const strong = k.score >= DRAW_SCORE;
    g.globalAlpha = strong ? 1 : 0.4;
    g.beginPath(); g.arc(k.x, k.y, (strong ? 8 : 5) * unit, 0, 7);
    g.fillStyle = "#ef4444"; g.fill(); g.lineWidth = 2.5 * unit; g.strokeStyle = "#fff"; g.stroke();
    if (strong && ACTIVE[exercise]?.some((j) => k.name.endsWith(j))) {
      g.beginPath(); g.arc(k.x, k.y, 18 * unit, 0, 7); g.lineWidth = 4 * unit; g.strokeStyle = down ? "#22c55e" : "#eab308"; g.stroke();
    }
  }
  g.globalAlpha = 1;
  const j = [by[`left_${BADGE[exercise]}`], by[`right_${BADGE[exercise]}`]].filter((x) => x?.score >= DRAW_SCORE).sort((a, b) => b.score - a.score)[0];
  if (j && counter.angle != null) {
    // The canvas is mirrored with the video, so text is drawn mirrored back to read the right way.
    g.save(); g.translate(j.x, j.y); g.scale(-1, 1);
    g.font = `bold ${22 * unit}px sans-serif`; g.fillStyle = down ? "#22c55e" : "#facc15"; g.shadowColor = "rgba(0,0,0,.8)"; g.shadowBlur = 6;
    g.fillText(`${counter.angle}°`, 20 * unit, -14 * unit);
    g.restore();
  }
}
