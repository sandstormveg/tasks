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
        <div class="cam-hud"><span class="cam-count">0</span><span class="cam-of">${max ? "max" : `/ ${target}`}</span><span class="cam-angle"></span></div>
        <div class="cam-status">Loading the pose model…</div>
      </div>
      <p class="muted small">${rule.cue} Frames stay on this device.</p>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-done>Done</button>`,
    setup: (d, close) => {
      let stream, raf, stopped = false, counter = new RepCounter(exercise), detector;
      const video = d.querySelector("video"), canvas = d.querySelector("canvas"), g = canvas.getContext("2d");
      const status = d.querySelector(".cam-status"), count = d.querySelector(".cam-count"), ang = d.querySelector(".cam-angle");
      const cam = d.querySelector(".cam");
      try { (audio ||= new (window.AudioContext || window.webkitAudioContext)()).resume(); } catch { /* sound unlocks on this tap, or not at all */ }
      const stop = () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); detector?.dispose?.(); };
      d.addEventListener("close", stop);
      d.querySelector("[data-done]").addEventListener("click", () => { const reps = counter.reps; stop(); close({ reps }); });
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          video.srcObject = stream;
          await video.play();
          const { createDetector } = await import("../../vendor/pose.js");
          detector = await createDetector();
          if (stopped) return;
          status.textContent = "Get in position.";
          const loop = async () => {
            if (stopped) return;
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            let poses = [];
            try { poses = await detector.estimatePoses(video); } catch (err) { status.textContent = `Pose model error: ${err.message}`; }
            g.clearRect(0, 0, canvas.width, canvas.height);
            const kp = poses[0]?.keypoints;
            if (!kp && !/error/.test(status.textContent)) status.textContent = "No one in view yet.";
            cam.classList.toggle("seen", !!kp && counter.angle != null);
            if (kp) {
              draw(g, kp);
              if (counter.update(kp, performance.now())) {
                count.textContent = counter.reps;
                navigator.vibrate?.(30);
                blip();
                if (!max && counter.reps === target) status.textContent = "Target reached. Keep going or tap Done.";
              }
              ang.textContent = counter.angle != null ? `${counter.angle}°` : "";
              if (max || counter.reps < target) status.textContent = counter.hint || (counter.angle == null ? "Can't see the joints — step back." : null) || (counter.stage === "DOWN" ? "Down… now up." : "Go.");
            }
            raf = requestAnimationFrame(loop);
          };
          loop();
        } catch (err) {
          status.textContent = err.name === "NotAllowedError" ? "Camera permission was refused." : `Couldn't start: ${err.message}`;
          toast("Camera counting unavailable — you can still turn in on your word.", { error: true });
        }
      })();
    },
  });
}

function draw(g, kp) {
  const by = Object.fromEntries(kp.map((k) => [k.name, k]));
  g.strokeStyle = "#1de9b6"; g.lineWidth = 5; g.fillStyle = "#ff2e63";
  for (const [a, b] of BONES) {
    const p = by[a], q = by[b];
    if (p?.score >= DRAW_SCORE && q?.score >= DRAW_SCORE) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
  }
  for (const k of kp) {
    if (k.score < FAINT_SCORE) continue;
    g.globalAlpha = k.score >= DRAW_SCORE ? 1 : 0.35;
    g.beginPath(); g.arc(k.x, k.y, k.score >= MIN_SCORE ? 7 : 5, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
