// YouTube sources live in the same Research store as every other source.
import { html, raw, on, toast, confirmSheet } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { makeSource, findDuplicate, normalizeUrl } from "../../core/sources.js";
import { extractYouTubeVideoId, getYouTubeThumbnail, searchTranscript } from "../../core/youtube.js";
import { buildVideoContext } from "../../core/context.js";
import { summarizeVideo, chatAboutVideo } from "../video-ai.js";
import { fillEmptyVideoMetadata, videoArchiveRoute } from "../video-routing.js";
import { fetchTranscript, prepareTranscriptUpdate } from "../transcript-helper.js";

const videos = (ctx) => ctx.sources().filter((s) => s.kind === "video" && extractYouTubeVideoId(s.url || ""))
  .sort((a, b) => String(b.added || "").localeCompare(String(a.added || "")));

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
      <small>${v.transcript ? "Transcript added" : "No transcript yet"}</small></div>
    </a>`;
  });
}

export function transcriptMatchesMarkup(matches) {
  return matches.length
    ? html`<div class="transcript-results">${matches.slice(0, 30).map((m) => html`<p><span class="faint">${m.lineNumber}</span> ${m.line}</p>`)}</div>`
    : html`<p class="faint">No matches.</p>`;
}

export function videoAnalysisMarkup(value) {
  const analyses = Array.isArray(value) ? value : value ? [value] : [];
  return analyses.slice().reverse().map((a) => html`<article class="video-analysis">
    <div><span class="badge ai">Proposal</span> <span class="small muted">${a.author || "ai"} · ${String(a.created || "").slice(0, 10)}</span></div>
    <h4>Summary</h4><p>${a.executiveSummary || ""}</p>
    ${a.keyInsights?.length ? html`<h4>Key insights</h4><ul>${a.keyInsights.map((x) => html`<li><b>${x.point || ""}</b> ${x.detail || ""}${x.quote ? html`<blockquote>${x.quote}</blockquote>` : ""}</li>`)}</ul>` : ""}
    ${a.takeaways?.length ? html`<h4>Takeaways</h4><ul>${a.takeaways.map((x) => html`<li>${x}</li>`)}</ul>` : ""}
  </article>`);
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

  async function fetchAndApplyTranscript(analyseAfter = false) {
    if (busy) return;
    showHelperMessage("");
    const videoId = extractYouTubeVideoId(ctx.store.get(selectedId)?.url || "");
    const fetched = await fetchTranscript(videoId);
    if (!fetched.ok) {
      const message = fetched.reason === "unavailable" || fetched.reason === "service-error"
        ? "Transcript helper isn't running on this PC — start video-helper, or paste the transcript"
        : fetched.reason === "no-captions"
          ? "No captions were found for this video. You can paste a transcript instead."
          : "Couldn't fetch this transcript. You can paste it instead.";
      showHelperMessage(message);
      return;
    }

    let current = ctx.store.get(selectedId);
    let input = el.querySelector("[data-transcript]");
    const textFor = (source, field) => {
      const draft = field?.value ?? transcriptDraft;
      return String(draft || "").trim() ? draft : String(source.transcript || "");
    };
    let candidate = { ...current, transcript: textFor(current, input) };
    let update = prepareTranscriptUpdate(candidate, fetched);
    if (update.needsConfirmation) {
      const replace = await confirmSheet(
        "Replace the current transcript? The existing text will be kept as a revision.",
        { title: "Replace transcript?", confirm: "Replace transcript", danger: true },
      );
      if (!replace) return;
      current = ctx.store.get(selectedId);
      input = el.querySelector("[data-transcript]");
      candidate = { ...current, transcript: textFor(current, input) };
      update = prepareTranscriptUpdate(candidate, fetched, { confirmReplacement: true });
    }
    if (!update.ok) {
      showHelperMessage(update.reason === "no-captions" ? "No captions were found for this video." : "Couldn't use this transcript.");
      return;
    }
    const savedTranscript = String(current.transcript || "");
    const candidateTranscript = String(update.previous?.transcript || "");
    if (savedTranscript.trim()) await ctx.store.saveRevision(current, "transcript-replaced");
    if (candidateTranscript.trim() && candidateTranscript !== savedTranscript) {
      await ctx.store.saveRevision({ ...current, transcript: candidateTranscript }, "transcript-replaced");
    }
    await ctx.store.put(update.record);
    transcriptDraft = update.record.transcript;
    helperMessage = `Fetched ${fetched.data.lines.length} caption lines (${fetched.data.language}).`;
    toast("Transcript fetched");
    render();
    if (analyseAfter) await analyzeCurrentTranscript();
  }

  async function analyzeCurrentTranscript() {
    if (busy) return;
    const input = el.querySelector("[data-transcript]");
    const text = String(input?.value || transcriptDraft || "").trim();
    if (!text) {
      showHelperMessage("Paste or fetch a transcript before analysing.");
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
      const previous = Array.isArray(fresh.videoAnalysis) ? fresh.videoAnalysis : fresh.videoAnalysis ? [fresh.videoAnalysis] : [];
      await ctx.store.put({ ...fresh, videoAnalysis: [...previous, {
        ...result, author: "ai:" + (result.model || ctx.settings().ai.model), created: ctx.now(), status: "proposal",
      }] });
      toast("AI proposal saved");
    } catch (err) { toast(err.message || String(err), { error: true }); }
    busy = false;
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
      el.innerHTML = String(html`<div class="video-archive">
        <div class="video-detail-head"><a class="btn small ghost" href="#/videos">${raw(icon("back"))}All videos</a><span class="faint">${s.author || "YouTube"}</span></div>
        <div class="video-player"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${s.title || "YouTube video"}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
        <h2 class="video-title">${s.title || "Untitled video"}</h2>
        <p class="small muted"><a href="${s.url}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></p>
        <div class="video-columns">
          <section class="video-panel"><h3>Transcript</h3><p class="small faint">Paste a transcript to search it or ask AI about the video's words.</p>
            <textarea class="textarea video-transcript" data-transcript placeholder="Paste transcript here">${transcript}</textarea>
            <button class="btn small" data-act="save-transcript">Save transcript</button>
            <div class="video-transcript-actions">
              <button class="btn small" data-act="fetch-transcript" ${busy ? "disabled" : ""}>Fetch transcript</button>
              <button class="btn small" data-act="fetch-analyze" ${busy ? "disabled" : ""}>Fetch &amp; analyse</button>
            </div>
            <p class="small muted" data-helper-status>${helperMessage}</p>
            <label class="field"><span>Find in transcript</span><input class="input" data-search value="${transcriptSearch}" placeholder="Search words or phrases"></label>
            <div data-matches>${transcriptSearch ? transcriptMatchesMarkup(matches) : ""}</div>
          </section>
          <section class="video-panel"><h3>Notes</h3><p class="small faint">Your notes stay separate from the transcript and AI proposal.</p>
            <textarea class="textarea video-notes" data-notes placeholder="Your notes">${notes}</textarea>
            <button class="btn small" data-act="save-notes">Save notes</button>
          </section>
        </div>
        <section class="video-panel video-ai-panel">
          <div class="video-panel-head"><div><h3>AI analysis</h3><p class="small faint">Only the pasted transcript is sent. Results are saved separately as an AI proposal.</p></div>
            <button class="btn small primary" data-act="analyze" ${gate.included && !busy ? "" : "disabled"}>${busy ? "Working…" : "Analyze transcript"}</button>
          </div>
          <div data-ai-status>${!gate.included ? html`<p class="small muted">${gate.reason === "transcript" ? "Paste and save a transcript to enable analysis." : "This source is marked No-AI or sealed."}</p>` : ""}</div>
          <div data-analysis>${videoAnalysisMarkup(s.videoAnalysis)}</div>
          <form data-chat><label class="field"><span>Ask about the transcript</span>
            <textarea class="textarea" data-chat-input rows="2" placeholder="Ask a question grounded in the transcript" ${gate.included && !busy ? "" : "disabled"}></textarea>
          </label><button class="btn small" ${gate.included && !busy ? "" : "disabled"}>Ask</button></form>
          <div data-chat-log>${videoChatMarkup(chat)}</div>
        </section>
      </div>`);
      const ta = el.querySelector("[data-transcript]");
      const na = el.querySelector("[data-notes]");
      ta.addEventListener("input", () => { transcriptDraft = ta.value; });
      na.addEventListener("input", () => { notesDraft = na.value; });
      el.querySelector("[data-search]").addEventListener("input", (e) => {
        transcriptSearch = e.target.value;
        render();
        const q = el.querySelector("[data-search]");
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      });
      offs.push(on(el, "click", "[data-act=save-transcript]", async () => {
        await ctx.store.put({ ...ctx.store.get(selectedId), transcript: ta.value.trim() || undefined });
        transcriptDraft = ta.value;
        toast("Transcript saved");
        render();
      }));
      offs.push(on(el, "click", "[data-act=save-notes]", async () => {
        await ctx.store.put({ ...ctx.store.get(selectedId), body: na.value });
        notesDraft = na.value;
        toast("Notes saved");
      }));
      offs.push(on(el, "click", "[data-act=fetch-transcript]", () => fetchAndApplyTranscript(false)));
      offs.push(on(el, "click", "[data-act=fetch-analyze]", () => fetchAndApplyTranscript(true)));
      offs.push(on(el, "click", "[data-act=analyze]", analyzeCurrentTranscript));
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

    el.innerHTML = String(html`<div class="video-archive">
      <form class="video-add" data-add><label class="field"><span>YouTube link</span>
        <input class="input" data-url type="url" placeholder="https://www.youtube.com/watch?v=…" required>
      </label><button class="btn primary">${raw(icon("plus"))}Add to archive</button></form>
      <div data-video-list>${list.length
        ? html`<div class="video-grid">${videoCardsMarkup(list)}</div>`
        : html`<div class="empty"><h3>No videos yet</h3><p>Add a YouTube link, then paste its transcript when you're ready to explore it.</p></div>`}</div>
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
      ctx.navigate(videoArchiveRoute(source));
    }));
  }

  render();
  ui.onStore(() => render());
  ui.cleanup(() => { offs.forEach((off) => off()); offs = []; });
  ui.onAction((_e, b) => { if (b.dataset.act === "add-video") el.querySelector("[data-url]")?.focus(); });
}
