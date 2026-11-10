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
import { capture, addSheet } from "./ui.js";
import { saveImages } from "./images.js";
import { videoArchiveRoute } from "./video-routing.js";

const MAX_FILE = 25 * 1024 * 1024; // the sync repo holds files; keep them reasonable
const TEXT_FILE = /^text\/|\/(json|xml|markdown)$/;

/** Store a file as it is in the sync folder; returns its media item. */
async function keepFile(ctx, file) {
  const now = ctx.now();
  const id = newId("m", now);
  const ext = MIME_EXT[file.type] || (/\.([a-z0-9]{1,5})$/i.exec(file.name || "")?.[1] || "bin").toLowerCase();
  const path = mediaPath(now.slice(0, 10), id, ext);
  await ctx.store.putBlob(path, file, { mime: file.type || "application/octet-stream" });
  return { id, type: "file", mime: file.type || undefined, path, size: file.size, original_name: file.name || undefined };
}

/** Keep a file that isn't a picture as it is, as a source of its kind (a PDF is a paper). */
async function saveFile(ctx, file, fields = {}) {
  const title = String(file.name || "File").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").trim() || "File";
  const media = [await keepFile(ctx, file)];
  return ctx.store.put(makeSource({ ...fields, kind: kindOfFile(file.type, file.name), title, media }, { now: ctx.now(), device: ctx.deviceName(), via: "app" }));
}

/** Attach files (PDFs, pictures, anything) to an existing source, kept as they are. Returns how many. */
export async function attachFiles(ctx, source, files) {
  const media = [];
  for (const f of files) {
    if (f.size > MAX_FILE) { toast(`${f.name} is too big to keep here (over 25 MB) — save a link to it instead.`, { error: true }); continue; }
    media.push(await keepFile(ctx, f));
  }
  if (media.length) {
    const s = ctx.store.get(source.id) || source;
    await ctx.store.put({ ...s, media: [...(s.media || []), ...media] });
  }
  return media.length;
}

async function saveQuote(ctx, { text, who }, fields = {}) {
  const short = text.length > 90 ? `${text.slice(0, 87).replace(/\s+\S*$/, "")}…` : text;
  const rec = makeSource({ ...fields, kind: "thought", title: `“${short}”`, quotes: [{ text }], authors: who ? [who] : undefined }, { now: ctx.now(), device: ctx.deviceName(), via: "app" });
  return ctx.store.put(rec);
}

const NAMES = { attached: ["file attached", "files attached"], link: ["link", "links"], paper: ["paper", "papers"], quote: ["quote", "quotes"], thought: ["thought", "thoughts"], image: ["picture", "pictures"], file: ["file", "files"], dup: ["already saved", "already saved"] };
export const tally = (counts) => Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(" · ");

/** What `text` and `files` would become, without saving: { link: 2, quote: 1, … }. */
export function preview(text = "", files = []) {
  const counts = {};
  for (const it of sortDrop(text)) counts[it.sort] = (counts[it.sort] || 0) + 1;
  for (const f of files) { const k = String(f.type).startsWith("image/") ? "image" : "file"; counts[k] = (counts[k] || 0) + 1; }
  return counts;
}

/**
 * Sort and save everything; returns { counts, saved }. With attach, the files go with what was typed:
 * they're kept on the first thing it becomes (or the one already saved), not as sources of their own.
 */
export async function depositAnything(ctx, { text = "", files = [], attach = false } = {}, fields = { status: "inbox" }) {
  const counts = {};
  const saved = [];
  const videos = [];
  const bump = (k, rec) => { counts[k] = (counts[k] || 0) + 1; if (rec) saved.push(rec); };
  if (attach && files.length && sortDrop(text).length) {
    let home = null;
    for (const it of sortDrop(text)) {
      if (it.sort === "quote") { const r = await saveQuote(ctx, it, fields); home ||= r; bump("quote", r); continue; }
      const { source, existing } = await capture(ctx, { text: it.text, via: "app" }, { ...fields });
      if (!source) continue;
      home ||= existing || source;
      bump(existing ? "dup" : it.sort, existing ? null : source);
    }
    if (home) {
      const n = await attachFiles(ctx, home, files);
      if (n) counts.attached = n;
      if (!saved.includes(home)) saved.unshift(ctx.store.get(home.id) || home);
      return { counts, saved, videos };
    }
  }
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
    if (source.kind === "video") videos.push(source);
    bump(existing ? "dup" : it.sort, existing ? null : source);
  }
  return { counts, saved, videos };
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
        <button type="button" class="btn small ghost" data-donut-more title="Add with a title, why, tags and where it goes">More…</button>
        <button type="button" class="btn small" data-donut-files>${raw(icon("upload"))}Files</button>
        <button type="button" class="btn small primary" data-donut-go disabled>Deposit</button>
      </div>
      <div class="donut-held" data-donut-held hidden></div>
      <input type="file" multiple hidden data-donut-file-in>
    </div>
  </section>`);
  const dock = el.querySelector(".donut-dock");
  const donut = dock.querySelector("[data-donut]");
  const input = dock.querySelector("[data-donut-in]");
  const sorts = dock.querySelector("[data-donut-sorts]");
  const go = dock.querySelector("[data-donut-go]");
  const fileIn = dock.querySelector("[data-donut-file-in]");
  const heldEl = dock.querySelector("[data-donut-held]");
  const hint = sorts.textContent;
  // Files picked or dropped while there's something typed wait here and go with it on Deposit.
  let held = [];

  const show = () => {
    const c = preview(input.value);
    go.disabled = !input.value.trim() && !held.length;
    sorts.textContent = input.value.trim() ? `Looks like: ${tally(c)}${held.length ? `, with ${held.length} file${held.length === 1 ? "" : "s"} attached` : ""}` : held.length ? "Type what these files go with, or Deposit them as they are." : hint;
    heldEl.hidden = !held.length;
    heldEl.innerHTML = String(html`${held.map((f, i) => html`<span class="chip held-file">${raw(icon("file"))}${f.name || "file"}<button type="button" class="btn icon small ghost" data-unhold="${i}" aria-label="Don't attach ${f.name || "this file"}">✕</button></span>`)}`);
  };
  const take = (files) => {
    if (!files.length) return;
    if (input.value.trim()) { held = [...held, ...files]; show(); toast(`Attached to what you typed — Deposit to keep ${files.length === 1 ? "it" : "them"} together.`); }
    else eat({ files });
  };
  heldEl.addEventListener("click", (e) => { const b = e.target.closest("[data-unhold]"); if (b) { held.splice(Number(b.dataset.unhold), 1); show(); } });
  const deposit = () => {
    const files = held;
    held = [];
    eat(input.value.trim() ? { text: input.value, files, attach: files.length > 0 } : { files });
    show();
  };
  async function eat(payload) {
    if (!payload.text?.trim() && !payload.files?.length) return;
    dock.classList.add("eating");
    try {
      const { counts, saved, videos } = await depositAnything(ctx, payload);
      const said = tally(counts);
      if (!said) { toast("Nothing in that to save.", { error: true }); return; }
      const videoRoute = videoArchiveRoute(videos[0]);
      if (videoRoute) {
        ctx.navigate(videoRoute);
        toast("Opened in Video archive");
        if (payload.text && payload.text === input.value) { input.value = ""; show(); }
        return;
      }
      toast(`Deposited: ${said}`, saved.length === 1 ? { action: "Open", onAction: () => ctx.navigate(`#/source/${saved[0].id}`) } : {});
      if (payload.text && payload.text === input.value) { input.value = ""; show(); }
    } finally { setTimeout(() => dock.classList.remove("eating"), 700); }
  }

  input.addEventListener("input", show);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); deposit(); } });
  go.addEventListener("click", deposit);
  // Pasting files (a screenshot, a copied picture) deposits them at once; pasted words wait for you to look.
  dock.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    if (e.target === input) take(files);
    else eat({ files, text: e.clipboardData.getData("text/plain") });
  });
  dock.querySelector("[data-donut-files]").addEventListener("click", () => fileIn.click());
  // The full Add sheet — title, why, tags, reading status — starting from whatever's in the box.
  dock.querySelector("[data-donut-more]").addEventListener("click", async () => {
    const text = input.value;
    const saved = await addSheet(ctx, { status: "inbox", text });
    if (saved && input.value === text) { input.value = ""; show(); }
  });
  fileIn.addEventListener("change", () => { take([...fileIn.files]); fileIn.value = ""; });
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
      if (files.length) return take(files);
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
    if (files.length) return take(files);
    eat({ text: e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") });
  });
  return { focus: () => input.focus() };
}
