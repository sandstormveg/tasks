// Fetch captions and a summary only from the user's local, loopback-bound helper;
// keep replacement decisions pure.

const ID = /^[A-Za-z0-9_-]{11}$/;
const BASE = "http://127.0.0.1:47615";

/** The words the app uses when the helper on the PC isn't running (it never is on a phone). */
export const HELPER_DOWN_MESSAGE = "Transcript and summary come from the helper on your PC. The PC's 15-minute job will fill these in automatically.";

// One progress line while a pasted link turns into a transcript and a summary.
const ADD_PROGRESS = {
  transcript: "Getting transcript…",
  summary: "Summarising (can take a couple of minutes)…",
  done: "Transcript and summary saved.",
};

/** The one progress line for a step of the add flow: transcript, summary, done. */
export function addProgress(step) {
  return ADD_PROGRESS[step] || "";
}

/** Why a transcript fetch failed, in words that suggest what to do next. */
export function transcriptProblem(result) {
  switch (result?.reason) {
    case "no-captions": return "No captions were found for this video. You can paste a transcript instead.";
    case "invalid-id": return "That doesn't look like a YouTube video link.";
    case "unavailable":
    case "service-error": return "Transcript and summary come from the helper on your PC. Start it, or paste a transcript instead.";
    default: return "Couldn't fetch this transcript. You can paste it instead.";
  }
}

/** Why a summary request failed. A 502 carries the helper's own reason. */
export function summaryProblem(result) {
  switch (result?.reason) {
    case "no-captions": return "The PC helper found no captions for this video.";
    case "summary-failed": return `The PC helper couldn't summarise this video${result.detail ? `: ${result.detail}` : "."}`;
    case "invalid-id": return "That doesn't look like a YouTube video link.";
    case "unavailable":
    case "service-error": return HELPER_DOWN_MESSAGE;
    default: return "The PC helper couldn't summarise this video.";
  }
}

export function transcriptEndpoint(videoId) {
  return ID.test(String(videoId || "")) ? BASE + "/transcript?v=" + encodeURIComponent(videoId) : null;
}

export function summaryEndpoint(videoId) {
  return ID.test(String(videoId || "")) ? BASE + "/summary?v=" + encodeURIComponent(videoId) : null;
}

/** Read the helper's "why" from a failed summary without throwing on a body-less response. */
async function whyFailed(response) {
  try {
    if (typeof response.text !== "function") return "";
    const text = String(await response.text()).trim();
    if (!text) return "";
    try {
      const body = JSON.parse(text);
      return String(body.why || body.error || body.message || "").trim().slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

export async function fetchTranscript(videoId, { fetchImpl = globalThis.fetch } = {}) {
  const url = transcriptEndpoint(videoId);
  if (!url) return { ok: false, reason: "invalid-id" };
  try {
    const response = await fetchImpl(url);
    if (response.status === 404) return { ok: false, reason: "no-captions" };
    if (response.status === 400) return { ok: false, reason: "invalid-id" };
    if (!response.ok) return { ok: false, reason: "service-error" };
    const data = await response.json();
    if (data?.videoId !== videoId || !Array.isArray(data.lines) || !String(data.text || "").trim()) {
      return { ok: false, reason: "invalid-response" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Ask the PC helper for a summary. It can take a couple of minutes: local Qwen first,
 * then OpenRouter. 404 means it found no captions; 502 means it tried and failed, and
 * says why. Never throws: "unavailable" means this device can't see the helper.
 */
export async function fetchSummary(videoId, { fetchImpl = globalThis.fetch } = {}) {
  const url = summaryEndpoint(videoId);
  if (!url) return { ok: false, reason: "invalid-id" };
  try {
    const response = await fetchImpl(url);
    if (response.status === 404) return { ok: false, reason: "no-captions" };
    if (response.status === 400) return { ok: false, reason: "invalid-id" };
    if (response.status === 502) return { ok: false, reason: "summary-failed", detail: await whyFailed(response) };
    if (!response.ok) return { ok: false, reason: "service-error" };
    const data = await response.json();
    if (data?.videoId !== videoId || !String(data.summary || "").trim()) return { ok: false, reason: "invalid-response" };
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Return a source update only after an explicit choice to replace existing text. */
export function prepareTranscriptUpdate(source, fetched, { confirmReplacement = false } = {}) {
  if (!fetched?.ok) return { ok: false, reason: fetched?.reason || "invalid-response" };
  const text = String(fetched.data?.text || "").trim();
  if (!text) return { ok: false, reason: "no-captions" };
  const previous = String(source.transcript || "");
  if (previous.trim() && !confirmReplacement) return { ok: false, needsConfirmation: true };
  return {
    ok: true,
    record: { ...source, transcript: text, transcriptSource: "youtube-captions" },
    previous: previous.trim() ? { ...source, transcript: previous } : null,
  };
}
