// Fetch captions only from the user's local, loopback-bound helper; keep replacement decisions pure.

const ID = /^[A-Za-z0-9_-]{11}$/;
const BASE = "http://127.0.0.1:47615";

export function transcriptEndpoint(videoId) {
  return ID.test(String(videoId || "")) ? BASE + "/transcript?v=" + encodeURIComponent(videoId) : null;
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
