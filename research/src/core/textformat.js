// Text formatting you can apply with the Aa button: bold, italic, a size and a colour.
// It is stored as light markup inside the text itself, so the files stay plain text
// that the CLI, agents and any editor can read:
//
//   **bold**   *italic*   [these words]{.red .large}
//
// The bracketed span is the Pandoc/Markdown "attributes" convention. Only the classes
// below mean anything; anything else is left as written. Sizes are relative (M is
// the default, so it has no class) and colours map to theme tokens, so they read
// well in every theme. Pure functions, no DOM.

export const SIZES = [["small", "S"], ["", "M"], ["large", "L"], ["xl", "XL"]];
export const COLOURS = [["red", "Red"], ["orange", "Orange"], ["yellow", "Yellow"], ["green", "Green"], ["purple", "Purple"], ["grey", "Grey"]];
const SIZE_SET = new Set(SIZES.map(([k]) => k).filter(Boolean));
const COLOUR_SET = new Set(COLOURS.map(([k]) => k));
export const isFormatClass = (c) => SIZE_SET.has(c) || COLOUR_SET.has(c);

// [label]{.a .b} — the label can't contain brackets or a line break.
export const SPAN_RE = /\[([^\[\]\n]+)\]\{((?:\s*\.[a-z]+)+)\s*\}/g;
const classesOf = (attr) => attr.trim().split(/\s+/).map((c) => c.replace(/^\./, "")).filter(Boolean);
const spanOf = (label, classes) => (classes.length ? `[${label}]{${classes.map((c) => `.${c}`).join(" ")}}` : label);

/** The text with formatting markup removed: for excerpts, search and anywhere plain is wanted. */
export function stripFormat(text) {
  return String(text || "")
    .replace(SPAN_RE, (m, label, attr) => (classesOf(attr).some(isFormatClass) ? label : m))
    .replace(/\*\*([^*\n]+)\*\*/g, "$1");
}

/** Does this text use any of the Aa formatting (so a short field is worth previewing)? */
export function hasFormat(text) {
  const s = String(text || "");
  if (/\*\*[^*\n]+\*\*|(^|[^\w*])\*[^*\n]+\*(?!\w)/.test(s)) return true;
  for (const m of s.matchAll(SPAN_RE)) if (classesOf(m[2]).some(isFormatClass)) return true;
  return false;
}

/**
 * Apply one formatting change to the selection [start, end) of `value`.
 * fmt is one of { bold: true }, { italic: true }, { size: "large" | "" }, { colour: "red" | "" }, { clear: true }.
 * Returns { value, start, end } with the selection still around the same words.
 * With nothing selected it changes nothing (it never inserts words of its own), except that
 * size, colour or clear with the cursor inside a formatted span act on that span.
 */
export function applyFormat(value, start, end, fmt) {
  value = String(value ?? "");
  start = Math.max(0, Math.min(start ?? 0, value.length));
  end = Math.max(start, Math.min(end ?? start, value.length));

  // A span already around (or exactly on) the selection is edited in place.
  let span = null;
  for (const m of value.matchAll(SPAN_RE)) {
    const s0 = m.index, s1 = m.index + m[0].length, l0 = s0 + 1, l1 = l0 + m[1].length;
    const classes = classesOf(m[2]);
    if (!classes.some(isFormatClass)) continue;
    if ((start >= l0 && end <= l1) || (start === s0 && end === s1)) { span = { s0, s1, l0, l1, label: m[1], classes }; break; }
  }

  if (start === end && !(span && !fmt.bold && !fmt.italic)) return { value, start, end, empty: true };

  if (fmt.bold || fmt.italic) {
    const mark = fmt.bold ? "**" : "*";
    const before = value.slice(Math.max(0, start - mark.length), start), after = value.slice(end, end + mark.length);
    // Already wrapped (and, for italic, not actually bold): unwrap.
    if (start < end && before === mark && after === mark && (fmt.bold || (value[start - 2] !== "*" && value[end + 1] !== "*"))) {
      return { value: value.slice(0, start - mark.length) + value.slice(start, end) + value.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
    }
    const words = value.slice(start, end);
    // Keep surrounding spaces outside the marks, or Markdown won't see them.
    const lead = words.match(/^\s*/)[0], trail = words.match(/\s*$/)[0], core = words.trim();
    if (!core) return { value, start, end, empty: true };
    const out = value.slice(0, start) + lead + mark + core + mark + trail + value.slice(end);
    const s = start + lead.length + mark.length;
    return { value: out, start: s, end: s + core.length };
  }

  if (fmt.clear) {
    if (span) return { value: value.slice(0, span.s0) + span.label + value.slice(span.s1), start: span.s0, end: span.s0 + span.label.length };
    const plain = stripFormat(value.slice(start, end)).replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1$2");
    return { value: value.slice(0, start) + plain + value.slice(end), start, end: start + plain.length };
  }

  const keep = (classes) => classes.filter((c) => (fmt.size !== undefined ? !SIZE_SET.has(c) : true) && (fmt.colour !== undefined ? !COLOUR_SET.has(c) : true));
  const add = [fmt.size, fmt.colour].filter((c) => c && isFormatClass(c));
  if (span) {
    const classes = [...keep(span.classes), ...add];
    const out = spanOf(span.label, classes);
    const l0 = classes.length ? span.s0 + 1 : span.s0;
    return { value: value.slice(0, span.s0) + out + value.slice(span.s1), start: l0, end: l0 + span.label.length };
  }
  if (!add.length) return { value, start, end }; // "M" or "no colour" on plain text: nothing to do
  const words = value.slice(start, end);
  if (/[\[\]\n]/.test(words)) return { value, start, end }; // can't span brackets or lines; leave it
  const lead = words.match(/^\s*/)[0], trail = words.match(/\s*$/)[0], core = words.trim();
  if (!core) return { value, start, end, empty: true };
  const out = value.slice(0, start) + lead + spanOf(core, add) + trail + value.slice(end);
  const s = start + lead.length + 1;
  return { value: out, start: s, end: s + core.length };
}

// ── Whole-pin style on the corkboard ─────────────────────────────────────────────────
// A pin is styled as a whole, from the board's Aa inspector, and the style is kept as
// its own field (pin.style) rather than as markup in its words. size is a preset name or a
// number of px; fit is "auto" (text scales to fill the card) or "fixed", and when it's absent
// the pin follows the board setting "Auto-size pin text".

export const PIN_FONTS = [["", "Serif"], ["sans", "Sans"], ["type", "Typewriter"], ["hand", "Hand"]];
export const PIN_ALIGNS = [["", "Left"], ["center", "Centre"], ["right", "Right"]];
const FONT_SET = new Set(PIN_FONTS.map(([k]) => k).filter(Boolean));
// Pin text sizes in px: the presets are quick picks; any whole size in [PIN_MIN_PX, PIN_MAX_PX] works too.
export const PIN_BASE_PX = 13;
export const PIN_MIN_PX = 10;
export const PIN_MAX_PX = 72;
export const PIN_PRESET_PX = { small: 11, "": 13, large: 16, xl: 21 };
/** The text size in px a pin's style asks for (a preset or a number). */
export const pinTextPx = (st) => (typeof st?.size === "number" ? st.size : PIN_PRESET_PX[st?.size || ""] ?? PIN_BASE_PX);
const ALIGN_SET = new Set(PIN_ALIGNS.map(([k]) => k).filter(Boolean));

/** Only the style keys and values the app knows; undefined when nothing is left. */
export function cleanPinStyle(st) {
  if (!st || typeof st !== "object") return undefined;
  const out = {};
  if (SIZE_SET.has(st.size)) out.size = st.size;
  else if ((typeof st.size === "number" && Number.isFinite(st.size)) || /^\d+(\.\d+)?$/.test(st.size ?? "")) out.size = Math.max(PIN_MIN_PX, Math.min(PIN_MAX_PX, Math.round(Number(st.size))));
  if (st.fit === "auto" || st.fit === "fixed") out.fit = st.fit;
  if (COLOUR_SET.has(st.colour)) out.colour = st.colour;
  if (FONT_SET.has(st.font)) out.font = st.font;
  if (ALIGN_SET.has(st.align)) out.align = st.align;
  if (st.bold === true) out.bold = true;
  if (st.italic === true) out.italic = true;
  return Object.keys(out).length ? out : undefined;
}

// The old Aa put the word "text" in when nothing was selected. A formatted span "[text]{…}" is
// that placeholder; so is a bold or italic "text" run straight into the next word ("**text**Does").
const PLACEHOLDER_RE = /\[(?:\*\*|\*)?text(?:\*\*|\*)?\]\{(?:\s*\.[a-z]+)+\s*\}|\*\*text\*\*(?=\w)|(?<![\w*])\*text\*(?=\w)/g;

/**
 * Move formatting markup out of a pin's words. A placeholder "text" goes; text that is
 * formatted as a whole becomes the pin's style; any other spans are unwrapped, keeping
 * every word. Bold and italic stay as written in notes (they're Markdown there).
 * Returns the patch { title, body, style } or null when there's nothing to move.
 */
export function migratePinMarkup(pin) {
  const has = (t) => typeof t === "string" && (PLACEHOLDER_RE.test(t) || [...t.matchAll(SPAN_RE)].some((m) => classesOf(m[2]).some(isFormatClass)));
  const check = (t) => { PLACEHOLDER_RE.lastIndex = 0; const r = has(t); PLACEHOLDER_RE.lastIndex = 0; return r; };
  if (!check(pin.title) && !check(pin.body)) return null;
  const style = { ...(pin.style || {}) };
  const fix = (t) => {
    if (typeof t !== "string") return t;
    let v = t.replace(PLACEHOLDER_RE, "");
    const whole = v.trim().match(/^\[([^\[\]\n]+)\]\{((?:\s*\.[a-z]+)+)\s*\}$/);
    if (whole && classesOf(whole[2]).every(isFormatClass)) {
      for (const c of classesOf(whole[2])) { if (SIZE_SET.has(c)) style.size = c; else style.colour = c; }
      let label = whole[1];
      const b = label.match(/^\*\*([^*]+)\*\*$/);
      if (b && pin.kind !== "note") { style.bold = true; label = b[1]; }
      v = label;
    }
    return v.replace(SPAN_RE, (m, label, attr) => (classesOf(attr).some(isFormatClass) ? label : m));
  };
  return { title: fix(pin.title) || undefined, body: fix(pin.body) ?? pin.body, style: cleanPinStyle(style) };
}
