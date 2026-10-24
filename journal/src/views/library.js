// Library: documents (often written by someone else — a therapist's notes,
// a letter), pasted writing and imported AI conversations. Each keeps its
// author, date and source; the original is preserved.

import { html, raw, on, sheet, toast, errorToast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { entryCard } from "../ui/components.js";
import { makeEntry } from "../core/model.js";
import { parseConversation } from "../core/conversation.js";
import { extractTags } from "../core/markdown.js";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Library");

  function render() {
    const all = ctx.store.all("entry");
    const docs = all.filter((e) => e.kind === "document").sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const convos = all.filter((e) => e.kind === "conversation").sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const readings = ctx.store.all("interpretation").filter((i) => i.status !== "dismissed" && i.kind !== "connection");
    el.innerHTML = String(html`
      <h2 class="view-title">Library</h2>
      <p class="view-sub">Documents and conversations, kept with their author and source. Someone else's words stay theirs; an AI's reading stays labelled as one.</p>
      <div class="btn-row"><a class="btn primary" href="#/document/new">${raw(icon("file"))}Add a document</a><button class="btn" data-act="paste">${raw(icon("chat"))}Paste text or a conversation</button></div>
      <div class="section-title">Documents</div>
      ${docs.length ? docs.map((e) => entryCard(e, { showDay: true, today: ctx.today() })) : html`<p class="muted">Add notes from a therapist, a letter, a PDF — anything worth connecting to your experiences. Documents default to <b>No AI</b>; you choose.</p>`}
      <div class="section-title">Conversations</div>
      ${convos.length ? convos.map((e) => entryCard(e, { showDay: true, today: ctx.today() })) : html`<p class="muted">Conversations from “Talk it through”, or ones you paste from ChatGPT, Claude or elsewhere.</p>`}
      ${readings.length ? html`<div class="section-title">AI readings</div><p class="small muted">${readings.length} saved reading${readings.length === 1 ? "" : "s"}, each attached to its document and labelled as hypotheses.</p>` : ""}`);
    ctx.media.hydrate(el);
  }
  render();
  ui.onStore(() => render());

  on(el, "click", "[data-act=paste]", async () => {
    const v = await sheet({
      title: "Paste text or a conversation",
      body: html`<label class="field"><span>Text</span><textarea class="textarea" data-t autofocus style="min-height:200px" placeholder="Paste writing, notes, or a whole conversation. Lines starting with “You:”, “ChatGPT:”, “Claude:”, “User:”, “Assistant:” are recognised as turns."></textarea></label>
        <div class="row"><label class="field grow"><span>Date</span><input class="input" type="date" data-d value="${ctx.today()}"></label>
        <label class="field grow"><span>From</span><select class="select" data-s><option value="">Somewhere else</option><option>ChatGPT</option><option>Claude</option><option>Notes app</option><option>Email</option></select></label></div>
        <label class="switch"><input type="checkbox" data-noai><span><span class="t">No AI</span><br><span class="d">Never send this to any AI</span></span></label>`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => close({ t: d.querySelector("[data-t]").value, day: d.querySelector("[data-d]").value, from: d.querySelector("[data-s]").value, noai: d.querySelector("[data-noai]").checked })),
    });
    if (!v?.t?.trim()) return;
    try {
      const turns = parseConversation(v.t);
      const isConvo = turns.length >= 2;
      const e = makeEntry({
        kind: isConvo ? "conversation" : "text",
        day: v.day || ctx.today(),
        body: isConvo ? turns.filter((t) => t.role === "self").map((t) => t.text).join("\n\n") : v.t.trim(),
        tags: extractTags(v.t),
        privacy: v.noai ? "no-ai" : "normal",
        conversation: isConvo ? { turns, imported_from: v.from || undefined, original: v.t } : undefined,
        source: { system: "paste", from: v.from || undefined },
        title: isConvo && v.from ? `Conversation with ${v.from}` : undefined,
      }, { tz: ctx.tz() });
      const saved = await ctx.store.put(e);
      toast(isConvo ? `Saved: ${turns.filter((t) => t.role === "self").length} of your turns as the entry, the full conversation alongside.` : "Saved", { action: "Open", onAction: () => ctx.navigate(`#/entry/${saved.id}`) });
    } catch (err) { errorToast(err); }
  });
}
