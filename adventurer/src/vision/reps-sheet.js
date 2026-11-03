// Camera-verified reps (Cali_pro's sk_vision, rebuilt): MoveNet finds your
// joints on the device, RepCounter (core/reps.js) counts. Nothing from the
// camera leaves the phone — no frames are saved or sent; only the count is.
// The pose model (~3 MB vendored code + weights from Google's model hub) loads
// only when you open this sheet.

import { sheet, html, toast } from "../ui/dom.js";
import { RepCounter, EXERCISE_RULES } from "../core/reps.js";

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
            const poses = await detector.estimatePoses(video).catch(() => []);
            g.clearRect(0, 0, canvas.width, canvas.height);
            const kp = poses[0]?.keypoints;
            if (kp) {
              draw(g, kp);
              if (counter.update(kp, performance.now())) {
                count.textContent = counter.reps;
                navigator.vibrate?.(30);
                if (!max && counter.reps === target) status.textContent = "Target reached. Keep going or tap Done.";
              }
              ang.textContent = counter.angle != null ? `${counter.angle}°` : "";
              if (max || counter.reps < target) status.textContent = counter.angle == null ? "Can't see the joints — step back." : counter.stage === "DOWN" ? "Down… now up." : "Go.";
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
  g.strokeStyle = "#1de9b6"; g.lineWidth = 3; g.fillStyle = "#ff2e63";
  for (const [a, b] of BONES) {
    const p = by[a], q = by[b];
    if (p?.score > 0.3 && q?.score > 0.3) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
  }
  for (const k of kp) if (k.score > 0.3) { g.beginPath(); g.arc(k.x, k.y, 4, 0, 7); g.fill(); }
}
