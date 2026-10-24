// Recognise pasted conversations ("You: …", "ChatGPT said: …", "Claude: …")
// so your words and the AI's are stored as different voices.

const SELF = /^(you|user|me|human|tôi|mình)(\s+said)?\s*:\s?/i;
const AI = /^(chatgpt|gpt-?\d*\w*|claude|assistant|ai|gemini|copilot|bot)(\s+said)?\s*:\s?/i;

export function parseConversation(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const turns = [];
  let cur = null;
  for (const line of lines) {
    const s = line.trim();
    let role = null, rest = s;
    if (SELF.test(s)) { role = "self"; rest = s.replace(SELF, ""); }
    else if (AI.test(s)) { role = "ai"; rest = s.replace(AI, ""); }
    if (role) {
      if (cur) turns.push(cur);
      cur = { role, text: rest };
    } else if (cur) {
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  if (cur) turns.push(cur);
  for (const t of turns) t.text = t.text.replace(/\s+$/, "").replace(/^\n+/, "");
  const roles = new Set(turns.map((t) => t.role));
  return roles.size === 2 ? turns.filter((t) => t.text) : [];
}
