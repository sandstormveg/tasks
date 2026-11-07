// A jog, tracked by GPS while this page is open (a web app can't read the phone's
// step counter: Health Connect and Google Fit aren't open to the web). Distance adds
// up fix by fix and steps are estimated from it (STRIDE_M a step). Only the totals
// are kept: no position is saved or sent, and only the last fix is held, in memory.
// The screen is kept awake while tracking where the browser allows it. If GPS isn't
// an option, steps from your own counter can be entered by hand (paid as your word).
// Sergeant Brass calls out the marks.

import { sheet, html, promptSheet } from "./dom.js";
import { distanceMeters } from "../core/geo.js";
import { STRIDE_M } from "../core/quests.js";
import { coachBubble, coachSay, coachName } from "./coach.js";
import { jogStart, jogMark, jogNoFix } from "../core/coach.js";

const MAX_ACCURACY = 30, MIN_STEP_M = 4, MAX_SPEED = 7; // metres, metres, m/s (a fast run, not a bus)

/** Resolves {meters, steps, minutes, tracked: true}, {steps, manual: true}, or null if closed. */
export function trackJog(s, { steps: target = 5000, title } = {}) {
  const km = (m) => (m / 1000).toFixed(2);
  return sheet({
    title: title || `Jog ${target.toLocaleString()} steps`,
    body: html`${coachBubble(coachName(s), `${target.toLocaleString()} steps, about ${km(target * STRIDE_M)} km. Tap Start when you're moving.`)}
      <div class="jog">
        <div class="jog-big"><span data-steps>0</span><small> / ${target.toLocaleString()} steps</small></div>
        <div class="jog-row muted"><span data-km>0.00</span> km · <span data-time>0:00</span> · <span data-gps>GPS off</span></div>
        <div class="xpbar" aria-hidden="true"><i data-bar style="width:0%"></i></div>
      </div>
      <p class="muted small">Keep this page open with the screen on. Steps are estimated from GPS distance; only the totals are kept, never where you went.</p>`,
    foot: html`<button class="btn ghost" data-manual>Enter steps by hand</button><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Start</button>`,
    setup: (d, close) => {
      let watch = null, last = null, meters = 0, started = 0, tick = null, lock = null, marks = 0;
      const $ = (k) => d.querySelector(`[data-${k}]`);
      const steps = () => Math.round(meters / STRIDE_M);
      const stop = () => { if (watch != null) navigator.geolocation.clearWatch(watch); clearInterval(tick); lock?.release?.().catch(() => {}); watch = null; };
      d.addEventListener("close", stop);
      const draw = () => {
        $("steps").textContent = steps().toLocaleString();
        $("km").textContent = km(meters);
        const sec = started ? Math.round((Date.now() - started) / 1000) : 0;
        $("time").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
        $("bar").style.width = `${Math.min(100, (steps() / target) * 100)}%`;
      };
      const onFix = (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        $("gps").textContent = `GPS ±${Math.round(accuracy)} m`;
        if (accuracy > MAX_ACCURACY) return;
        const here = { lat, lng, t: p.timestamp };
        if (last) {
          const dm = distanceMeters(last, here), dt = Math.max(0.5, (here.t - last.t) / 1000);
          if (dm < MIN_STEP_M) return; // standing still: GPS wander isn't distance
          if (dm / dt <= MAX_SPEED) meters += dm;
        }
        last = here;
        const n = Math.floor(steps() / 1000);
        if (n > marks) { marks = n; coachSay(s, d, jogMark(steps(), target, Date.now())); }
        draw();
      };
      d.querySelector("[data-go]").addEventListener("click", async (e) => {
        if (watch != null) { const res = { meters: Math.round(meters), steps: steps(), minutes: Math.round((Date.now() - started) / 60000), tracked: true }; stop(); return close(res); }
        if (!("geolocation" in navigator)) return coachSay(s, d, jogNoFix());
        started = Date.now();
        e.currentTarget.textContent = "Done";
        coachSay(s, d, jogStart(target, Date.now()));
        try { lock = await navigator.wakeLock?.request("screen"); } catch { /* the screen may sleep; keep it on by hand */ }
        watch = navigator.geolocation.watchPosition(onFix, () => { $("gps").textContent = "No GPS"; coachSay(s, d, jogNoFix()); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        tick = setInterval(draw, 1000);
      });
      d.querySelector("[data-manual]").addEventListener("click", async () => {
        stop();
        const n = await promptSheet({ title: "Steps from your counter", type: "number", value: "", confirm: "Use these", hint: "From your phone's or watch's step count. Paid as your word." });
        const v = Math.round(Number(n));
        close(v > 0 ? { steps: v, manual: true } : null);
      });
    },
  });
}
