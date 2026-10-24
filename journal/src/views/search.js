// Search and themes: find earlier experiences across years — forgiving of
// Vietnamese diacritics, with filters, highlighted snippets, and your #tags
// as a map of recurring themes.

import { html, raw, on, debounce } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { search, snippet, parseQuery, isEmptyQuery, fold } from "../core/search.js";
import { entryCard } from "../ui/components.js";
import { formatDay, compareDays } from "../core/dates.js";
import { ENTRY_KINDS, normRating } from "../core/model.js";

function firstHit(text, pq) {
  const f = fold(text || "");
  const idx = [...pq.terms, ...pq.phrases].map((t) => f.indexOf(t)).filter((i) => i >= 0);
  return idx.length ? Math.min(...idx) : Infinity;
}

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Search");
  const state = {
    q: route.query.q || (route.query.tag ? `#${route.query.tag}` : route.params[0] ? `#${route.params[0]}` : ""),
    kind: route.query.kind || "",
    photos: false,
    from: route.query.from || "",
    to: route.query.to || "",
    minRating: "",
  };

  el.innerHTML = String(html`
    <div class="searchbox" style="position:sticky">
      <div style="position:relative">${raw(icon("search", "search-ic"))}<input class="input" type="search" data-q placeholder="Search years of entries…" value="${state.q}" autocomplete="off" aria-label="Search"></div>
      <div class="chips scroll" style="margin-top:10px" data-filters></div>
    </div>
    <div data-results></div>`);
  const input = el.querySelector("[data-q]");

  function renderFilters() {
    el.querySelector("[data-filters]").innerHTML = String(html`
      <button class="chip ${!state.kind ? "on" : ""}" data-f="kind" data-v="">Everything</button>
      ${Object.entries(ENTRY_KINDS).map(([k, v]) => html`<button class="chip ${state.kind === k ? "on" : ""}" data-f="kind" data-v="${k}">${v}</button>`)}
      <button class="chip ${state.photos ? "on" : ""}" data-f="photos">${raw(icon("photos"))}With photos</button>
      <button class="chip ${state.from || state.to ? "on" : ""}" data-f="dates">${raw(icon("calendar"))}${state.from || state.to ? `${state.from || "…"} → ${state.to || "…"}` : "Dates"}</button>
      <button class="chip ${state.minRating ? "on" : ""}" data-f="rating">${state.minRating ? `Rated ≥ ${Math.round(state.minRating * 100)}%` : "Day rating"}</button>`);
  }

  function filtered(results) {
    return results.filter(({ doc }) => {
      const e = doc.entry;
      if (state.kind && e.kind !== state.kind) return false;
      if (state.photos && !(e.media || []).some((m) => m.type === "photo")) return false;
      if (state.from && compareDays(e.day, state.from) < 0) return false;
      if (state.to && compareDays(e.day, state.to) > 0) return false;
      if (state.minRating) {
        const r = normRating(ctx.store.get(e.day));
        if (r == null || r < state.minRating) return false;
      }
      return true;
    });
  }

  function renderResults() {
    const box = el.querySelector("[data-results]");
    const pq = parseQuery(state.q);
    const hasFilter = state.kind || state.photos || state.from || state.to || state.minRating;
    if (isEmptyQuery(pq) && !hasFilter) { box.innerHTML = String(themesHtml()); return; }
    const index = ctx.derived.index();
    let results = isEmptyQuery(pq) ? index.map((d) => ({ id: d.id, score: 0, doc: d.raw, matched: [] })).sort((a, b) => String(b.doc.sortKey).localeCompare(String(a.doc.sortKey))) : search(index, pq);
    results = filtered(results);
    const locked = ctx.store.sealedLockedCount();
    box.innerHTML = String(html`
      <div class="small muted" style="margin:4px 0 10px">${results.length} result${results.length === 1 ? "" : "s"}${locked ? ` · ${locked} sealed entr${locked === 1 ? "y isn't" : "ies aren't"} searched while locked` : ""}</div>
      ${results.slice(0, 80).map((r) => {
        const e = r.doc.entry;
        const fieldText = r.matched.includes("best") || r.matched.includes("hardest") ? `${ctx.store.get(e.day)?.best || ""} ${ctx.store.get(e.day)?.hardest || ""}` : null;
        // A snippet only when the hit isn't already visible in the card's excerpt.
        const bodyHitVisible = !fieldText && r.matched.every((f) => f === "body" || f === "title") && firstHit(e.body, pq) < 220;
        const segs = isEmptyQuery(pq) || bodyHitVisible ? null : snippet(fieldText || [e.title, e.body, (e.media || []).map((m) => m.caption).join(" "), e.document?.text].filter(Boolean).join(" — "), pq);
        return html`<div class="result">${entryCard(e, { showDay: true, today: ctx.today() })}
          ${segs ? html`<div class="small" style="margin:6px 6px 0;color:var(--ink-2)">${segs.map((s) => (s.hit ? html`<mark>${s.text}</mark>` : s.text))}${r.matched.includes("best") ? html` <span class="badge">best moment</span>` : ""}${r.matched.includes("hardest") ? html` <span class="badge">hardest moment</span>` : ""}</div>` : ""}</div>`;
      })}
      ${results.length > 80 ? html`<p class="small faint center">Showing the first 80 — add words or filters to narrow it down.</p>` : ""}
      ${!results.length ? html`<div class="empty"><h3>Nothing found</h3><p>Try fewer words, or a different spelling. Search ignores Vietnamese accents, so "pho" finds "phở".</p></div>` : ""}`);
    ctx.media.hydrate(box);
  }

  function themesHtml() {
    const tags = ctx.derived.tags();
    const cats = new Map();
    for (const e of ctx.store.all("entry")) if (e.category) cats.set(e.category, (cats.get(e.category) || 0) + 1);
    const max = Math.max(1, ...tags.map((t) => t.count));
    return html`
      <div class="section-title">Themes — your #tags</div>
      ${tags.length ? html`<div class="stack-sm">${tags.slice(0, 40).map((t) => html`<a class="bar-row" href="#/search?tag=${encodeURIComponent(t.tag)}" style="color:inherit;text-decoration:none">
          <span><b>#${t.tag}</b> <span class="faint">${formatDay(t.first, { month: "short", year: "numeric" })}${t.last !== t.first ? ` – ${formatDay(t.last, { month: "short", year: "numeric" })}` : ""}</span></span><span class="faint">${t.count}</span>
          <span class="bar"><span style="width:${(t.count / max) * 100}%"></span></span></a>`)}</div>`
        : html`<p class="muted">Add #tags anywhere in what you write and they'll gather here. No tagging is required — search works on everything.</p>`}
      ${cats.size ? html`<div class="section-title">Categories (from imports)</div><div class="chips">${[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => html`<button class="chip" data-cat="${c}">${c} <span class="faint">${n}</span></button>`)}</div>` : ""}
      <div class="section-title">Search tips</div>
      <p class="small muted">Words must all appear · <code>"exact phrase"</code> · <code>-exclude</code> · <code>#tag</code>. Accents are optional.</p>`;
  }

  const run = debounce(() => {
    const url = state.q ? `#/search?q=${encodeURIComponent(state.q)}` : "#/search";
    history.replaceState(null, "", url);
    renderResults();
  }, 160);
  input.addEventListener("input", () => { state.q = input.value; run(); });
  renderFilters();
  renderResults();
  if (!state.q) setTimeout(() => input.focus(), 60);
  ui.onStore(() => renderResults());

  on(el, "click", "[data-cat]", (e, b) => {
    const cat = b.dataset.cat;
    const results = ctx.store.all("entry").filter((x) => x.category === cat);
    state.q = "";
    input.value = "";
    el.querySelector("[data-results]").innerHTML = String(html`<div class="small muted" style="margin:4px 0 10px">${results.length} in “${cat}”</div>${results.sort((a, b2) => b2.created.localeCompare(a.created)).slice(0, 100).map((x) => entryCard(x, { showDay: true, today: ctx.today() }))}`);
    ctx.media.hydrate(el);
  });

  on(el, "click", "[data-f]", async (e, b) => {
    const f = b.dataset.f;
    if (f === "kind") state.kind = b.dataset.v;
    if (f === "photos") state.photos = !state.photos;
    if (f === "dates") {
      const { sheet } = await import("../ui/dom.js");
      const v = await sheet({
        title: "Date range",
        body: html`<div class="row"><label class="field grow"><span>From</span><input class="input" type="date" data-from value="${state.from}"></label><label class="field grow"><span>To</span><input class="input" type="date" data-to value="${state.to}"></label></div>`,
        foot: html`<button class="btn ghost" data-clear>Any time</button><button class="btn primary" data-ok>Apply</button>`,
        setup: (d, close) => {
          d.querySelector("[data-ok]").addEventListener("click", () => close({ from: d.querySelector("[data-from]").value, to: d.querySelector("[data-to]").value }));
          d.querySelector("[data-clear]").addEventListener("click", () => close({ from: "", to: "" }));
        },
      });
      if (v) { state.from = v.from; state.to = v.to; }
    }
    if (f === "rating") {
      const levels = [0, 0.5, 0.7, 0.85];
      state.minRating = levels[(levels.indexOf(Number(state.minRating) || 0) + 1) % levels.length] || "";
    }
    renderFilters();
    renderResults();
  });
}
