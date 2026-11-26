// Today's steps from the native shell's Health Connect plugin, for Train only.
// The permission prompt is asked at most once per page load, when Train opens.
// On the plain web health() is null and this returns null, so nothing changes.

import { health, readDelta } from "../data/health.js";
import { STEPS_PER_VIT } from "../core/steps.js";
import { html } from "./dom.js";

let asked = false;

/** {available, granted, steps, meters} for local midnight until now, or null without the plugin. */
export async function healthToday(now = new Date()) {
  const plugin = health();
  if (!plugin) return null;
  let st = null;
  try {
    st = await plugin.status();
  } catch {
    return { available: false, granted: false, steps: 0, meters: null };
  }
  // Ask again when workouts aren't allowed either: without them a watch workout can't count.
  if ((!st?.granted || (st?.available && !st?.exercise)) && !asked) {
    asked = true;
    try { await plugin.requestPermissions(); } catch {}
    try { st = await plugin.status(); } catch {}
  }
  if (!st?.available) return { available: false, granted: false, steps: 0, meters: null };
  if (!st.granted) return { available: true, granted: false, steps: 0, meters: null };
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  try {
    const d = await readDelta(plugin, start.toISOString(), now.toISOString());
    return { available: true, granted: true, steps: d.steps, meters: d.meters };
  } catch {
    return { available: true, granted: false, steps: 0, meters: null };
  }
}

/** The Train card. undefined/null (not read yet, or plain web) renders nothing. */
export function healthCard(h) {
  if (h == null) return "";
  if (!h.available || !h.granted || (h.steps === 0 && h.meters == null)) {
    return html`<section class="health-card">
      <p class="muted small">Check OHealth is sharing steps with Health Connect</p>
      <button class="btn small" data-hc-open>Open Health Connect</button>
    </section>`;
  }
  const km = h.meters == null ? "" : ` · ${(h.meters / 1000).toFixed(1)} km`;
  return html`<section class="health-card"><div>Today: ${h.steps.toLocaleString("en-AU")} steps${km} · +${Math.floor(h.steps / STEPS_PER_VIT)} VIT</div></section>`;
}

export function openHealthSettings() {
  try { health()?.openSettings(); } catch {}
}

/**
 * One line on what the last workout import did, for Train and Settings. When workouts
 * aren't allowed in Health Connect it says so, with a button (data-allow-workouts).
 */
export function workoutStatus(r) {
  if (!r || !health()) return "";
  if (r.note === "no-exercise-permission") {
    return html`<p class="notice small">Workouts can't count yet: allow workouts in Health Connect for Adventurer. <button type="button" class="btn small" data-allow-workouts>Allow workouts</button></p>`;
  }
  const when = new Date(r.at).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (r.note) return html`<p class="small muted">Last workout check (${when}): ${r.note}</p>`;
  const seen = r.seen ? `${r.seen} workout${r.seen === 1 ? "" : "s"} in the last 7 days (${(r.types || []).join(", ")})` : "no workouts in Health Connect for the last 7 days";
  const skipped = (r.skipped || []).length ? ` Skipped: ${r.skipped.join("; ")}.` : "";
  return html`<p class="small muted">Last workout check (${when}): ${seen}; ${r.logged} newly logged.${skipped}</p>`;
}
