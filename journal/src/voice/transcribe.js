// Transcription engines behind one small interface, so you can change
// provider without changing the journal (design doc §5: "a replaceable
// interface between the journal and whichever engine you choose").
//
//   webspeech — the browser's built-in live dictation. Free, no key. Audio is
//               processed by the browser vendor's speech service (Apple on
//               iPhone, Google in Chrome). Text appears as you speak.
//   api       — any OpenAI-compatible /audio/transcriptions endpoint
//               (OpenAI gpt-4o-transcribe / whisper-1, Groq whisper-large-v3,
//               a self-hosted whisper server…). Records first, transcribes after,
//               so it works offline and catches up later.
//   none      — record only; transcribe whenever an engine is set up.

export const LANGS = { auto: "Auto", en: "English", vi: "Tiếng Việt" };

export function webSpeechSupported() {
  return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
}

export function resolveEngine(settings, secrets) {
  const t = settings.transcription || {};
  if (t.engine === "none") return "none";
  if (t.engine === "api") return secrets.transcriptionKey || isLocalEndpoint(t.endpoint) ? "api" : "none";
  if (t.engine === "webspeech") return webSpeechSupported() ? "webspeech" : "none";
  // auto
  if (secrets.transcriptionKey) return "api";
  if (webSpeechSupported()) return "webspeech";
  return "none";
}

function isLocalEndpoint(url) {
  try { const u = new URL(url); return ["localhost", "127.0.0.1"].includes(u.hostname); } catch { return false; }
}

export function speechLang(lang) {
  if (lang === "vi") return "vi-VN";
  if (lang === "en") return "en-US";
  return globalThis.navigator?.language || "en-US";
}

export function engineDescription(engine, settings) {
  if (engine === "webspeech") return "Live dictation by your browser's speech service (free). Audio is processed by your browser's vendor.";
  if (engine === "api") {
    let host = "your transcription service";
    try { host = new URL(settings.transcription.endpoint).host; } catch { /* keep default */ }
    return `Records on this device, then transcribes with ${host} (${settings.transcription.model}).`;
  }
  return "Records audio only — transcribe later once an engine is set up in Settings → Voice.";
}

/**
 * Live dictation. Returns {start(), stop() -> Promise<text>, abort()}.
 * onText(finalText, interimText) is called as words arrive.
 */
export function createLiveDictation({ lang = "auto", onText, onError } = {}) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR) throw new Error("This browser has no built-in dictation.");
  const rec = new SR();
  rec.lang = speechLang(lang);
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  let interim = "";
  let stopping = false;
  let resolveStop;
  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += (finalText && !/\s$/.test(finalText) ? " " : "") + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    onText?.(finalText, interim);
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    onError?.(new Error(e.error === "not-allowed" ? "Microphone or dictation permission was denied." : `Dictation error: ${e.error}`));
  };
  rec.onend = () => {
    // Browsers stop dictation after silences; keep going until the user stops.
    if (!stopping) { try { rec.start(); } catch { /* already started */ } return; }
    resolveStop?.((finalText + (interim ? " " + interim : "")).trim());
  };
  return {
    start() { stopping = false; rec.start(); },
    stop() { stopping = true; return new Promise((r) => { resolveStop = r; try { rec.stop(); } catch { r(finalText.trim()); } }); },
    abort() { stopping = true; try { rec.abort(); } catch { /* ignore */ } },
  };
}

/** Transcribe a recorded blob with an OpenAI-compatible endpoint. */
export async function transcribeWithApi(blob, { endpoint, model, key, language = "auto", prompt } = {}) {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : "webm";
  form.append("file", blob, `voice-note.${ext}`);
  form.append("model", model || "gpt-4o-transcribe");
  if (language && language !== "auto") form.append("language", language);
  if (prompt) form.append("prompt", prompt);
  form.append("response_format", "json");
  let res;
  try {
    res = await fetch(endpoint, { method: "POST", headers: key ? { Authorization: `Bearer ${key}` } : {}, body: form });
  } catch {
    const err = new Error("Couldn't reach the transcription service (offline?). The audio is saved; transcribe it later from the entry.");
    err.offline = true;
    throw err;
  }
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).error?.message || ""; } catch { /* no body */ }
    throw new Error(`Transcription failed (${res.status})${msg ? `: ${msg}` : ""}`);
  }
  const j = await res.json();
  return { text: String(j.text || "").trim(), language: j.language };
}
