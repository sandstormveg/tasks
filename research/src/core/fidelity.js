// Speech cleanup that preserves meaning — and a checker that proves it.
//
// Three operations stay separate (design doc §5): transcription, editorial
// cleanup, interpretation. This module covers the middle one:
//
//   ruleCleanup(raw)          deterministic, offline: fillers, stutters, spacing.
//   checkFidelity(orig, new)  compares any cleanup (rules or AI) to what you
//                             actually said and flags meaning drift:
//                             removed hedges, added causes, lost negations,
//                             words you never used, heavy shortening.
//
// The doc's own example is a test case:
//   "I think I was frustrated, but I'm not entirely sure why."
//   good: "I think I was frustrated, although I'm not entirely sure why."  -> ok
//   bad:  "I was frustrated because I felt ignored."                       -> flagged

import { fold } from "./search.js";

const FILLERS_EN = ["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ehm", "hmm", "mm"];
const FILLERS_VI = ["ừm", "ờm", "ơ", "ờ ờ", "ừ ừ"];

// Function words where an immediate repetition is almost always a stutter.
const STUTTER_WORDS = new Set(["i", "the", "a", "an", "and", "to", "it", "we", "he", "she", "they", "my", "you",
  "so", "but", "in", "on", "of", "is", "was", "that's", "i'm", "it's", "này", "thì", "là", "và", "tôi", "mình"]);

/** Phrases that carry uncertainty. Removing one changes what you said. */
export const HEDGES = [
  "i think", "i guess", "i suppose", "i feel like", "i'm not sure", "im not sure", "not sure", "not entirely",
  "maybe", "perhaps", "probably", "possibly", "might", "kind of", "sort of", "somewhat", "seems", "seemed",
  "i don't know", "i dont know", "i wonder", "a bit", "a little", "apparently", "could be", "unsure",
  "có lẽ", "chắc là", "hình như", "không biết", "không chắc", "có thể", "hơi",
].map(fold);

/** Connectives that assert a cause or explanation. */
export const CAUSAL = [
  "because", "since", "so that", "due to", "which is why", "that's why", "thats why", "therefore", "as a result",
  "caused", "causes", "led to", "leads to", "the reason", "meaning that", "which meant",
  "vì", "bởi vì", "do đó", "cho nên", "nên", "tại vì", "vì vậy",
].map(fold);

export const NEGATIONS = ["not", "never", "no", "n't", "nobody", "nothing", "none", "neither", "nor", "without", "không", "chưa", "chẳng", "đừng"].map(fold);

const FUNCTION_WORDS = new Set(`a an the and or but so although though however while yet also too very just
i me my mine we us our you your he him his she her they them their it its this that these those there here
is are was were be been being am do does did done have has had having will would can could should shall may
to of in on at by for from with as into onto over under about than then when what which who whom whose
not no if because since also even still really quite rather much many more most some any all each every
it's i'm i've i'd that's there's don't didn't doesn't isn't wasn't can't won't
và là có không được cho với này đã đi rất thì mà để ở trong khi cũng như lại ra về vào nhưng từ đó còn`.split(/\s+/).map(fold));

function words(text) {
  return fold(text).match(/[\p{L}\p{N}']+/gu) || [];
}

function stem(w) {
  w = w.replace(/'s$/, "");
  for (const suf of ["ingly", "ing", "edly", "ed", "es", "ly", "s"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

function countPhrase(foldedText, phrase) {
  if (phrase === "n't") return (foldedText.match(/n't\b/g) || []).length;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}'])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}'])`, "gu");
  return (foldedText.match(re) || []).length;
}

/**
 * Deterministic cleanup of a raw transcript. Returns {text, changes[]}.
 * Conservative by design: it would rather leave a stutter than alter meaning.
 */
export function ruleCleanup(raw, { language = "auto" } = {}) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  const changes = [];
  if (!s) return { text: "", changes };
  const before = s;

  const fillers = [...FILLERS_EN, ...(language === "en" ? [] : FILLERS_VI)];
  for (const f of fillers) {
    const re = new RegExp(`(^|[\\s,.;!?])${f}(?:[,.]?)(?=\\s|$|[,.;!?])`, "giu");
    s = s.replace(re, (m, pre) => { changes.push(`removed filler "${f}"`); return pre; });
  }
  // Stutters: "I I think" -> "I think"; only for short function words.
  s = s.replace(/(^|\s)([\p{L}']+)(?:[\s,]+\2)+(?=[\s,.!?;:]|$)/giu, (m, pre, w) => {
    if (STUTTER_WORDS.has(w.toLowerCase())) { changes.push(`collapsed repeated "${w}"`); return pre + w; }
    return m;
  });
  // Spacing and punctuation tidying.
  s = s.replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])(?=[^\s\d])/g, "$1 ").replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[,;.\s]+/, "");
  if (language !== "vi") {
    s = s.replace(/(^|[\s(])i(?=[\s',.!?]|$)/g, "$1I").replace(/(^|[\s(])i'(m|ve|d|ll)\b/g, "$1I'$2");
  }
  s = s.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase());
  if (s && !/[.!?…"')\]]$/.test(s)) s += ".";
  if (s !== before && !changes.length) changes.push("tidied spacing and punctuation");
  return { text: s, changes: [...new Set(changes)] };
}

/**
 * Compare a cleaned version to the original. Returns
 *   {ok, warnings: [{type, severity, message, terms}], novel, dropped, ratio}
 * severity "warn" means: a person should look before this becomes the entry.
 */
export function checkFidelity(original, cleaned) {
  const fo = " " + fold(original) + " ";
  const fc = " " + fold(cleaned) + " ";
  const warnings = [];

  const lostHedges = HEDGES.filter((h) => countPhrase(fc, h) < countPhrase(fo, h));
  if (lostHedges.length) warnings.push({ type: "hedge-removed", severity: "warn", terms: lostHedges, message: `Removed uncertainty you expressed: ${lostHedges.map((h) => `"${h}"`).join(", ")}` });

  const addedCauses = CAUSAL.filter((c) => countPhrase(fc, c) > countPhrase(fo, c));
  if (addedCauses.length) warnings.push({ type: "cause-added", severity: "warn", terms: addedCauses, message: `Adds an explanation you didn't give: ${addedCauses.map((c) => `"${c}"`).join(", ")}` });

  const negO = NEGATIONS.reduce((n, w) => n + countPhrase(fo, w), 0);
  const negC = NEGATIONS.reduce((n, w) => n + countPhrase(fc, w), 0);
  if (negC < negO) warnings.push({ type: "negation-lost", severity: "warn", terms: [], message: `Has fewer negations ("not", "never", "không"…) than what you said — meaning may have flipped` });
  else if (negC > negO) warnings.push({ type: "negation-added", severity: "warn", terms: [], message: `Adds a negation you didn't say` });

  const ow = words(original);
  const cw = words(cleaned);
  const oStems = new Set(ow.map(stem));
  const oSet = new Set(ow);
  const novel = [...new Set(cw.filter((w) => !FUNCTION_WORDS.has(w) && w.length > 2 && !oSet.has(w) && !oStems.has(stem(w))))];
  const content = (arr) => arr.filter((w) => !FUNCTION_WORDS.has(w) && w.length > 2);
  const cStems = new Set(cw.map(stem));
  const dropped = [...new Set(content(ow).filter((w) => !cStems.has(stem(w)) && !FILLERS_EN.includes(w)))];
  const oContent = content(ow).length || 1;

  if (novel.length) {
    const share = novel.length / Math.max(1, content(cw).length);
    warnings.push({
      type: "novel-words", severity: share > 0.12 || novel.length > 4 ? "warn" : "info", terms: novel,
      message: `Uses words you didn't: ${novel.slice(0, 8).map((w) => `"${w}"`).join(", ")}${novel.length > 8 ? "…" : ""}`,
    });
  }
  if (dropped.length) {
    warnings.push({
      type: "dropped-words", severity: dropped.length / oContent > 0.15 ? "warn" : "info", terms: dropped,
      message: `Leaves out: ${dropped.slice(0, 8).map((w) => `"${w}"`).join(", ")}${dropped.length > 8 ? "…" : ""}`,
    });
  }
  const ratio = cw.length / Math.max(1, ow.length);
  if (ow.length >= 12 && ratio < 0.7) warnings.push({ type: "shortened", severity: "warn", terms: [], message: `About ${Math.round((1 - ratio) * 100)}% shorter than what you said — closer to a summary than a cleanup` });

  return { ok: !warnings.some((w) => w.severity === "warn"), warnings, novel, dropped, ratio };
}

/**
 * Word-level diff for display: [{op: "same"|"add"|"del", text}].
 * LCS over tokens (whitespace kept with the preceding word).
 */
export function wordDiff(a, b, maxTokens = 2500) {
  const ta = String(a || "").match(/\S+\s*/g) || [];
  const tb = String(b || "").match(/\S+\s*/g) || [];
  if (ta.length > maxTokens || tb.length > maxTokens) return [{ op: "del", text: a }, { op: "add", text: b }];
  const key = (t) => fold(t).replace(/[^\p{L}\p{N}']/gu, "");
  const ka = ta.map(key), kb = tb.map(key);
  const n = ta.length, m = tb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (op, text) => { const last = out[out.length - 1]; if (last && last.op === op) last.text += text; else out.push({ op, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { push("same", tb[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", ta[i]); i++; }
    else { push("add", tb[j]); j++; }
  }
  while (i < n) push("del", ta[i++]);
  while (j < m) push("add", tb[j++]);
  return out;
}

/** Short notes with no warnings can skip the review screen (design doc §5). */
export function canAutoApprove(original, cleaned, { maxWords = 45 } = {}) {
  const n = words(original).length;
  if (n > maxWords) return false;
  return checkFidelity(original, cleaned).warnings.every((w) => w.severity === "info" && w.type !== "novel-words");
}
