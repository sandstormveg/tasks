// Pre-rendered character voices. Piper, a free offline text-to-speech engine, renders
// each character's fixed lines once on the desktop (tools/render-voices.mjs): one small
// Opus clip per sentence, shipped in voices/ and cached on first play. Numbers get
// their own short sentences ("10 push-ups.", "Level 4!") so a line plays as a chain of
// clips. A line with any sentence that has no clip is said by the device voice instead.
// The same file lives in Adventurer (sandstormveg/Adventurer) for Joy and Sergeant Brass.

export const PACKS = {
  marginalia: {
    name: "Marginalia",
    voices: [
      { id: "alba", label: "Alba · Scottish", model: "en_GB-alba-medium" },
      { id: "prudence", label: "Prudence · British", model: "en_GB-semaine-medium", speaker: "prudence" },
      { id: "obadiah", label: "Obadiah · British", model: "en_GB-semaine-medium", speaker: "obadiah" },
    ],
    preview: ["Ah. A new reader. What can we discover?", "Every margin is an invitation.", "The Deposit is empty. I dusted it anyway."],
  },
  quicksilver: {
    name: "Quicksilver",
    voices: [
      { id: "poppy", label: "Poppy · British", model: "en_GB-semaine-medium", speaker: "poppy" },
      { id: "lessac", label: "Lessac · American", model: "en_US-lessac-medium" },
      { id: "southern", label: "Southern · British", model: "en_GB-southern_english_female-low" },
    ],
    preview: ["Hello there. Pour it out, and we'll see what crystallises.", "Evening. Time to distil the day.", "No wrong answers. Only interesting ones."],
  },
};

/** A line split into sentences, the unit a clip covers. */
export const sentences = (text) => String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);

/** A clip's file name: FNV-1a of the sentence, 8 hex digits. */
export function clipKey(sentence) {
  let h = 0x811c9dc5;
  for (const c of String(sentence).replace(/\s+/g, " ").trim()) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** "joy:cori" → the clips for a line, or null when any sentence has none. index: {char: {voice: Set(keys)}}. */
export function clipPaths(index, pack, text) {
  const [who, voice] = String(pack || "").split(":");
  const have = index?.[who]?.[voice];
  const parts = sentences(text);
  if (!have || !parts.length) return null;
  const keys = parts.map(clipKey);
  return keys.every((k) => have.has(k)) ? keys.map((k) => `voices/${who}/${voice}/${k}.ogg`) : null;
}
