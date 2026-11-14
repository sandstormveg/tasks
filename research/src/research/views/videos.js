// YouTube sources live in the same Research store as every other source.
//
// Pasting a link is the whole job: the video is saved, opened, and the PC helper
// fills in the transcript and a summary while you watch. The detail page then reads
// as one thing — player, title, summary, your notes, the transcript (folded away),
// and the chat — rather than a wall of buttons.

import { html, raw, on, toast, confirmSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { makeSource, findDuplicate, normalizeUrl } from "../../core/sources.js";
import { extractYouTubeVideoId, getYouTubeThumbnail, searchTranscript } from "../../core/youtube.js";
import { buildVideoContext } from "../../core/context.js";
import { summarizeVideo, chatAboutVideo } from "../video-ai.js";
import { fillEmptyVideoMetadata, videoArchiveRoute } from "../video-routing.js";
import {
  fetchTranscript, prepareTranscriptUpdate, fetchSummary, addProgress, transcriptProblem, summaryProblem, HELPER_DOWN_MESSAGE,
} from "../transcript-helper.js";
import { analysesOf, latestSummary, summaryEntry, withSummary, videoBadgesMarkup, videoAnalysisMarkup } from "../video-summaries.js";

export { videoAnalysisMarkup };

const videos = (ctx) => ctx.sources().filter((s) => s.kind === "video" && extractYouTubeVideoId(s.url || ""))
  .sort((a, b) => String(b.added || "").localeCompare(String(a.added || "")));

// Videos added from the list whose transcript and summary still need fetching.
// Module-level because adding navigates into a fresh mount of this view.
const pendingAdd = new Set();

async function metadata(id) {
  try {
    const u = "https://www.youtube.com/oembed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id) + "&format=json";
    const r = await fetch(u);
    if (!r.ok) return {};
    const d = await r.json();
    return { title: d.title || "", author: d.author_name || "", thumbnail: d.thumbnail_url || "" };
  } catch { return {}; }
}

// Pure markup helpers let the html renderer keep child markup raw while escaping
// every title, transcript line, insight and reply exactly once.
export function videoCardsMarkup(items) {
  return items.map((v) => {
    const id = extractYouTubeVideoId(v.url);
    return html`<a class="video-card" href="${videoArchiveRoute(v)}">
      <img src="${v.thumbnail || getYouTubeThumbnail(id).high}" alt="" loading="lazy">
      <div><b>${v.title || "Untitled video"}</b><span>${v.author || "YouTube"}</span>
      ${videoBadgesMarkup(v)}</div>
    </a>`;
  });
}

export function transcriptMatchesMarkup(matches) {
  return matches.length
    ? html`<div class="transcript-results">${matches.slice(0, 30).map((m) => html`<p><span class="faint">${m.lineNumber}</span> ${m.line}</p>`)}</div>`
    : html`<p class="faint">No matches.</p>`;
}

export function videoChatMarkup(messages) {
  return messages.map((m) => html`<div class="video-chat-msg"><b>${m.role === "user" ? "You" : m.model || "AI"}</b><p>${m.text}</p></div>`);
}

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Video archive");
  ui.wide(true);
  ui.setActions(html`<button class="btn small primary" data-act="add-video">${raw(icon("plus"))}Add video</button>`);
  const selectedId = route.query.id || "";
  let transcriptDraft = null, notesDraft = null, transcriptSearch = "", helperMessage = "", busy = false, chat = [], offs = [];
  let transcriptOpen = null; // the folded transcript, as you left it
  const metadataAttempts = new Set();

  function fetchMissingMetadata(source, id) {
    if (metadataAttempts.has(source.id) || ["title", "author", "thumbnail"].every((key) => String(source[key] || "").trim())) return;
    metadataAttempts.add(source.id);
    metadata(id).then(async (found) => {
      const current = ctx.store.get(source.id);
      if (!current || current.deleted) return;
      const filled = fillEmptyVideoMetadata(current, found);
      if (["title", "author", "thumbnail"].some((key) => filled[key] !== current[key])) await ctx.store.put(filled);
    }).catch(() => {});
  }

  function showHelperMessage(message) {
    helperMessage = message;
    const status = el.querySelector("[data-helper-status]");
    if (status) status.textContent = message;
  }

  // The transcript as the page (or a draft) has it, trimmed.
  function currentTranscript() {
    const input = el.querySelector("[data-transcript]");
    return String(input?.value ?? transcriptDraft ?? ctx.store.get(selectedId)?.transcript ?? "").trim();
  }

  // Save a pasted transcript when the box loses focus. Never touches your notes.
  async function saveTranscriptOnBlur() {
    const input = el.querySelector("[data-transcript]");
    if (!input) return;
    const text = input.value;
    transcriptDraft = text;
    const current = ctx.store.get(selectedId);
    if (!current || String(text || "").trim() === String(current.transcript || "")) return;
    if (String(current.transcript || "").trim()) await ctx.store.saveRevision(current, "transcript-cleared");
    await ctx.store.put({ ...current, transcript: String(text || "").trim() || undefined });
  }

  // Notes save on blur too, and stay entirely yours.
  async function saveNotesOnBlur() {
    const input = el.querySelector("[data-notes]");
    if (!input) return;
    const body = input.value;
    notesDraft = body;
    const current = ctx.store.get(selectedId);
    if (!current || body === String(current.body || "")) return;
    await ctx.store.put({ ...current, body });
  }

  /**
   * Fetch captions and save them. Existing words are only replaced after the confirm
   * (the add flow passes confirmReplace: false because the video is brand new).
   */
  async function fetchAndSaveTranscript({ confirmReplace = true } = {}) {
    const videoId = extractYouTubeVideoId(ctx.store.get(selectedId)?.url || "");
    const fetched = await fetchTranscript(videoId);
    if (!fetched.ok) return fetched;

    const textFor = (source) => {
      const draft = el.querySelector("[data-transcript]")?.value ?? transcriptDraft;
      return String(draft || "").trim() ? draft : String(source.transcript || "");
    };
    let current = ctx.store.get(selectedId);
    let update = prepareTranscriptUpdate({ ...current, transcript: textFor(current) }, fetched, { confirmReplacement: !confirmReplace });
    if (update.needsConfirmation) {
      const replace = await confirmSheet(
        "Replace the current transcript? The existing text will be kept as a revision.",
        { title: "Replace transcript?", confirm: "Replace transcript", danger: true },
      );
      if (!replace) return { ok: false, reason: "cancelled" };
      current = ctx.store.get(selectedId);
      update = prepareTranscriptUpdate({ ...current, transcript: textFor(current) }, fetched, { confirmReplacement: true });
    }
    if (!update.ok) return update;

    const savedTranscript = String(current.transcript || "");
    const candidateTranscript = String(update.previous?.transcript || "");
    if (savedTranscript.trim()) await ctx.store.saveRevision(current, "transcript-replaced");
    if (candidateTranscript.trim() && candidateTranscript !== savedTranscript) {
      await ctx.store.saveRevision({ ...current, transcript: candidateTranscript }, "transcript-replaced");
    }
    await ctx.store.put(update.record);
    transcriptDraft = update.record.transcript;
    return { ok: true, record: update.record, fetched };
  }

  // "Get transcript" / "Refetch": one button, with the confirm before replacing.
  async function getTranscript() {
    if (busy) return;
    busy = true;
    showHelperMessage(addProgress("transcript"));
    render();
    const result = await fetchAndSaveTranscript({ confirmReplace: true });
    busy = false;
    if (result.ok) {
      showHelperMessage(`Fetched ${result.fetched.data.lines.length} caption lines (${result.fetched.data.language}).`);
      toast("Transcript fetched");
    } else if (result.reason === "cancelled") {
      showHelperMessage("");
    } else {
      showHelperMessage(transcriptProblem(result));
    }
    render();
  }

  // Pasting a link does everything: the transcript, then the helper's summary.
  async function runAddFlow() {
    const source = ctx.store.get(selectedId);
    const videoId = extractYouTubeVideoId(source?.url || "");
    if (!videoId) return;
    busy = true;
    showHelperMessage(addProgress("transcript"));
    render();

    const transcript = await fetchAndSaveTranscript({ confirmReplace: false });
    if (!transcript.ok) {
      busy = false;
      showHelperMessage(["no-captions", "invalid-id"].includes(transcript.reason) ? transcriptProblem(transcript) : HELPER_DOWN_MESSAGE);
      render();
      return;
    }
    transcriptOpen = false; // it arrives folded away, like any other transcript

    showHelperMessage(addProgress("summary"));
    render();
    const summary = await fetchSummary(videoId);
    if (!summary.ok) {
      busy = false;
      showHelperMessage(["unavailable", "service-error"].includes(summary.reason) ? HELPER_DOWN_MESSAGE : summaryProblem(summary));
      render();
      return;
    }
    const entry = summaryEntry(summary.data, { now: ctx.now() });
    if (entry) await ctx.store.put(withSummary(ctx.store.get(selectedId), entry));
    busy = false;
    showHelperMessage(addProgress("done"));
    toast("Transcript and summary saved");
    render();
  }

  // The in-app AI path: only used when the PC helper can't be reached.
  async function analyzeCurrentTranscript() {
    if (busy) return;
    const text = currentTranscript();
    if (!text) {
      showHelperMessage("Get or paste a transcript first, then summarise.");
      return;
    }
    const latest = ctx.store.get(selectedId);
    if (text !== String(latest.transcript || "")) await ctx.store.put({ ...latest, transcript: text });
    transcriptDraft = text;
    busy = true;
    render();
    try {
      const result = await summarizeVideo(ctx, selectedId);
      const fresh = ctx.store.get(selectedId);
      const previous = analysesOf(fresh);
      await ctx.store.put({ ...fresh, videoAnalysis: [...previous, {
        ...result, author: "ai:" + (result.model || ctx.settings().ai.model), created: ctx.now(), status: "proposal",
      }] });
      toast("AI proposal saved");
    } catch (err) { toast(err.message || String(err), { error: true }); }
    busy = false;
    render();
  }

  // One "Summarise": the helper when it's reachable, otherwise the app's own AI.
  async function summarise() {
    if (busy) return;
    const text = currentTranscript();
    if (!text) {
      showHelperMessage("Get or paste a transcript first, then summarise.");
      render();
      return;
    }
    const current = ctx.store.get(selectedId);
    if (!buildVideoContext({ ...current, transcript: text }).included) {
      showHelperMessage("This source is marked No-AI or sealed, so it can't be summarised.");
      render();
      return;
    }
    if (text !== String(current.transcript || "")) await ctx.store.put({ ...current, transcript: text });
    transcriptDraft = text;

    busy = true;
    showHelperMessage(addProgress("summary"));
    render();
    const videoId = extractYouTubeVideoId(current.url || "");
    const found = videoId ? await fetchSummary(videoId) : { ok: false, reason: "invalid-id" };
    busy = false;
    if (found.ok) {
      const entry = summaryEntry(found.data, { now: ctx.now() });
      if (entry) await ctx.store.put(withSummary(ctx.store.get(selectedId), entry));
      showHelperMessage(addProgress("done"));
      toast("Summary saved");
      render();
      return;
    }
    if (found.reason === "summary-failed") {
      showHelperMessage(summaryProblem(found));
      render();
      return;
    }
    // No helper on this device (or it has no captions): use the AI set up in the app.
    showHelperMessage("");
    await analyzeCurrentTranscript();
    render();
  }

  function render() {
    offs.forEach((off) => off());
    offs = [];
    const list = videos(ctx);
    const s = selectedId ? ctx.store.get(selectedId) : null;
    if (s && !s.deleted && s.kind === "video" && extractYouTubeVideoId(s.url || "")) {
      const id = extractYouTubeVideoId(s.url);
      fetchMissingMetadata(s, id);
      const transcript = transcriptDraft === null ? s.transcript || "" : transcriptDraft;
      const notes = notesDraft === null ? s.body || "" : notesDraft;
      const gate = buildVideoContext({ ...s, transcript });
      const matches = searchTranscript(transcript, transcriptSearch);
      const hasTranscript = !!String(transcript || "").trim();
      const summary = latestSummary(s);
      const hasSummary = !!summary;
      const lines = hasTranscript ? String(transcript).split("\n").filter((l) => l.trim()).length : 0;
      if (transcriptOpen === null) transcriptOpen = !hasTranscript;
      el.innerHTML = String(html`<div class="video-archive video-detail">
        <div class="video-detail-head"><a class="btn small ghost" href="#/videos">${raw(icon("back"))}All videos</a><span class="faint">${s.author || "YouTube"}</span></div>
        <div class="video-player"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${s.title || "YouTube video"}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
        <h2 class="video-title">${s.title || "Untitled video"}</h2>
        <p class="small muted video-open"><a href="${s.url}" target="_blank" rel="noopener noreferrer">Open on YouTube</a>${s.transcriptSource === "youtube-captions" ? html` · Captions from YouTube` : ""}</p>
        <p class="small muted video-status" data-helper-status>${helperMessage}</p>

        <section class="video-panel">
          <div class="video-panel-head">
            <div><h3>Summary</h3><p class="small faint">${hasSummary ? "The latest AI summary, written from the transcript." : "An AI summary appears here once there's a transcript."}</p></div>
            <button class="btn small primary" data-act="summarise" ${gate.included && !busy ? "" : "disabled"}>${busy ? "Working…" : hasSummary ? "Summarise again" : "Summarise"}</button>
          </div>
          ${!gate.included ? html`<p class="small muted">${gate.reason === "transcript" ? "Get or paste a transcript, then this can be summarised." : "This source is marked No-AI or sealed."}</p>` : ""}
          <div data-summary>${hasSummary ? videoAnalysisMarkup(s.videoAnalysis, { latest: true }) : html`<p class="small faint">No summary yet.</p>`}</div>
        </section>

        <section class="video-panel">
          <h3>Your notes</h3>
          <p class="small faint">Saved when you click away. The AI never touches them.</p>
          <textarea class="textarea video-notes" data-notes placeholder="Your notes">${notes}</textarea>
        </section>

        <details class="video-panel video-transcript-panel" data-transcript-panel ${transcriptOpen ? "open" : ""}>
          <summary><h3>Transcript</h3><span class="small faint">${hasTranscript ? `${lines} ${lines === 1 ? "line" : "lines"}` : "not fetched yet"}</span></summary>
          <div class="video-transcript-body">
            <div class="video-transcript-actions">
              <button class="btn small" data-act="fetch-transcript" ${busy ? "disabled" : ""}>${hasTranscript ? "Refetch" : "Get transcript"}</button>
              <span class="small faint">${!hasTranscript ? "From the helper on your PC, or paste it below." : s.transcriptSource === "youtube-captions" ? "From YouTube captions." : "Pasted by you."}</span>
            </div>
            <textarea class="textarea video-transcript" data-transcript placeholder="Paste a transcript here — it saves when you click away">${transcript}</textarea>
            <label class="field"><span>Find in transcript</span><input class="input" data-search value="${transcriptSearch}" placeholder="Search words or phrases"></label>
            <div data-matches>${transcriptSearch ? transcriptMatchesMarkup(matches) : ""}</div>
          </div>
        </details>

        <section class="video-panel video-ai-panel">
          <div class="video-panel-head"><div><h3>Ask about this video</h3><p class="small faint">Only the transcript is sent. Answers are saved with this page session.</p></div></div>
          <form data-chat class="video-chat"><label class="field"><span>Your question</span>
            <textarea class="textarea" data-chat-input rows="2" placeholder="Ask a question grounded in the transcript" ${gate.included && !busy ? "" : "disabled"}></textarea>
          </label><button class="btn small" ${gate.included && !busy ? "" : "disabled"}>Ask</button></form>
          <div class="video-chat-log" data-chat-log>${videoChatMarkup(chat)}</div>
        </section>
      </div>`);

      const ta = el.querySelector("[data-transcript]");
      const na = el.querySelector("[data-notes]");
      ta.addEventListener("input", () => { transcriptDraft = ta.value; });
      ta.addEventListener("blur", saveTranscriptOnBlur);
      na.addEventListener("input", () => { notesDraft = na.value; });
      na.addEventListener("blur", saveNotesOnBlur);
      const panel = el.querySelector("[data-transcript-panel]");
      panel.addEventListener("toggle", () => { transcriptOpen = panel.open; });
      el.querySelector("[data-search]").addEventListener("input", (e) => {
        transcriptSearch = e.target.value;
        render();
        const q = el.querySelector("[data-search]");
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      });
      offs.push(on(el, "click", "[data-act=fetch-transcript]", getTranscript));
      offs.push(on(el, "click", "[data-act=summarise]", summarise));
      offs.push(on(el, "submit", "[data-chat]", async (e, form) => {
        e.preventDefault();
        const question = form.querySelector("[data-chat-input]").value.trim();
        if (!question) return;
        chat.push({ role: "user", text: question });
        busy = true;
        render();
        try {
          const result = await chatAboutVideo(ctx, selectedId, chat.map((m) => ({ role: m.role, content: m.text })));
          chat.push({ role: "assistant", text: result.text, model: result.model });
        } catch (err) { toast(err.message || String(err), { error: true }); }
        busy = false;
        render();
      }));
      return;
    }

    // A fresh mount starts with the transcript folded when there is one.
    transcriptOpen = null;
    el.innerHTML = String(html`<div class="video-archive">
      <form class="video-add" data-add><label class="field"><span>YouTube link</span>
        <input class="input" data-url type="url" placeholder="https://www.youtube.com/watch?v=…" required>
      </label><button class="btn primary">${raw(icon("plus"))}Add to archive</button></form>
      <div data-video-list>${list.length
        ? html`<div class="video-grid">${videoCardsMarkup(list)}</div>`
        : html`<div class="empty"><h3>No videos yet</h3><p>Paste a YouTube link and the helper on your PC fetches its transcript and a summary.</p></div>`}</div>
    </div>`);
    offs.push(on(el, "submit", "[data-add]", async (e, form) => {
      e.preventDefault();
      const url = normalizeUrl(form.querySelector("[data-url]").value);
      const id = extractYouTubeVideoId(url || "");
      if (!id) { toast("Enter a valid YouTube video link.", { error: true }); return; }
      const canonical = "https://www.youtube.com/watch?v=" + id;
      const duplicate = findDuplicate(ctx.sources(), { url: canonical });
      if (duplicate) { ctx.navigate(videoArchiveRoute(duplicate)); return; }
      const meta = await metadata(id);
      const source = makeSource({ url: canonical, kind: "video", videoId: id, title: meta.title || "", author: meta.author || "", thumbnail: meta.thumbnail || "", status: "to-read" },
        { now: ctx.now(), device: ctx.deviceName(), via: "video-archive" });
      await ctx.store.put(source);
      // The detail page fetches the transcript and summary as soon as it opens.
      pendingAdd.add(source.id);
      ctx.navigate(videoArchiveRoute(source));
    }));
  }

  render();
  if (pendingAdd.has(selectedId)) {
    pendingAdd.delete(selectedId);
    runAddFlow().catch((err) => { busy = false; showHelperMessage(err.message || "Something went wrong."); render(); });
  }
  ui.onStore(() => render());
  ui.cleanup(() => { offs.forEach((off) => off()); offs = []; });
  ui.onAction((_e, b) => {
    if (b.dataset.act !== "add-video") return;
    if (el.querySelector("[data-url]")) el.querySelector("[data-url]").focus();
    else ctx.navigate("#/videos");
  });
}
