// Pre-rendered character voices. Piper, a free offline text-to-speech engine, renders
// each character's fixed lines once on the desktop (tools/render-voices.mjs): one small
// Opus clip per sentence, shipped in voices/ and cached on first play. Numbers get
// their own short sentences ("10 push-ups.", "Level 4!") so a line plays as a chain of
// clips. A line with any sentence that has no clip is said by the device voice instead.
// The same file lives in Journal_system for Marginalia and Quicksilver.

export const PACKS = {
  joy: {
    name: "Joy",
    voices: [
      { id: "cori", label: "Cori · British", model: "en_GB-cori-high" },
      { id: "jenny", label: "Jenny · British", model: "en_GB-jenny_dioco-medium" },
      { id: "amy", label: "Amy · American", model: "en_US-amy-medium" },
    ],
    preview: ["Ooh, good pick. Yours now. No refunds.", "Stamped! Look at you.", "Level 4! Ding!"],
  },
  brass: {
    name: "Sergeant Brass",
    voices: [
      { id: "northern", label: "Northern · British", model: "en_GB-northern_english_male-medium" },
      { id: "alan", label: "Alan · British", model: "en_GB-alan-medium" },
      { id: "ryan", label: "Ryan · American", model: "en_US-ryan-high" },
    ],
    preview: ["10 push-ups. On my count. Begin.", "7. Keep that form.", "Rest. Breathe. Shake it out."],
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
