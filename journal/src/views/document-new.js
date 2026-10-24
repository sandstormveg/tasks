// Add a document: preserve the original, its author, date and source; keep
// the author's words, your thoughts and any AI reading as separate layers.
// Documents default to "No AI" — reading is something you opt into.

import { html, raw, on, toast, errorToast, pickFiles, bytes } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { makeEntry, PRIVACY_LEVELS } from "../core/model.js";
import { mediaPath, MIME_EXT } from "../core/format.js";
import { newId } from "../core/ids.js";
import { extractTags } from "../core/markdown.js";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Add a document", { back: "#/library" });
  let file = null;
  const sealingReady = !!ctx.store.config("sealing", null)?.salt && !ctx.store.isLocked();

  el.innerHTML = String(html`
    <div class="stack" style="margin-top:8px">
      <div class="card flat">
        <div class="row"><div class="grow"><b>Original file</b> <span class="faint small">(optional — PDF, image or text)</span><div class="small muted" data-file>None chosen</div></div><button class="btn" data-act="file">${raw(icon("upload"))}Choose</button></div>
      </div>
      <label class="field"><span>Title</span><input class="input" data-title placeholder="e.g. Notes after our session" autocomplete="off"></label>
      <div class="row wrap"><label class="field grow"><span>Written by</span><input class="input" data-author placeholder="e.g. Dr. Lan" autocomplete="off"></label>
        <label class="field grow"><span>Their role</span><input class="input" data-role placeholder="e.g. therapist" list="roles" autocomplete="off"><datalist id="roles"><option>therapist</option><option>doctor</option><option>coach</option><option>teacher</option><option>friend</option><option>family</option><option>myself, earlier</option></datalist></label></div>
      <div class="row wrap"><label class="field grow"><span>Date on the document</span><input class="input" type="date" data-date></label>
        <label class="field grow"><span>Where it came from</span><input class="input" data-source placeholder="e.g. email attachment" autocomplete="off"></label></div>
      <label class="field"><span>Their words (optional)</span><textarea class="textarea" data-text placeholder="Paste the text if you have it — e.g. the email body. It's kept verbatim and attributed to them."></textarea></label>
      <label class="field"><span>Your thoughts (optional)</span><textarea class="textarea" data-thoughts placeholder="What you make of it — now or later."></textarea></label>
      <div><span class="label">Privacy</span>
        <div class="stack-sm" data-privacy>
          ${["no-ai", "normal", "sealed"].map((k) => html`<label class="switch" style="padding:6px 0"><input type="radio" name="priv" value="${k}" ${k === "no-ai" ? "checked" : ""} ${k === "sealed" && !sealingReady ? "disabled" : ""}><span><span class="t">${PRIVACY_LEVELS[k].label}${k === "normal" ? " — and allow AI reading" : ""}</span><br><span class="d">${PRIVACY_LEVELS[k].hint}${k === "sealed" && !sealingReady ? " (Set up or unlock in Settings → Privacy.)" : ""}</span></span></label>`)}
        </div></div>
      <div class="btn-row end"><a class="btn" href="#/library">Cancel</a><button class="btn primary" data-act="save">Save document</button></div>
    </div>`);

  on(el, "click", "[data-act]", async (e, b) => {
    try {
      if (b.dataset.act === "file") {
        const [f] = await pickFiles({ accept: "application/pdf,image/*,text/plain,text/markdown,.md,.txt" });
        if (!f) return;
        file = f;
        el.querySelector("[data-file]").textContent = `${f.name} · ${bytes(f.size)}`;
        const t = el.querySelector("[data-title]");
        if (!t.value) t.value = f.name.replace(/\.[a-z0-9]+$/i, "");
        if (f.type.startsWith("text/") && !el.querySelector("[data-text]").value) el.querySelector("[data-text]").value = await f.text();
        return;
      }
      if (b.dataset.act === "save") {
        const v = (s) => el.querySelector(s).value.trim();
        const privacy = el.querySelector("[name=priv]:checked").value;
        if (!v("[data-title]") && !file && !v("[data-text]")) return toast("Add a title, a file or some text.");
        const day = ctx.today();
        const media = [];
        let originalId;
        if (file) {
          originalId = newId("m", ctx.now());
          const mime = file.type || "application/octet-stream";
          const ext = MIME_EXT[mime] || (file.name.split(".").pop() || "bin").toLowerCase();
          const path = mediaPath(day, originalId, ext, { sealed: privacy === "sealed" });
          await ctx.store.putBlob(path, file, { mime, sealed: privacy === "sealed" });
          media.push({ id: originalId, type: mime.startsWith("image/") ? "photo" : "file", mime, path, bytes: file.size, original_name: file.name, role: "original" });
        }
        const thoughts = v("[data-thoughts]");
        const entry = makeEntry({
          kind: "document", day, privacy, media, body: thoughts, tags: extractTags(thoughts),
          document: {
            title: v("[data-title]") || file?.name, author: v("[data-author]") || undefined, author_role: v("[data-role]") || undefined,
            date: v("[data-date]") || undefined, source: v("[data-source]") || undefined, text: v("[data-text]") || undefined,
            original: originalId, ai_allowed: privacy === "normal",
          },
          source: { system: "living-journal", via: "document", device: ctx.deviceName() },
        }, { tz: ctx.tz() });
        const saved = await ctx.store.put(entry);
        toast("Document saved");
        ctx.navigate(`#/entry/${saved.id}`, { replace: true });
      }
    } catch (err) { errorToast(err); }
  });
}
