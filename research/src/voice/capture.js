// The voice pipeline (design doc §5), as four visible steps:
//   1. Capture   — record (and/or dictate live). Audio is saved immediately.
//   2. Transcribe — raw speech-to-text, kept verbatim in the entry's transcript.
//   3. Clean     — fillers and stutters removed (rules; optionally AI), then
//                  checked for meaning drift against what you actually said.
//   4. Review    — you choose cleaned / exact words / your edit. Short notes
//                  with no warnings skip this step entirely.

import { html, raw, sheet, on, toast, errorToast, autosize } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { makeEntry } from "../core/model.js";
import { ruleCleanup, checkFidelity, wordDiff, canAutoApprove } from "../core/fidelity.js";
import { extractTags, escapeHtml } from "../core/markdown.js";
import { storeAudio } from "../app/actions.js";
import { recordingSupported, startRecording } from "./recorder.js";
import { resolveEngine, engineDescription, createLiveDictation, transcribeWithApi, LANGS } from "./transcribe.js";

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Record a voice note and save it as an entry. Resolves with the entry (or null). */
export async function captureVoice(ctx, { day, privacy = "normal", questionId } = {}) {
  const settings = ctx.settings();
  const secrets = ctx.secrets();
  let engine = resolveEngine(settings, secrets);
  const sensitive = privacy !== "normal";
  if (sensitive && engine !== "none") engine = "none"; // don't send No-AI/sealed audio anywhere by default
  let lang = settings.transcription.language || "auto";
  const canRecord = recordingSupported();
  if (!canRecord && engine !== "webspeech") {
    toast("This browser can't record audio. Try Safari on iPhone or Chrome on Android/desktop.", { error: true });
    return null;
  }

  const result = await sheet({
    title: "Voice note",
    dismissable: true,
    body: html`<div class="recorder">
      <div class="chips" style="justify-content:center;margin-bottom:8px" data-langs>${Object.entries(LANGS).map(([k, v]) => html`<button class="chip ${k === lang ? "on" : ""}" data-lang="${k}">${v}</button>`)}</div>
      <div class="time" data-time>0:00</div>
      <div class="level" data-level>${Array.from({ length: 24 }, () => raw("<span></span>"))}</div>
      <button class="rec-btn" data-rec aria-label="Start recording">${raw(icon("mic"))}</button>
      <div class="live hidden" data-live></div>
      <p class="small muted" data-engine>${engineDescription(engine, settings)}</p>
      ${sensitive ? html`<p class="small muted">${raw(icon("lock"))} This entry is ${privacy === "sealed" ? "sealed" : "No-AI"}, so audio is recorded only and not sent to any transcription service. <button class="btn small ghost" data-allow>Transcribe anyway</button></p>` : ""}
    </div>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-done disabled>Save note</button>`,
    setup: (d, close) => {
      let rec = null, live = null, liveText = "", timer = 0, started = false;
      const bars = [...d.querySelectorAll("[data-level] span")];
      const setLevel = (v) => { for (let i = 0; i < bars.length; i++) bars[i].style.height = `${4 + Math.max(0, v * 42 * (0.4 + 0.6 * Math.sin((i / bars.length) * Math.PI)) * (0.7 + Math.random() * 0.6))}px`; };
      const liveBox = d.querySelector("[data-live]");
      on(d, "click", "[data-lang]", (e, b) => {
        if (started) return;
        lang = b.dataset.lang;
        for (const c of d.querySelectorAll("[data-lang]")) c.classList.toggle("on", c === b);
      });
      d.querySelector("[data-allow]")?.addEventListener("click", (e) => {
        engine = resolveEngine(settings, secrets);
        d.querySelector("[data-engine]").textContent = engineDescription(engine, settings);
        e.target.closest("p").remove();
      });
      const stopAll = async () => {
        clearInterval(timer);
        const out = { lang, engine };
        if (live) { out.liveText = await live.stop(); }
        if (rec) { const r = await rec.stop(); out.blob = r.blob; out.duration = r.duration; }
        return out;
      };
      const btn = d.querySelector("[data-rec]");
      btn.addEventListener("click", async () => {
        if (!started) {
          started = true;
          btn.classList.add("recording");
          btn.innerHTML = icon("stop");
          btn.setAttribute("aria-label", "Stop recording");
          d.querySelector("[data-done]").removeAttribute("disabled");
          const t0 = Date.now();
          timer = setInterval(() => { d.querySelector("[data-time]").textContent = fmtTime(rec ? rec.elapsed() : (Date.now() - t0) / 1000); }, 250);
          try {
            const keepAudio = engine !== "webspeech" || settings.transcription.keepAudio;
            if (canRecord && (engine !== "webspeech" || keepAudio)) {
              try { rec = await startRecording({ onLevel: setLevel }); } catch (err) {
                if (engine !== "webspeech") throw err;
              }
            }
            if (engine === "webspeech") {
              liveBox.classList.remove("hidden");
              live = createLiveDictation({
                lang,
                onText: (f, i) => { liveText = f; liveBox.innerHTML = `${escapeHtml(f)} <span class="faint">${escapeHtml(i)}</span>`; },
                onError: (err) => toast(err.message, { error: true }),
              });
              live.start();
              if (!rec) setLevel(0.3);
            }
          } catch (err) {
            clearInterval(timer);
            errorToast(err, "Couldn't start the microphone");
            close(undefined);
          }
        } else {
          btn.setAttribute("disabled", "");
          close(await stopAll());
        }
      });
      d.querySelector("[data-done]").addEventListener("click", async () => { if (started) close(await stopAll()); });
      d.addEventListener("close", () => { if (started) { clearInterval(timer); rec?.cancel(); live?.abort(); } });
    },
  });
  if (!result || (!result.blob && !result.liveText)) return null;

  // 1. Save immediately — nothing is lost if anything after this fails.
  const theDay = day || ctx.today();
  const media = [];
  if (result.blob && result.blob.size) media.push(await storeAudio(ctx, { day: theDay, sealed: privacy === "sealed" }, result.blob, { duration: result.duration }));
  let entry = makeEntry({
    kind: "voice", day: theDay, privacy, media, body: "", question: questionId || undefined,
    transcript: { engine: result.engine, language: result.lang, raw: result.liveText || "", status: result.liveText ? "needs-review" : "pending", audio: media[0]?.id },
    source: { system: "living-journal", device: ctx.deviceName(), method: "voice" },
  }, { tz: ctx.tz() });
  entry = await ctx.store.put(entry);

  // 2. Transcribe if it wasn't dictated live.
  if (!result.liveText && result.engine === "api" && result.blob) {
    entry = await transcribeEntry(ctx, entry, { quiet: true }) || entry;
  }
  // 3–4. Clean and review.
  if (entry.transcript?.raw) entry = await reviewTranscript(ctx, entry, { auto: true }) || entry;
  else if (entry.transcript?.status === "pending") toast("Audio saved. Transcribe it from the entry when you're ready.", { timeout: 6000 });
  return entry;
}

/** Run the configured API engine over an entry's audio. */
export async function transcribeEntry(ctx, entry, { quiet = false } = {}) {
  const settings = ctx.settings();
  const secrets = ctx.secrets();
  const audio = (entry.media || []).find((m) => m.type === "audio");
  if (!audio) throw new Error("This entry has no audio.");
  const engine = resolveEngine({ ...settings, transcription: { ...settings.transcription, engine: "api" } }, secrets);
  if (engine !== "api") throw new Error("Set up a transcription service in Settings → Voice first.");
  const blob = await ctx.store.getBlob(audio.path, { fetchRemote: ctx.sync.configured() ? (sha) => ctx.sync.fetchBlob(sha) : undefined });
  if (!blob) throw new Error("The audio isn't on this device.");
  try {
    const t = settings.transcription;
    const r = await transcribeWithApi(blob, { endpoint: t.endpoint, model: t.model, key: secrets.transcriptionKey, language: entry.transcript?.language || t.language });
    return ctx.store.put({ ...entry, transcript: { ...(entry.transcript || {}), engine: "api", model: t.model, raw: r.text, detected_language: r.language, status: "needs-review", transcribed: ctx.now() } });
  } catch (err) {
    if (!quiet || !err.offline) errorToast(err);
    else toast(err.message, { timeout: 7000 });
    return null;
  }
}

/**
 * Cleanup + review. With auto=true, short faithful notes are approved silently.
 * Returns the updated entry, or null if dismissed (the raw transcript stays).
 */
export async function reviewTranscript(ctx, entry, { auto = false } = {}) {
  const settings = ctx.settings();
  const t = entry.transcript || {};
  const rawText = t.raw || "";
  if (!rawText.trim()) { toast("Nothing was transcribed."); return null; }
  const lang = t.language === "vi" || t.detected_language === "vietnamese" ? "vi" : t.language || "auto";
  let cleaned = ruleCleanup(rawText, { language: lang }).text;
  let cleanedBy = "rules";
  let aiError = null;

  const tryAi = settings.ai.cleanup && ctx.ai.configured() && entry.privacy === "normal";
  if (auto && settings.transcription.autoApproveShort && canAutoApprove(rawText, cleaned)) {
    return finish(cleaned, "cleaned", cleanedBy);
  }
  if (tryAi) {
    try {
      const ai = await ctx.ai.get();
      const out = await ai.cleanupTranscript(rawText, { language: lang });
      if (out) { cleaned = out; cleanedBy = `ai:${settings.ai.model}`; }
    } catch (err) { aiError = err.message; }
  }
  const fid = checkFidelity(rawText, cleaned);
  if (auto && settings.transcription.autoApproveShort && cleanedBy === "rules" && canAutoApprove(rawText, cleaned)) return finish(cleaned, "cleaned", cleanedBy);

  const diff = wordDiff(rawText, cleaned);
  const choice = await sheet({
    title: "Review your voice note",
    wide: true,
    body: html`
      <p class="small muted" style="margin-top:0">Cleanup should only make it easier to read — never add meaning. ${cleanedBy === "rules" ? "Cleaned by simple rules on this device." : "Cleaned by AI, then checked against your exact words."}${aiError ? html` <span class="badge warn">AI cleanup unavailable: ${aiError}</span>` : ""}</p>
      ${fid.warnings.length ? html`<ul class="warnings">${fid.warnings.map((w) => html`<li class="${w.severity}">${raw(icon(w.severity === "warn" ? "warn" : "info"))}<span>${w.message}</span></li>`)}</ul>` : html`<div class="notice ok">${raw(icon("check"))}<span>No change in meaning detected: hedges, negations and your words are preserved.</span></div>`}
      <label class="field" style="margin-top:14px"><span>Entry text (edit freely)</span><textarea class="textarea" data-text style="font-family:var(--font-write);font-size:1.05rem">${cleaned}</textarea></label>
      <details class="layer" style="margin-top:12px"><summary>${raw(icon("history"))}Changes from what you said</summary><div class="diff">${diff.map((p) => p.op === "same" ? p.text : p.op === "add" ? html`<ins>${p.text}</ins>` : html`<del>${p.text}</del>`)}</div></details>
      <details class="layer"><summary>${raw(icon("mic"))}Exact transcript</summary><div class="raw-text">${rawText}</div></details>`,
    foot: html`<button class="btn" data-pick="raw">Use my exact words</button><button class="btn primary" data-pick="text">Save</button>`,
    setup: (d, close) => {
      const ta = d.querySelector("[data-text]");
      autosize(ta, 0.4);
      on(d, "click", "[data-pick]", (e, b) => {
        if (b.dataset.pick === "raw") close({ text: rawText, how: "raw" });
        else close({ text: ta.value, how: ta.value === cleaned ? "cleaned" : "edited" });
      });
    },
  });
  if (!choice) {
    await ctx.store.put({ ...entry, transcript: { ...t, status: "needs-review" } }, { keepUpdated: true });
    return null;
  }
  return finish(choice.text, choice.how, cleanedBy, fid.warnings.map((w) => w.type));

  async function finish(text, how, by, warnings) {
    const next = {
      ...entry,
      body: text.trim(),
      tags: [...new Set([...(entry.tags || []), ...extractTags(text)])],
      transcript: { ...t, status: "approved", approved: how, cleaned_by: how === "raw" ? undefined : by, warnings: warnings?.length ? warnings : undefined, reviewed: ctx.now() },
    };
    if (!settings.transcription.keepAudio) {
      for (const m of (next.media || []).filter((x) => x.type === "audio")) await ctx.store.removeBlob(m.path);
      next.media = (next.media || []).filter((x) => x.type !== "audio");
      next.transcript.audio = undefined;
    }
    return ctx.store.put(next);
  }
}
