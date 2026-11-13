// The Strings block: how red string looks on every corkboard, and when it says what
// it means. Shared by the board's settings sheet and Settings → Corkboard, so the two
// can't drift apart. Saves one key at a time to the same settings object the board
// reads (corkString), the way corkAutoFit is saved.

import { html, on } from "../ui/dom.js";
import { STRING_TEXT, STRING_COLOURS, STRING_WIDTHS, STRING_SAGS, STRING_TEXT_SIZES, STRING_FONTS, stringLook } from "../core/boards.js";

const chips = (key, options, look, { shape = "" } = {}) => options.map(([value, label]) => {
  const selected = (look[key] || "") === (value || "");
  const cls = ["chip", selected ? "on" : "", shape].filter(Boolean).join(" ");
  return html`<button type="button" class="${cls}" data-str-set="${key}:${value}" aria-pressed="${selected}">${label}</button>`;
});

/** The Strings controls, as markup. Pass ctx.settings(). */
export function stringsBlock(settings) {
  const look = stringLook(settings?.corkString);
  return html`<div class="str-settings">
    <span class="label">Strings <span class="faint">— on every board</span></span>
    <p class="small faint" style="margin:2px 0 6px">Always shows a string's word beside it (never over a pin), Selected shows it only once you pick the string up, Never hides it. The word sits at the middle if it fits, otherwise it slides along the string to the nearest clear spot.</p>
    <span class="small">Connection text</span>
    <div class="chips" role="group" aria-label="When a string shows its text">${chips("text", Object.entries(STRING_TEXT), look)}</div>
    <span class="small">Colour</span>
    <div class="chips" role="group" aria-label="String colour">${STRING_COLOURS.map(([value, label]) => {
      const selected = look.colour === value;
      return html`<button type="button" class="chip str-swatch sc-${value} ${selected ? "on" : ""}" data-str-set="colour:${value}" aria-pressed="${selected}" aria-label="${label} string" title="${label}"><span></span></button>`;
    })}</div>
    <span class="small">Thickness</span>
    <div class="chips" role="group" aria-label="String thickness">${chips("width", STRING_WIDTHS, look)}</div>
    <span class="small">Curve</span>
    <div class="chips" role="group" aria-label="String curve">${chips("sag", STRING_SAGS, look)}</div>
    <span class="small">Text size</span>
    <div class="chips" role="group" aria-label="String text size">${chips("size", STRING_TEXT_SIZES, look)}</div>
    <span class="small">Text font</span>
    <div class="chips" role="group" aria-label="String text font">${STRING_FONTS.map(([value, label]) => {
      const selected = (look.font || "") === value;
      return html`<button type="button" class="chip ps-f-${value || "serif"} ${selected ? "on" : ""}" data-str-set="font:${value}" aria-pressed="${selected}">${label}</button>`;
    })}</div>
  </div>`;
}

/**
 * Make the block's chips work. `onSaved` runs after each save (the board redraws its
 * strings; Settings doesn't need to). Returns the handler's teardown-safe listener via `on`.
 */
export function wireStringsBlock(scope, ctx, onSaved = null) {
  on(scope, "click", "[data-str-set]", async (e, b) => {
    const [key, value = ""] = b.dataset.strSet.split(":");
    const next = { ...(ctx.settings().corkString || {}), [key]: value };
    await ctx.saveSettings({ corkString: next });
    paintChips(scope, ctx);
    if (onSaved) onSaved();
  });
}

/** Re-mark the chips from the saved settings (no re-render, so a sheet keeps its place). */
export function paintChips(scope, ctx) {
  const look = stringLook(ctx.settings().corkString);
  for (const b of scope.querySelectorAll("[data-str-set]")) {
    const [key, value = ""] = b.dataset.strSet.split(":");
    const selected = (look[key] || "") === (value || "");
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", String(selected));
  }
}
