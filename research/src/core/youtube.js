// Pure YouTube helpers ported from Cybertube; these work in the browser and in Node tests.

export function extractYouTubeVideoId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const pathMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/);
  if (pathMatch?.[1]) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (queryMatch?.[1]) return queryMatch[1];
  if (trimmed.includes("youtube") || trimmed.includes("youtu.be")) {
    const genericMatch = trimmed.match(/([a-zA-Z0-9_-]{11})/);
    if (genericMatch?.[1]) return genericMatch[1];
  }
  return null;
}

export function getYouTubeThumbnail(videoId) {
  return {
    maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
  };
}

export function formatSingleInsight(insight) {
  const categoryTag = insight.category ? `[${insight.category.toUpperCase()}] ` : "";
  const timestampTag = insight.timestamp ? `(${insight.timestamp}) ` : "";
  let output = `• ${categoryTag}${timestampTag}${insight.point}`;
  if (insight.detail) output += `\n  ↳ ${insight.detail}`;
  if (insight.quote) output += `\n  " ${insight.quote} "`;
  return output;
}

export function formatInsightsAsMarkdown(data) {
  const lines = [
    "================================================================",
    "CYBER-TUBE '93 // VIDEO INTELLIGENCE DOSSIER",
    `TITLE: ${data.title}`,
    `SOURCE: ${data.url}`,
    `TIMESTAMP: ${data.analyzedAt || new Date().toISOString()}`,
    "================================================================\n",
    "[ EXECUTIVE SUMMARY ]",
    `${data.executiveSummary}\n`,
    `[ KEY INSIGHTS (${data.keyInsights.length} POINTS) ]`,
  ];
  data.keyInsights.forEach((item, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    lines.push(`[#${num}] ${item.category ? `[${item.category.toUpperCase()}] ` : ""}${item.point}`);
    if (item.detail) lines.push(`     ↳ ${item.detail}`);
    if (item.quote) lines.push(`     "${item.quote}"`);
    lines.push("");
  });
  if (data.takeaways?.length) {
    lines.push("[ CORE TAKEAWAYS & ACTION ITEMS ]");
    data.takeaways.forEach((item) => lines.push(`  [✓] ${item}`));
    lines.push("");
  }
  if (data.keywords?.length) {
    lines.push("[ TAGS / KEYWORDS ]");
    lines.push(`  ${data.keywords.map((word) => `#${word.replace(/\s+/g, "_")}`).join(" ")}\n`);
  }
  lines.push("----------------------------------------------------------------", "PRODUCED BY CYBER-TUBE '93 TERMINAL");
  return lines.join("\n");
}

export function searchTranscript(transcript, query) {
  if (!transcript || !query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return transcript.split("\n").flatMap((line, index) =>
    line.toLowerCase().includes(q) ? [{ line: line.trim(), lineNumber: index + 1 }] : []);
}
