// The everything donut: the Deposit's way in. Paste, type, drop or pick anything
// — a link, a list of links, a DOI, a quote, a half-thought, a picture, a PDF —
// and it's sorted into what it is (core/sources.js sortDrop) and saved to the
// Deposit, one item per thing. Nothing is lost to a guess: what isn't a link or
// a quote is kept whole as a thought, and files are kept as they are.
//
// The panel is built once and lives above the Deposit's list, so the list can
// redraw as things arrive without wiping what you're typing.

import { html, raw, toast } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { sortDrop, kindOfFile, makeSource } from "../core/sources.js";
import { mediaPath, MIME_EXT } from "../core/format.js";
import { newId } from "../core/ids.js";
import { capture } from "./ui.js";
import { saveImages } from "./images.js";

const MAX_FILE = 25 * 1024 * 1024; // the sync repo holds files; keep them reasonable
const TEXT_FILE = /^text\/|\/(json|xml|markdown)$/;

/** Keep a file that isn't a picture as it is, as a source of its kind (a PDF is a paper). */
async function saveFile(ctx, file, fields = {}) {
  const now = ctx.now();
  const id = newId("m", now);
  const ext = MIME_EXT[file.type] || (/\.([a-z0-9]{1,5})$/i.exec(file.name || "")?.[1] || "bin").toLowerCase();
  const path = mediaPath(now.slice(0, 10), id, ext);
  await ctx.store.putBlob(path, file, { mime: file.type || "application/octet-stream" });
  const title = String(file.name || "File").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").trim() || "File";
  const media = [{ id, type: "file", mime: file.type || undefined, path, size: file.size, original_name: file.name || undefined }];
  return ctx.store.put(makeSource({ ...fields, kind: kindOfFile(file.type, file.name), title, media }, { now, device: ctx.deviceName(), via: "app" }));
}

async function saveQuote(ctx, { text, who }, fields = {}) {
  const short = text.length > 90 ? `${text.slice(0, 87).replace(/\s+\S*$/, "")}…` : text;
  const rec = makeSource({ ...fields, kind: "thought", title: `“${short}”`, quotes: [{ text }], authors: who ? [who] : undefined }, { now: ctx.now(), device: ctx.deviceName(), via: "app" });
  return ctx.store.put(rec);
}

const NAMES = { link: ["link", "links"], paper: ["paper", "papers"], quote: ["quote", "quotes"], thought: ["thought", "thoughts"], image: ["picture", "pictures"], file: ["file", "files"], dup: ["already saved", "already saved"] };
export const tally = (counts) => Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(" · ");

/** What `text` and `files` would become, without saving: { link: 2, quote: 1, … }. */
export function preview(text = "", files = []) {
  const counts = {};
  for (const it of sortDrop(text)) counts[it.sort] = (counts[it.sort] || 0) + 1;
  for (const f of files) { const k = String(f.type).startsWith("image/") ? "image" : "file"; counts[k] = (counts[k] || 0) + 1; }
  return counts;
}

/** Sort and save everything; returns { counts, saved }. */
export async function depositAnything(ctx, { text = "", files = [] } = {}, fields = { status: "inbox" }) {
  const counts = {};
  const saved = [];
  const bump = (k, rec) => { counts[k] = (counts[k] || 0) + 1; if (rec) saved.push(rec); };
  const all = [...files];
  // A text file is words: sort what's in it like anything pasted.
  for (const f of all.filter((f) => TEXT_FILE.test(f.type) || /\.(txt|md)$/i.test(f.name || ""))) text = `${text}\n${await f.text()}`.trim();
  const images = all.filter((f) => String(f.type).startsWith("image/"));
  const others = all.filter((f) => !images.includes(f) && !(TEXT_FILE.test(f.type) || /\.(txt|md)$/i.test(f.name || "")));
  if (images.length) for (const r of await saveImages(ctx, images, fields)) bump("image", r);
  for (const f of others) {
    if (f.size > MAX_FILE) { toast(`${f.name} is too big to keep here (over 25 MB) — save a link to it instead.`, { error: true }); continue; }
    bump("file", await saveFile(ctx, f, fields));
  }
  for (const it of sortDrop(text)) {
    if (it.sort === "quote") { bump("quote", await saveQuote(ctx, it, fields)); continue; }
    const { source, existing } = await capture(ctx, { text: it.text, via: "app" }, { ...fields });
    if (!source) continue;
    bump(existing ? "dup" : it.sort, existing ? null : source);
  }
  return { counts, saved };
}

const READ_CLIPBOARD = typeof navigator !== "undefined" && !!navigator.clipboard?.read;

/** The donut panel, mounted once into `el`. */
export function mountDonut(el, ctx) {
  el.innerHTML = String(html`<section class="donut-dock" aria-label="Add anything to your Deposit">
    <button type="button" class="donut" data-donut aria-label="Add anything — tap to paste or pick files">
      <span class="donut-ring"></span><span class="donut-sprinkles"></span><span class="donut-hole">${raw(icon("plus"))}</span>
    </button>
    <div class="donut-side">
      <div class="donut-kicker">The everything donut</div>
      <textarea class="textarea donut-in" data-donut-in rows="3" placeholder="Paste or type anything — links (a whole list), a DOI, “a quote” — Who said it, a half-thought. Drop pictures, PDFs or files here." aria-label="Paste or type anything"></textarea>
      <div class="donut-row">
        <span class="small faint donut-sorts" data-donut-sorts aria-live="polite">It sorts itself: links, papers, quotes, thoughts, pictures, files.</span>
        <span class="grow"></span>
        ${READ_CLIPBOARD ? html`<button type="button" class="btn small" data-donut-paste>${raw(icon("file"))}Paste</button>` : ""}
        <button type="button" class="btn small" data-donut-files>${raw(icon("upload"))}Files</button>
        <button type="button" class="btn small primary" data-donut-go disabled>Deposit</button>
      </div>
      <input type="file" multiple hidden data-donut-file-in>
    </div>
  </section>`);
  const dock = el.querySelector(".donut-dock");
  const donut = dock.querySelector("[data-donut]");
  const input = dock.querySelector("[data-donut-in]");
  const sorts = dock.querySelector("[data-donut-sorts]");
  const go = dock.querySelector("[data-donut-go]");
  const fileIn = dock.querySelector("[data-donut-file-in]");
  const hint = sorts.textContent;

  const show = () => {
    const c = preview(input.value);
    go.disabled = !input.value.trim();
    sorts.textContent = input.value.trim() ? `Looks like: ${tally(c)}` : hint;
  };
  async function eat(payload) {
    if (!payload.text?.trim() && !payload.files?.length) return;
    dock.classList.add("eating");
    try {
      const { counts, saved } = await depositAnything(ctx, payload);
      const said = tally(counts);
      if (!said) { toast("Nothing in that to save.", { error: true }); return; }
      toast(`Deposited: ${said}`, saved.length === 1 ? { action: "Open", onAction: () => ctx.navigate(`#/source/${saved[0].id}`) } : {});
      if (payload.text && payload.text === input.value) { input.value = ""; show(); }
    } finally { setTimeout(() => dock.classList.remove("eating"), 700); }
  }

  input.addEventListener("input", show);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); eat({ text: input.value }); } });
  go.addEventListener("click", () => eat({ text: input.value }));
  // Pasting files (a screenshot, a copied picture) deposits them at once; pasted words wait for you to look.
  dock.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    eat({ files, text: e.target === input ? "" : e.clipboardData.getData("text/plain") });
  });
  dock.querySelector("[data-donut-files]").addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", () => { eat({ files: [...fileIn.files] }); fileIn.value = ""; });
  dock.querySelector("[data-donut-paste]")?.addEventListener("click", () => pasteClipboard());
  donut.addEventListener("click", () => (READ_CLIPBOARD ? pasteClipboard() : input.focus()));

  // The clipboard, read on a tap (the browser asks first). Pictures go straight in; words go in the box.
  async function pasteClipboard() {
    try {
      const files = [];
      let text = "";
      for (const item of await navigator.clipboard.read()) {
        const img = item.types.find((t) => t.startsWith("image/"));
        if (img) { const b = await item.getType(img); files.push(new File([b], `pasted.${MIME_EXT[img] || "png"}`, { type: img })); }
        else if (item.types.includes("text/plain")) text += `${await (await item.getType("text/plain")).text()}\n`;
      }
      if (files.length) return eat({ files });
      if (text.trim()) { input.value = `${input.value ? `${input.value}\n` : ""}${text.trim()}`; show(); input.focus(); return; }
      toast("The clipboard is empty — copy something first.");
    } catch { input.focus(); toast("Paste into the box (long-press, then Paste) — the browser didn't let me read the clipboard."); }
  }

  // Drop onto the donut or anywhere on the panel.
  const over = (e) => { if ([...(e.dataTransfer?.types || [])].some((t) => t === "Files" || t === "text/plain" || t === "text/uri-list")) { e.preventDefault(); dock.classList.add("over"); } };
  dock.addEventListener("dragover", over);
  dock.addEventListener("dragleave", (e) => { if (!dock.contains(e.relatedTarget)) dock.classList.remove("over"); });
  dock.addEventListener("drop", (e) => {
    e.preventDefault();
    dock.classList.remove("over");
    const files = [...(e.dataTransfer?.files || [])];
    const text = files.length ? "" : e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    eat({ files, text });
  });
  return { focus: () => input.focus() };
}
