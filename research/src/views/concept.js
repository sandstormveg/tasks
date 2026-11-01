// An idea from your knowledge system (@concept-id) and the experiences you've
// linked to it.

import { html, raw } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { entryCard } from "../ui/components.js";
import { extractConcepts } from "../core/markdown.js";
import { atlasItem } from "../integrations/atlas.js";

export async function mount(el, ctx, route, ui) {
  const id = route.params[0];
  const item = atlasItem(ctx, id);
  ui.setTitle(item?.title || `@${id}`, { back: "history" });
  const site = ctx.settings().integrations.atlas.siteUrl;
  const entries = ctx.store.all("entry").filter((e) => extractConcepts(e.body).includes(id)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  el.innerHTML = String(html`
    <h2 class="view-title"><span class="concept" style="font-size:1rem;vertical-align:middle">@${id}</span> ${item?.title && item.title !== id ? item.title : ""}</h2>
    <p class="view-sub">${item ? html`${item.type} in your Atlas` : html`Not in the cached Atlas list — <a href="#/settings/integrations">fetch it</a> to see names.`}
      ${site ? html` · <a href="${site.replace(/\/$/, "")}/classic.html#${id}" target="_blank" rel="noopener">Open in Atlas ${raw(icon("external"))}</a>` : ""}</p>
    <div class="section-title">Experiences linked to this idea</div>
    ${entries.length ? entries.map((e) => entryCard(e, { showDay: true, today: ctx.today() })) : html`<p class="muted">None yet. Write <code>@${id}</code> in an entry to link it.</p>`}`);
  ctx.media.hydrate(el);
}
