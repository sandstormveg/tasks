// Search everything you've saved — titles, authors, tags, why, what you
// expected and what surprised you, notes and quotes — and browse by tag.

import { html, debounce, on } from "../../ui/dom.js";
import { searchSources, tagCounts, STATUSES } from "../../core/sources.js";
import { sourceCard } from "../ui.js";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Search");
  const initial = route.params[0] ? `#${route.params[0]}` : route.query.q || "";
  el.innerHTML = String(html`<div class="searchbox"><input class="input" type="search" data-q value="${initial}" placeholder="Words or #tags — notes and quotes too" autocomplete="off" autocapitalize="off" enterkeyhint="search" aria-label="Search your research"></div>
    <div data-results></div>`);
  const input = el.querySelector("[data-q]");
  const box = el.querySelector("[data-results]");

  function render() {
    const q = input.value.trim();
    const all = ctx.sources();
    if (!q) {
      const tags = tagCounts(all);
      box.innerHTML = String(html`<div class="section-title">Tags</div>
        ${tags.length ? html`<div class="tag-cloud">${tags.map(([t, n]) => html`<button class="tag" data-tag="${t}">#${t} <span class="faint">${n}</span></button>`)}</div>`
          : html`<p class="muted small">Tags you add to sources show up here.</p>`}
        <p class="small faint" style="margin-top:18px">${all.length} saved · ${Object.entries(STATUSES).map(([k, l]) => `${l} ${all.filter((s) => s.status === k).length}`).join(" · ")}</p>`);
      return;
    }
    const found = searchSources(all, q).sort((a, b) => String(b.added || "").localeCompare(String(a.added || "")));
    box.innerHTML = String(found.length
      ? html`<p class="small muted">${found.length} found</p>${found.map((s) => sourceCard(s, { actions: false }))}`
      : html`<div class="empty"><h3>Nothing matches</h3><p>Try fewer words, or a #tag.</p></div>`);
    ctx.media.hydrate(box);
  }
  const later = debounce(render, 150);
  input.addEventListener("input", later);
  on(box, "click", "[data-tag]", (e, b) => { input.value = `#${b.dataset.tag}`; render(); });
  render();
  ui.onStore(() => render());
  if (!initial && matchMedia("(min-width: 960px)").matches) input.focus();
}
