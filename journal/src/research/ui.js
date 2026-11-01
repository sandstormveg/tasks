// Research's shared pieces: the card a source shows as in lists, quick status
// changes, saving what you share (or paste) without duplicates, the Add sheet,
// and delete with Undo.

import { html, raw, sheet, toast, on, debounce } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import {
  STATUSES, KINDS, makeSource, statusPatch, formatAuthors, findDuplicate, parseShared, cleanTags, tagCounts, guessTitle,
} from "../core/sources.js";
import { lookupDoi } from "./lookup.js";

// What a card offers, by status: the next step in reading, without opening it.
const NEXT = {
  inbox: [["to-read", "To read"], ["read", "Read"], ["dropped", "Drop"]],
  "to-read": [["reading", "Start"], ["read", "Read"]],
  reading: [["read", "Done"]],
  read: [],
  dropped: [["to-read", "To read"]],
};

export function sourceCard(s, { actions = true } = {}) {
  const by = [formatAuthors(s.authors), s.year].filter(Boolean).join(", ");
  return html`<div class="src-card" data-id="${s.id}">
    <a class="src-main" href="#/source/${s.id}">
      <div class="src-title">${s.favourite ? html`<span class="fav" aria-label="Favourite">${raw(icon("star"))}</span>` : ""}${s.title || s.url}</div>
      <div class="src-meta">${[s.site, by, s.kind && s.kind !== "article" ? KINDS[s.kind] : ""].filter(Boolean).join(" · ")}</div>
      ${s.tags?.length ? html`<div class="src-tags">${s.tags.map((t) => html`<span class="tag">#${t}</span>`)}</div>` : ""}
      ${s.why ? html`<div class="src-why">${s.why}</div>` : ""}
    </a>
    ${actions && NEXT[s.status]?.length ? html`<div class="src-actions">${NEXT[s.status].map(([st, label]) => html`<button class="btn small ${st === "dropped" ? "ghost" : ""}" data-act="move" data-id="${s.id}" data-to="${st}">${label}</button>`)}</div>` : ""}
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
  if (!shared.url && !shared.title && !shared.doi) return { source: null };
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
    body: html`<label class="field"><span>Link, DOI or arXiv link</span><input class="input" data-link autofocus value="${text}" placeholder="https://… or 10.1234/…" autocomplete="off" autocapitalize="off" inputmode="url"></label>
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
      if (text) look();
      d.querySelector("[data-ok]").addEventListener("click", () => close({ link: link.value, title: title.value.trim(), why: d.querySelector("[data-why]").value.trim(), status: pick }));
    },
  });
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
