// Focus mode for a writing box: the box takes the whole screen. The tab bar, the top bar and
// the rest of the page are hidden, the words sit in a comfortable column, and the browser's own
// full screen is asked for too where it exists (desktop, Android; not iPhone, which keeps its
// bars). Esc, the button again, or leaving full screen all bring the page back.
//
// On a phone the on-screen keyboard covers the bottom of the page without shrinking it, so the
// box follows the visible area (visualViewport) and the line you're typing stays in sight.
//
// Markup: a button with data-zen inside the box. wireZen(box) returns { enter, exit, active }.

import { icon } from "./icons.js";

export function wireZen(box, { onChange } = {}) {
  const btn = box.querySelector("[data-zen]");
  let on = false;
  let viaFullscreen = false;
  const vv = window.visualViewport;
  const fit = () => {
    if (!on || !vv) return;
    box.style.setProperty("--zen-h", `${vv.height}px`);
    box.style.setProperty("--zen-top", `${vv.offsetTop}px`);
  };
  const draw = () => {
    if (!btn) return;
    btn.innerHTML = icon(on ? "shrink" : "expand");
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Leave focus mode" : "Focus mode");
    btn.title = on ? "Leave focus mode (Esc)" : "Focus mode — the whole screen for writing";
  };
  const enter = () => {
    if (on) return;
    on = true;
    box.classList.add("zen");
    document.documentElement.classList.add("zen-on");
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement && matchMedia("(pointer: fine)").matches) {
      el.requestFullscreen({ navigationUI: "hide" }).then(() => { viaFullscreen = true; }).catch(() => {});
    }
    draw();
    if (box.dataset.mode !== "preview") box.querySelector("[data-code], textarea")?.focus();
    onChange?.(true);
  };
  const exit = () => {
    if (!on) return;
    on = false;
    box.classList.remove("zen");
    document.documentElement.classList.remove("zen-on");
    box.style.removeProperty("--zen-h");
    box.style.removeProperty("--zen-top");
    vv?.removeEventListener("resize", fit);
    vv?.removeEventListener("scroll", fit);
    if (viaFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    viaFullscreen = false;
    draw();
    onChange?.(false);
  };
  const onFs = () => { if (viaFullscreen && !document.fullscreenElement) { viaFullscreen = false; exit(); } };
  const onKey = (e) => {
    // Esc closes CodeMirror's search or the Aa panel first; only a bare Esc leaves focus mode.
    if (e.key !== "Escape" || !on || e.defaultPrevented) return;
    if (box.querySelector(".cm-search, .fmt-panel, .cm-tooltip-autocomplete")) return;
    exit();
  };
  btn?.addEventListener("click", (e) => { e.preventDefault(); on ? exit() : enter(); });
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("keydown", onKey);
  draw();
  return {
    enter, exit,
    get active() { return on; },
    destroy() { exit(); document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("keydown", onKey); },
  };
}
