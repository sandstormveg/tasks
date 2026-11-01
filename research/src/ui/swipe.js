// Swiping between pages: the main tabs (Today, Timeline, Photos, Search,
// Reflect) and, on a past day's page, the days either side. The page follows
// your finger; let go past about a quarter of the screen (or flick) and it
// slides away while the next one slides in; otherwise it springs back. Where
// there's nowhere to go it only gives a little.
//
// Left alone, so swiping never fights with them: vertical scrolling (the
// gesture locks to one direction early), anything that scrolls sideways
// (chips, photo strips), a text field you're typing in, open sheets, the photo
// viewer (which has its own swipe), and the screen edges (the phone's back gesture).

const LOCK = 10; // px of movement before deciding horizontal vs vertical
const EDGE = 24; // px from either screen edge left to the system
const COMMIT = 0.28; // fraction of the width that commits a swipe
const FLICK = 0.45; // px/ms that commits a shorter swipe
const RESIST = 0.25; // how far the page gives where there's nowhere to go

function scrollsSideways(el) {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const o = getComputedStyle(el).overflowX;
  return o === "auto" || o === "scroll";
}

/** Should a touch starting here be left to the element itself? */
export function leaveAlone(target, root) {
  if (target.closest("select, input[type=range], [contenteditable], [data-no-swipe], dialog, .lightbox")) return true;
  const field = target.closest("input, textarea");
  if (field && field === document.activeElement) return true; // typing: don't steal the drag
  for (let el = target; el && el !== root; el = el.parentElement) if (scrollsSideways(el)) return true;
  return false;
}

/**
 * content: the element holding the current page (its child .view moves).
 * neighbours(): { prev, next } — where a right / left swipe goes (null: nowhere).
 * go(target, dir): navigate; dir is "next" (came from the right) or "prev".
 */
export function enableSwipe({ content, neighbours, go }) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let g = null; // the gesture in progress

  addEventListener("touchstart", (e) => {
    g = null;
    if (e.touches.length !== 1 || document.querySelector("dialog[open], .lightbox")) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
    if (!content.contains(e.target) || leaveAlone(e.target, content)) return;
    const n = neighbours();
    if (!n.prev && !n.next) return;
    const el = content.querySelector(":scope > .view");
    if (!el) return;
    g = { x0: t.clientX, y0: t.clientY, n, el, dx: 0, lock: null, lastX: t.clientX, lastT: e.timeStamp, v: 0 };
  }, { passive: true });

  addEventListener("touchmove", (e) => {
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    if (g.lock === null) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      g.lock = Math.abs(dx) > Math.abs(dy) * 1.5;
      if (!g.lock) { g = null; return; } // vertical: it's a scroll
      g.el.style.transition = "none";
    }
    e.preventDefault();
    const dt = Math.max(1, e.timeStamp - g.lastT);
    g.v = (t.clientX - g.lastX) / dt;
    g.lastX = t.clientX;
    g.lastT = e.timeStamp;
    g.dx = (dx < 0 ? g.n.next : g.n.prev) ? dx : dx * RESIST;
    if (!reduce.matches) g.el.style.transform = `translateX(${g.dx}px)`;
  }, { passive: false });

  const settle = (el) => {
    el.style.transition = "transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)";
    el.style.transform = "";
  };

  addEventListener("touchend", () => {
    const s = g;
    g = null;
    if (!s?.lock) return;
    const dir = s.dx < 0 ? "next" : "prev";
    const target = s.n[dir];
    const far = Math.abs(s.dx) > innerWidth * COMMIT
      || (Math.abs(s.dx) > 30 && Math.abs(s.v) > FLICK && Math.sign(s.v) === Math.sign(s.dx));
    if (!target || !far) return settle(s.el);
    if (reduce.matches) return go(target, dir);
    s.el.style.transition = "transform 170ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 170ms";
    s.el.style.transform = `translateX(${dir === "next" ? -innerWidth : innerWidth}px)`;
    s.el.style.opacity = "0.3";
    setTimeout(() => go(target, dir), 150);
  }, { passive: true });

  addEventListener("touchcancel", () => {
    if (g?.lock) settle(g.el);
    g = null;
  }, { passive: true });
}
