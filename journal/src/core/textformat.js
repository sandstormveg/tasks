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
 * With nothing selected, it inserts a placeholder word, selected, to type over.
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

  if (fmt.bold || fmt.italic) {
    const mark = fmt.bold ? "**" : "*";
    const before = value.slice(Math.max(0, start - mark.length), start), after = value.slice(end, end + mark.length);
    // Already wrapped (and, for italic, not actually bold): unwrap.
    if (start < end && before === mark && after === mark && (fmt.bold || (value[start - 2] !== "*" && value[end + 1] !== "*"))) {
      return { value: value.slice(0, start - mark.length) + value.slice(start, end) + value.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
    }
    const words = start < end ? value.slice(start, end) : "text";
    // Keep surrounding spaces outside the marks, or Markdown won't see them.
    const lead = words.match(/^\s*/)[0], trail = words.match(/\s*$/)[0], core = words.trim() || "text";
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
  const words = start < end ? value.slice(start, end) : "text";
  if (/[\[\]\n]/.test(words)) return { value, start, end }; // can't span brackets or lines; leave it
  const lead = words.match(/^\s*/)[0], trail = words.match(/\s*$/)[0], core = words.trim() || "text";
  const out = value.slice(0, start) + lead + spanOf(core, add) + trail + value.slice(end);
  const s = start + lead.length + 1;
  return { value: out, start: s, end: s + core.length };
}
