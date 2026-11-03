// Rep counting from body keypoints, ported from Cali_pro's ExerciseTracker
// (src/utils/poseDetector.ts): a joint angle has to go past a "down" threshold,
// stay there briefly, and come back past "up" before a rep counts, with a
// cooldown so one wobble isn't two reps. Pure — it takes keypoints, so it's
// tested without a camera; src/vision/pose.js feeds it from MoveNet.

export function angle(a, b, c) {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let d = Math.abs((r * 180) / Math.PI);
  if (d > 180) d = 360 - d;
  return Math.round(d);
}

// Joints are MoveNet keypoint names; `down`/`up` are Cali_pro's thresholds.
// For sit-ups the angle *shrinks* to finish, so the comparison flips.
export const EXERCISE_RULES = {
  pushup: { joints: ["shoulder", "elbow", "wrist"], down: 90, up: 155, dwell: 200, cooldown: 900, cue: "Side-on, whole body in frame." },
  squat: { joints: ["hip", "knee", "ankle"], down: 100, up: 160, dwell: 250, cooldown: 1100, cue: "Face the camera, hips to ankles in frame." },
  situp: { joints: ["shoulder", "hip", "knee"], down: 135, up: 75, dwell: 250, cooldown: 1100, inverted: true, cue: "Phone on the floor, side-on." },
  dip: { joints: ["shoulder", "elbow", "wrist"], down: 90, up: 155, dwell: 200, cooldown: 900, cue: "Side-on, arms in frame." },
  pullup: { joints: ["shoulder", "elbow", "wrist"], down: 160, up: 70, dwell: 200, cooldown: 900, inverted: true, cue: "Face the camera, bar and elbows in frame." },
};

const MIN_SCORE = 0.3;

function sideAngle(kp, side, joints) {
  const pts = joints.map((j) => kp[`${side}_${j}`]);
  if (pts.some((p) => !p || (p.score ?? 1) < MIN_SCORE)) return null;
  return angle(pts[0], pts[1], pts[2]);
}

export class RepCounter {
  constructor(exercise) {
    this.rule = EXERCISE_RULES[exercise];
    if (!this.rule) throw new Error(`Unknown exercise: ${exercise}`);
    this.exercise = exercise;
    this.reps = 0;
    this.stage = "UP";
    this.downAt = 0;
    this.lastRep = -Infinity;
    this.angle = null;
    this.peak = null; // deepest angle in the current rep, for the turn-in record
  }

  /** keypoints: {name: {x, y, score}} or MoveNet's [{name, x, y, score}]; t in ms. Returns true when a rep lands. */
  update(keypoints, t) {
    const kp = Array.isArray(keypoints) ? Object.fromEntries(keypoints.map((k) => [k.name, k])) : keypoints;
    const { joints, down, up, dwell, cooldown, inverted } = this.rule;
    const angles = ["left", "right"].map((s) => sideAngle(kp, s, joints)).filter((a) => a != null);
    if (!angles.length) { this.angle = null; return false; }
    const a = Math.round(angles.reduce((s, x) => s + x, 0) / angles.length);
    this.angle = a;
    const isDown = inverted ? a >= down : a <= down;
    const isUp = inverted ? a <= up : a >= up;
    if (isDown) {
      if (this.stage !== "DOWN") { this.stage = "DOWN"; this.downAt = t; this.peak = a; }
      else this.peak = inverted ? Math.max(this.peak, a) : Math.min(this.peak, a);
      return false;
    }
    if (isUp && this.stage === "DOWN" && t - this.downAt >= dwell && t - this.lastRep > cooldown) {
      this.stage = "UP";
      this.reps++;
      this.lastRep = t;
      return true;
    }
    if (isUp) this.stage = "UP";
    return false;
  }
}
