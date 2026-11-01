// Talk it through: a gentle conversation with an AI that becomes a journal
// entry you approve. The entry is drafted from YOUR side of the conversation
// only, then checked against your words for added meaning. The conversation
// is kept alongside, with each voice labelled.

import { html, raw, on, toast, errorToast, sheet, autosize } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { makeEntry, entryText, aiReadable } from "../core/model.js";
import { checkFidelity, wordDiff } from "../core/fidelity.js";
import { extractTags } from "../core/markdown.js";
import { markQuestionAnswered } from "../app/actions.js";
import { formatDay } from "../core/dates.js";

const KEY = "talk-session";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Talk it through");
  if (!ctx.ai.configured()) {
    el.innerHTML = String(html`<div class="empty">${raw(icon("chat"))}<h3>Talk it through</h3>
      <p>A reflective conversation that asks gentle follow-up questions and helps you turn it into an entry. It uses Claude through your own Anthropic API key.</p>
      <p><a class="btn primary" href="#/settings/ai">Add an API key</a></p>
      <p class="small faint">Prefer not to use AI? Voice notes and writing work fully without it.</p></div>`);
    return;
  }
  // A saved session resumes; a new topic from the URL starts fresh unless a
  // conversation is already under way (never silently discard one).
  const want = { about: route.query.about || null, questionId: route.query.q || null, entryId: route.query.entry || null };
  const wantsTopic = want.about || want.questionId || want.entryId;
  let session = ctx.store.getKv(KEY, null);
  const sameTopic = session && session.about === want.about && session.questionId === want.questionId && session.entryId === want.entryId;
  if (!session || (wantsTopic && !sameTopic && !session.turns.length)) {
    session = { turns: [], ...want, started: ctx.now() };
  } else if (wantsTopic && !sameTopic) {
    toast("You have a conversation in progress — finish it or start over to change the topic.", { timeout: 6000 });
  }
  let speakReplies = !!ctx.store.getKv("talk-speak", false);
  let busy = false;

  const question = session.questionId ? ctx.store.get(session.questionId) : null;
  const entry = session.entryId ? ctx.store.get(session.entryId) : null;
  const aboutText = question?.text || session.about;

  function contextBlock() {
    const parts = [];
    if (aboutText) parts.push(`They want to reflect on: "${aboutText}"`);
    if (entry && aiReadable(entry)) parts.push(`An entry from ${entry.day} they chose to discuss:\n${entryText(entry)}`);
    return parts.join("\n\n");
  }

  el.innerHTML = String(html`
    ${aboutText || entry ? html`<div class="notice" style="margin:6px 0 12px">${raw(icon("question"))}<span>${aboutText ? html`Reflecting on: <b>${aboutText}</b>` : html`About your entry from <a href="#/entry/${entry.id}">${formatDay(entry.day, { day: "numeric", month: "long", year: "numeric" })}</a> (shared with the AI because you chose “Talk about this”)`}</span></div>` : ""}
    <div class="chat" data-chat></div>
    <div class="chat-input">
      <textarea data-in rows="1" placeholder="Say anything…" aria-label="Your message"></textarea>
      <button class="btn icon ghost" data-act="dictate" aria-label="Dictate" title="Dictate">${raw(icon("mic"))}</button>
      <button class="btn icon primary" data-act="send" aria-label="Send">${raw(icon("send"))}</button>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn small primary" data-act="finish">${raw(icon("edit"))}Make this an entry</button>
      <button class="btn small" data-act="speak-toggle">${raw(icon("speaker"))}<span data-speak-label>${speakReplies ? "Reading replies aloud" : "Read replies aloud"}</span></button>
      <button class="btn small ghost" data-act="reset">Start over</button>
    </div>
    <p class="small faint">The AI follows your lead and won't diagnose or give tasks. Messages go to Anthropic with your API key; nothing is saved to your journal until you make it an entry.</p>`);
  const chat = el.querySelector("[data-chat]");
  const input = el.querySelector("[data-in]");
  autosize(input, 0.3);

  function renderChat(streaming) {
    const greeting = aboutText ? "Take your time — where would you like to start?" : "What's on your mind?";
    chat.innerHTML = String(html`<div class="bubble ai">${greeting}</div>${session.turns.map((t) => html`<div class="bubble ${t.role === "self" ? "self" : "ai"}">${t.text}</div>`)}${streaming != null ? html`<div class="bubble ai ${streaming ? "" : "typing"}">${streaming || "…"}</div>` : ""}`);
    chat.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }
  const save = () => ctx.store.setKv(KEY, session);
  renderChat();

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = "";
    input.dispatchEvent(new Event("input"));
    session.turns.push({ role: "self", text, at: ctx.now() });
    await save();
    renderChat("");
    try {
      const ai = await ctx.ai.get();
      const messages = session.turns.map((t) => ({ role: t.role === "self" ? "user" : "assistant", content: t.text }));
      const reply = await ai.chat(messages, { context: contextBlock(), onText: (snap) => renderChat(snap) });
      session.turns.push({ role: "ai", text: reply, at: ctx.now(), model: ai.model });
      await save();
      renderChat();
      if (speakReplies) { const { speak } = await import("../voice/tts.js"); speak(reply); }
    } catch (err) {
      errorToast(err);
      renderChat();
    } finally { busy = false; }
  }

  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(min-width: 700px)").matches) { e.preventDefault(); send(); } });
  let dictation = null;

  on(el, "click", "[data-act]", async (e, b) => {
    const act = b.dataset.act;
    try {
      if (act === "send") return send();
      if (act === "reset") { session = { turns: [], about: null, questionId: null, entryId: null, started: ctx.now() }; await ctx.store.deleteKv(KEY); return ctx.navigate("#/talk", { replace: true }); }
      if (act === "speak-toggle") {
        speakReplies = !speakReplies;
        await ctx.store.setKv("talk-speak", speakReplies);
        el.querySelector("[data-speak-label]").textContent = speakReplies ? "Reading replies aloud" : "Read replies aloud";
        return;
      }
      if (act === "dictate") {
        const { createLiveDictation, webSpeechSupported } = await import("../voice/transcribe.js");
        if (!webSpeechSupported()) return toast("This browser has no built-in dictation.");
        if (dictation) { const t = await dictation.stop(); dictation = null; b.classList.remove("primary"); if (t) { input.value = (input.value ? input.value + " " : "") + t; input.dispatchEvent(new Event("input")); } return; }
        const base = input.value;
        dictation = createLiveDictation({ lang: ctx.settings().transcription.language, onText: (f, i) => { input.value = (base ? base + " " : "") + f + (i ? " " + i : ""); input.dispatchEvent(new Event("input")); }, onError: (err) => toast(err.message, { error: true }) });
        dictation.start();
        b.classList.add("primary");
        return;
      }
      if (act === "finish") return finish();
    } catch (err) { errorToast(err); }
  });

  async function finish() {
    const mine = session.turns.filter((t) => t.role === "self");
    if (!mine.length) return toast("Say something first — even a sentence.");
    const myWords = mine.map((t) => t.text).join("\n\n");
    const choice = await sheet({
      title: "Make this an entry",
      body: html`<p style="margin-top:0">How should the entry be written?</p>
        <div class="stack-sm">
          <button class="day-field" data-c="draft"><span class="k">Draft it</span><span class="v small" style="font-family:var(--font-ui)">The AI writes a first-person entry from your side of the conversation only. You review it, with any added meaning flagged.</span></button>
          <button class="day-field" data-c="mine"><span class="k">My words only</span><span class="v small" style="font-family:var(--font-ui)">Your messages, as you wrote them, one after another.</span></button></div>`,
      setup: (d, close) => on(d, "click", "[data-c]", (ev, x) => close(x.dataset.c)),
    });
    if (!choice) return;
    let text = myWords, title = "", draftedBy;
    if (choice === "draft") {
      const close = toast("Drafting from your words…", { timeout: 0 });
      try {
        const ai = await ctx.ai.get();
        const d = await ai.draftEntry(session.turns);
        text = d.entry_text || myWords;
        title = d.title || "";
        draftedBy = `ai:${ai.model}`;
      } catch (err) { close(); return errorToast(err); }
      close();
    }
    const fid = checkFidelity(myWords, text);
    const shortened = fid.warnings.filter((w) => w.type !== "shortened" && w.type !== "dropped-words");
    const final = await sheet({
      title: "Review the entry",
      wide: true,
      body: html`${draftedBy ? (shortened.length ? html`<ul class="warnings">${shortened.map((w) => html`<li class="${w.severity}">${raw(icon(w.severity === "warn" ? "warn" : "info"))}<span>${w.message}</span></li>`)}</ul>` : html`<div class="notice ok">${raw(icon("check"))}<span>No added meaning detected against what you said.</span></div>`) : ""}
        <label class="field" style="margin-top:12px"><span>Title (optional)</span><input class="input" data-title value="${title}" autocomplete="off"></label>
        <label class="field"><span>Entry</span><textarea class="textarea" data-t style="font-family:var(--font-write);font-size:1.05rem;min-height:220px">${text}</textarea></label>
        ${draftedBy ? html`<details class="layer" style="margin-top:10px"><summary>Compared with your messages</summary><div class="diff">${wordDiff(myWords, text).map((p) => p.op === "same" ? p.text : p.op === "add" ? html`<ins>${p.text}</ins>` : html`<del>${p.text}</del>`)}</div></details>` : ""}`,
      foot: html`<button class="btn" data-close>Back to the conversation</button><button class="btn primary" data-ok>Save entry</button>`,
      setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ text: d.querySelector("[data-t]").value.trim(), title: d.querySelector("[data-title]").value.trim() })),
    });
    if (!final?.text) return;
    const saved = await ctx.store.put(makeEntry({
      kind: "conversation", body: final.text, title: final.title || undefined, tags: extractTags(final.text),
      question: session.questionId || undefined, prompt: !session.questionId && session.about ? session.about : undefined,
      conversation: { turns: session.turns.map(({ role, text: t, at }) => ({ role, text: t, at })), model: ctx.settings().ai.model, drafted_by: draftedBy, about_entry: session.entryId || undefined },
      source: { system: "living-journal", via: "talk", device: ctx.deviceName() },
    }, { tz: ctx.tz() }));
    if (session.questionId) await markQuestionAnswered(ctx, session.questionId, saved.id);
    await ctx.store.deleteKv(KEY);
    toast("Entry saved");
    ctx.navigate(`#/entry/${saved.id}`, { replace: true });
  }
}
