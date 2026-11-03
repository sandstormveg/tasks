// Research's shared pieces: the card a source shows as in lists, quick status
// changes, saving what you share (or paste) without duplicates, the Add sheet,
// and delete with Undo.

import { html, raw, sheet, toast, on, debounce } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import {
  STATUSES, KINDS, makeSource, statusPatch, formatAuthors, findDuplicate, parseShared, cleanTags, tagCounts, guessTitle,
} from "../core/sources.js";
import { lookupDoi } from "./lookup.js";
import { makePin, makeString, placeNear, defaultSize, boardParts } from "../core/boards.js";
import { suggestHomes, homesFrom } from "../core/deposit.js";
import { saveImages, imageOf, imagePinSize, imagesFrom } from "./images.js";

// What a card offers, by status: the next step in reading, without opening it.
const NEXT = {
  inbox: [["to-read", "To read"], ["read", "Read"], ["dropped", "Drop"]],
  filed: [],
  "to-read": [["reading", "Start"], ["read", "Read"]],
  reading: [["read", "Done"]],
  read: [],
  dropped: [["to-read", "To read"]],
};

export function sourceCard(s, { actions = true, extra = "" } = {}) {
  const by = [formatAuthors(s.authors), s.year].filter(Boolean).join(", ");
  return html`<div class="src-card" data-id="${s.id}">
    <a class="src-main" href="#/source/${s.id}">
      ${imageOf(s) ? html`<img class="src-img" data-media="${imageOf(s).thumb || imageOf(s).path}" data-fallback="${imageOf(s).path}" alt="" loading="lazy">` : ""}
      <div class="src-title">${s.favourite ? html`<span class="fav" aria-label="Favourite">${raw(icon("star"))}</span>` : ""}${s.title || s.url}</div>
      <div class="src-meta">${[s.site, by, s.kind && s.kind !== "article" ? KINDS[s.kind] : ""].filter(Boolean).join(" · ")}</div>
      ${s.tags?.length ? html`<div class="src-tags">${s.tags.map((t) => html`<span class="tag">#${t}</span>`)}</div>` : ""}
      ${s.why ? html`<div class="src-why">${s.why}</div>` : ""}
      ${s.kind === "thought" && s.body ? html`<div class="src-thought">${s.body.slice(0, 280)}${s.body.length > 280 ? "…" : ""}</div>` : ""}
    </a>
    ${actions && NEXT[s.status]?.length ? html`<div class="src-actions">${NEXT[s.status].map(([st, label]) => html`<button class="btn small ${st === "dropped" ? "ghost" : ""}" data-act="move" data-id="${s.id}" data-to="${st}">${label}</button>`)}</div>` : ""}
    ${extra}
  </div>`;
}

/** Move a source along (Inbox → To read → Reading → Read), stamping when you started and finished. */
export async function moveSource(ctx, id, status) {
  const s = ctx.store.get(id);
  if (!s) return;
  await ctx.store.put({ ...s, ...statusPatch(s, status, ctx.now()) });
  const label = STATUSES[status];
  toast(status === "dropped" ? "Dropped" : `Moved to ${label}`, { timeout: 2500 });
}

/**
 * Fill paper details from Crossref/DataCite in the background — never over what you typed.
 * A title that came with a share (often just the site's or app's name) is replaced by the
 * paper's own, unless you've changed it since.
 */
async function fillFromDoi(ctx, id, { replaceTitle }) {
  const s = ctx.store.get(id);
  if (!s?.doi) return;
  const meta = await lookupDoi(s.doi);
  const now = ctx.store.get(id);
  if (!meta || !now) return;
  const patch = {};
  if (meta.title && (!now.title || (replaceTitle !== undefined && now.title === replaceTitle))) patch.title = meta.title;
  if (meta.authors?.length && !now.authors?.length) patch.authors = meta.authors;
  if (meta.year && !now.year) patch.year = meta.year;
  if (meta.kind && now.kind === "article") patch.kind = meta.kind;
  if (meta.site && (!now.site || now.site === "doi.org" || now.site === "arxiv.org")) patch.site = meta.site;
  if (Object.keys(patch).length) await ctx.store.put({ ...now, ...patch });
}

/**
 * Save what was shared or pasted: { title, text, url, via }. Returns
 * { source, existing } — an existing source with the same link or DOI is
 * returned instead of saving a second copy.
 */
export async function capture(ctx, params, extra = {}) {
  const shared = parseShared(params);
  if (!shared.url && !shared.doi) return captureThought(ctx, params, extra);
  const existing = findDuplicate(ctx.sources(), { url: shared.url, doi: shared.doi });
  if (existing) return { source: existing, existing: true };
  const rec = makeSource({
    url: shared.url || (shared.doi ? `https://doi.org/${shared.doi}` : undefined),
    title: extra.title || shared.title,
    doi: shared.doi || undefined,
    ...extra,
  }, { now: ctx.now(), device: ctx.deviceName(), via: params.via || "share" });
  Object.assign(rec, statusPatch(rec, rec.status, ctx.now())); // saved as already read: finished now
  const saved = await ctx.store.put(rec);
  // extra.title is typed in the Add sheet; anything else came with the link.
  if (saved.doi) fillFromDoi(ctx, saved.id, { replaceTitle: extra.title ? undefined : saved.title }).catch(() => {});
  return { source: saved };
}

/**
 * Something with no link — a quote, a half-thought, shared text: it goes in the
 * Deposit as a thought. Its first line is its title; the rest is kept whole.
 */
async function captureThought(ctx, params, extra = {}) {
  const text = [params.title, params.text].map((t) => String(t || "").trim()).filter(Boolean).join("\n").trim();
  if (!text && !extra.title) return { source: null };
  const first = (extra.title || text.split("\n")[0]).trim();
  const title = first.length > 120 ? `${first.slice(0, 117).replace(/\s+\S*$/, "")}…` : first;
  const rest = text === first ? "" : text;
  const rec = makeSource({ ...extra, kind: "thought", title, body: first.length > 120 ? text : rest }, { now: ctx.now(), device: ctx.deviceName(), via: params.via || "share" });
  return { source: await ctx.store.put(rec) };
}

/** Where a deposited item could go: the boards and pieces it shares the most with. */
export function homesFor(ctx, source) {
  const cards = Object.fromEntries(ctx.cards().map((c) => [c.id, c]));
  const sources = Object.fromEntries(ctx.sources().map((s) => [s.id, s]));
  return suggestHomes(source, homesFrom(ctx.records(), { cards, sources }));
}

/**
 * File a deposited item: pin it to a board — next to the pins it shares the most
 * with, tied to them by red string (noticed, not synthesised) — or link it to a
 * piece of writing. A thought becomes "filed"; a link waiting in the Deposit moves to To read.
 */
export async function fileTo(ctx, sourceId, home) {
  const s = ctx.store.get(sourceId);
  if (!s) return null;
  const now = ctx.now();
  let pinId = null;
  if (home.kind === "board") {
    const { pins } = boardParts(ctx.records(), home.id);
    const near = (home.near || []).map((n) => pins.find((p) => p.id === n.id)).filter(Boolean);
    const size = imageOf(s) ? imagePinSize(s) : defaultSize("source");
    const spot = placeNear(pins, { anchor: near[0] || null, ...size });
    const pin = makePin({ board: home.id, kind: "source", source: s.id, title: s.title, ...spot }, { now });
    await ctx.store.put(pin);
    pinId = pin.id;
    for (const n of home.near || []) {
      if (!pins.some((p) => p.id === n.id)) continue;
      await ctx.store.put(makeString({ board: home.id, from: pin.id, to: n.id, label: n.shared?.length ? `shares: ${n.shared.slice(0, 3).join(", ")}` : undefined }, { now }));
    }
  } else if (home.kind === "piece") {
    const p = ctx.store.get(home.id);
    if (p) await ctx.store.put({ ...p, sources: [...new Set([...(p.sources || []), s.id])], updated: now });
  }
  if (s.status === "inbox") await ctx.store.put({ ...ctx.store.get(s.id), ...(s.kind === "thought" ? { status: "filed" } : statusPatch(s, "to-read", now)) });
  const title = home.title || ctx.store.get(home.id)?.title || "";
  toast(home.kind === "board" ? `Pinned to “${title}”${home.near?.length ? ` with ${home.near.length} red string${home.near.length === 1 ? "" : "s"}` : ""}` : `Linked to “${title}”`, {
    action: "Open", onAction: () => ctx.navigate(home.kind === "board" ? `#/board/${home.id}?focus=${pinId}` : `#/piece/${home.id}`),
  });
  return pinId;
}

/** Pick any board or piece to file something to (when the suggestions aren't it). */
export async function fileElsewhere(ctx, sourceId) {
  const boards = ctx.boards().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const pieces = ctx.pieces();
  const pick = await sheet({
    title: "File it to…",
    body: html`${boards.length ? html`<div class="pick-head">Boards</div>${boards.map((b) => html`<button type="button" class="pick" data-k="board" data-id="${b.id}"><b>${b.title}</b></button>`)}` : ""}
      ${pieces.length ? html`<div class="pick-head">Writing</div>${pieces.map((p) => html`<button type="button" class="pick" data-k="piece" data-id="${p.id}"><b>${p.title}</b></button>`)}` : ""}
      ${!boards.length && !pieces.length ? html`<p class="faint">No boards or pieces yet — make one under Boards or Writing.</p>` : ""}`,
    foot: html`<button class="btn" data-close>Cancel</button>`,
    setup: (d, close) => on(d, "click", "[data-id]", (e, b) => close({ kind: b.dataset.k, id: b.dataset.id })),
  });
  if (!pick) return null;
  const suggested = homesFor(ctx, ctx.store.get(sourceId)).find((h) => h.id === pick.id);
  return fileTo(ctx, sourceId, suggested || pick);
}

/** A tag field: type, then Enter or comma; your existing tags are offered as you type. */
export function tagInput(ctx, initial = []) {
  const tags = [...initial];
  const known = tagCounts(ctx.sources()).map(([t]) => t);
  const render = (box) => {
    box.querySelector("[data-tags]").innerHTML = String(html`${tags.map((t) => html`<span class="tag on">#${t}<button type="button" data-rm-tag="${t}" aria-label="Remove ${t}">×</button></span>`)}`);
    const q = box.querySelector("[data-tag-in]").value.trim().toLowerCase().replace(/^#/, "");
    const offer = known.filter((t) => !tags.includes(t) && (!q || t.includes(q))).slice(0, 8);
    box.querySelector("[data-tag-offer]").innerHTML = String(html`${offer.map((t) => html`<button type="button" class="tag" data-add-tag="${t}">#${t}</button>`)}`);
  };
  return {
    tags,
    markup: html`<div class="tag-field" data-tag-field><div class="tag-row" data-tags></div>
      <input class="input" data-tag-in placeholder="Add a tag — e.g. s-risk" autocomplete="off" autocapitalize="off" enterkeyhint="done">
      <div class="tag-row offer" data-tag-offer></div></div>`,
    wire(box, onChange = () => {}) {
      const field = box.querySelector("[data-tag-field]");
      const input = field.querySelector("[data-tag-in]");
      const add = (raw) => {
        for (const t of cleanTags(String(raw).split(/[,\s]+/))) if (!tags.includes(t)) tags.push(t);
        input.value = "";
        render(field);
        onChange(tags);
      };
      input.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === ",") && input.value.trim()) { e.preventDefault(); add(input.value); }
        else if (e.key === "Backspace" && !input.value && tags.length) { tags.pop(); render(field); onChange(tags); }
      });
      input.addEventListener("input", () => { if (/[,]\s*$/.test(input.value)) add(input.value); else render(field); });
      input.addEventListener("blur", () => { if (input.value.trim()) add(input.value); });
      on(field, "click", "[data-add-tag]", (e, b) => add(b.dataset.addTag));
      on(field, "click", "[data-rm-tag]", (e, b) => { tags.splice(tags.indexOf(b.dataset.rmTag), 1); render(field); onChange(tags); });
      render(field);
    },
  };
}

/** Add a source by hand: a link, a DOI or an arXiv link; details filled in where possible. */
export async function addSheet(ctx, { status = "inbox", text = "" } = {}) {
  const tagger = tagInput(ctx);
  let found = null;
  const result = await sheet({
    title: "Add to Research",
    body: html`<div class="add-image-row"><button type="button" class="btn small" data-images>${raw(icon("camera"))}Add a picture</button><span class="small faint">a sketch, a screenshot, a page — or paste one</span><input type="file" accept="image/*" multiple hidden data-image-in></div>
      <label class="field"><span>A link, DOI or arXiv link — or just a thought</span><textarea class="textarea" data-link rows="2" autofocus placeholder="https://…, 10.1234/…, or whatever's on your mind" autocomplete="off">${text}</textarea></label>
      <p class="small faint" data-found style="margin:-4px 0 8px"></p>
      <label class="field"><span>Title</span><input class="input" data-title autocomplete="off" placeholder="Filled in when we can — edit freely"></label>
      <label class="field"><span>Why are you saving it? <span class="faint">(optional)</span></span><input class="input" data-why autocomplete="off" placeholder="One line for future you"></label>
      <div class="field"><span class="label">Tags</span>${tagger.markup}</div>
      <div class="chips" data-status-pick>${["inbox", "to-read", "read"].map((st) => html`<button type="button" class="chip ${st === status ? "on" : ""}" data-st="${st}">${STATUSES[st]}</button>`)}</div>`,
    foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    setup: (d, close) => {
      tagger.wire(d);
      const link = d.querySelector("[data-link]");
      const title = d.querySelector("[data-title]");
      const note = d.querySelector("[data-found]");
      let pick = status;
      let typedTitle = false;
      title.addEventListener("input", () => { typedTitle = !!title.value.trim(); });
      on(d, "click", "[data-st]", (e, b) => { pick = b.dataset.st; for (const c of d.querySelectorAll("[data-st]")) c.classList.toggle("on", c === b); });
      const look = debounce(async () => {
        const shared = parseShared({ text: link.value });
        found = null;
        note.textContent = "";
        if (!shared.url && !shared.doi) return;
        const dup = findDuplicate(ctx.sources(), { url: shared.url, doi: shared.doi });
        if (dup) { note.textContent = `Already in your library: ${dup.title}`; return; }
        if (!typedTitle && shared.url && !shared.doi) title.placeholder = guessTitle(shared.url);
        if (shared.doi) {
          note.textContent = "Looking up the paper…";
          const meta = await lookupDoi(shared.doi);
          if (parseShared({ text: link.value }).doi !== shared.doi) return;
          if (meta) {
            found = meta;
            if (!typedTitle) title.value = meta.title;
            note.textContent = `Found: ${[formatAuthors(meta.authors), meta.year, meta.site].filter(Boolean).join(" · ")}`;
          } else note.textContent = "Couldn't look this one up — add the title yourself.";
        }
      }, 400);
      link.addEventListener("input", look);
      // A picture instead of (or as well as) words: the title, why and tags apply to it.
      const fileIn = d.querySelector("[data-image-in]");
      const withImages = (images) => images.length && close({ images, link: "", title: title.value.trim(), why: d.querySelector("[data-why]").value.trim(), status: pick });
      d.querySelector("[data-images]").addEventListener("click", () => fileIn.click());
      fileIn.addEventListener("change", () => withImages([...fileIn.files]));
      d.addEventListener("paste", (e) => { const imgs = imagesFrom(e.clipboardData); if (imgs.length) { e.preventDefault(); withImages(imgs); } });
      if (text) look();
      d.querySelector("[data-ok]").addEventListener("click", () => close({ link: link.value, title: title.value.trim(), why: d.querySelector("[data-why]").value.trim(), status: pick }));
    },
  });
  if (result?.images) {
    const saved = await saveImages(ctx, result.images, { status: result.status, title: result.title || undefined, why: result.why, tags: tagger.tags });
    if (saved.length) toast(`${saved.length === 1 ? "Picture" : `${saved.length} pictures`} saved to ${STATUSES[saved[0].status]}`, { action: "Open", onAction: () => ctx.navigate(saved.length === 1 ? `#/source/${saved[0].id}` : "#/inbox") });
    return saved[0] || null;
  }
  if (!result || (!result.link.trim() && !result.title)) return null;
  const extra = { why: result.why, tags: tagger.tags, status: result.status };
  if (result.title) extra.title = result.title;
  if (found) Object.assign(extra, { authors: found.authors, year: found.year, kind: found.kind, site: found.site });
  const { source, existing } = await capture(ctx, { text: result.link, title: result.title, via: "app" }, extra);
  if (!source) { toast("That doesn't look like a link or a DOI.", { error: true }); return null; }
  toast(existing ? "Already in your library" : `Saved to ${STATUSES[source.status]}`, { action: "Open", onAction: () => ctx.navigate(`#/source/${source.id}`) });
  return source;
}

/** Delete a source, with an Undo. */
export async function deleteSource(ctx, id) {
  const s = ctx.store.get(id);
  if (!s) return;
  const copy = structuredClone({ ...s, _sync: undefined, _rev: undefined });
  await ctx.store.remove(id, { reason: "deleted" });
  toast("Deleted", { action: "Undo", timeout: 8000, onAction: async () => { await ctx.store.put(copy); toast("Restored"); } });
}
