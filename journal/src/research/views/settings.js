// Research settings: where it syncs (research/ in your private tasks data, with
// the token you saved in Tasks), the look, saving from your computer with a
// bookmark button, and how Claude can use your library.

import { html, raw, on, toast } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { cleanFolder } from "../../data/folder-remote.js";

export async function mount(el, ctx, route, ui) {
  ui.setTitle("Settings");
  // The bookmarklet opens this app with the page you're on; it's dragged, never run here.
  const appUrl = `${location.origin}${location.pathname}`;
  const bookmarklet = `javascript:(()=>{window.open(${JSON.stringify(appUrl)}+'?via=bookmarklet&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;

  function render() {
    const s = ctx.settings();
    const sec = ctx.secrets();
    const st = ctx.sync.status;
    const conf = ctx.sync.configured();
    const where = `${s.github.owner}/${s.github.repo}${s.github.folder ? `/${s.github.folder.replace(/^\/+|\/+$/g, "")}` : ""}`;
    const themes = [["auto", "Automatic"], ["paper", "Paper"], ["ink", "Ink"], ["lantern", "Lantern"], ["terminal", "Terminal"]];
    el.innerHTML = String(html`
      <div class="section-title">Sync</div>
      <div class="card flat">
        ${conf ? html`<div class="notice ${st.state === "error" ? "danger" : "ok"}">${raw(icon(st.state === "error" ? "warn" : "cloud"))}<div class="grow small">
            ${st.state === "error" ? html`<b>Sync problem:</b> ${st.error}` : st.state === "syncing" ? "Syncing…" : html`Saved to <b>${where}</b>${st.lastSync ? html` · last synced ${new Date(st.lastSync).toLocaleString()}` : ""}.`}
            ${sec.githubTokenFrom ? html`<div>Using the token you saved in ${sec.githubTokenFrom}.</div>` : ""}</div>
            <button class="btn small" data-act="sync">Sync now</button></div>`
          : html`<p class="small" style="margin-top:0">Saved on this device only. Add a GitHub token with <b>Contents: Read and write</b> on <b>${s.github.owner}/${s.github.repo}</b> to sync${ctx.host ? html` — or save one in ${ctx.host.name}, and Research will use it` : ""}.</p>
            <label class="field"><span>Fine-grained access token</span><input class="input" type="password" data-secret="githubToken" placeholder="github_pat_…" autocomplete="off"></label>`}
        <details class="layer" style="margin-top:10px"><summary>${raw(icon("info"))}Where it's saved</summary>
          <div class="row wrap"><label class="field grow"><span>Owner</span><input class="input" data-set="github.owner" value="${s.github.owner}" autocomplete="off" autocapitalize="off"></label>
            <label class="field grow"><span>Repository</span><input class="input" data-set="github.repo" value="${s.github.repo}" autocomplete="off" autocapitalize="off"></label></div>
          <label class="field"><span>Folder in the repository</span><input class="input" data-set="github.folder" value="${s.github.folder || ""}" placeholder="none — the whole repository" autocomplete="off" autocapitalize="off"></label>
          <p class="small faint">Research reads and writes only inside that folder, and refuses to sync to a public repository.</p>
        </details>
      </div>

      <div class="section-title">Save from your computer</div>
      <div class="card flat">
        <p class="small" style="margin-top:0">Drag this button to your browser's bookmarks bar. On any page, click it to save that page to your Deposit.</p>
        <p><a class="btn bookmarklet" href="${bookmarklet}" data-bookmarklet draggable="true">${raw(icon("section"))}Save to Research</a></p>
        <p class="small faint">On your phone, use Share → <b>Tasks</b> instead${ctx.host ? "" : " (once Research lives inside Tasks)"}. Or paste a link with <b>Add</b>.</p>
      </div>

      <div class="section-title">Claude</div>
      <div class="card flat small">
        <p style="margin-top:0">Your library is plain files in <b>${where}</b>, so a Claude session with that repository can read it. Ask things like <i>“what have I read about s-risk?”</i>, <i>“find my quotes on moral circle expansion”</i> or <i>“add this article to my research”</i>.</p>
        <p class="faint">The folder's <code>CLAUDE.md</code> tells Claude how: cite your sources, keep your notes apart from its own reading, and never write your words for you — why, expectations, surprises, notes, quotes, drafts and syntheses are yours alone.</p>
        <p class="faint">On your corkboards Claude may pin notes and tie red string (marked as Claude's) — but only you synthesise a connection.</p>
        ${conf ? html`<button class="btn small" data-act="push-template">${raw(icon("upload"))}Update Claude's files in the repository</button>
        <p class="faint" style="margin-bottom:0">Writes this version's <code>CLAUDE.md</code>, skill and query tool into ${where}. Your sources, boards and writing aren't touched.</p>` : ""}
      </div>

      <div class="section-title">Infodex</div>
      <div class="card flat">
        <label class="field"><span>Your Infodex's address <span class="faint">(for “Infodex” links on card pages)</span></span><input class="input" data-set-plain="infodexUrl" value="${s.infodexUrl || ""}" placeholder="https://…" inputmode="url" autocomplete="off" autocapitalize="off"></label>
        <p class="small faint" style="margin-bottom:0">Cards are made the Infodex's way from Wikidata. To bring your own Dex cards (with their finish, Insight and questions), export them in the Infodex and choose the file under Card on any board.</p>
      </div>

      <div class="section-title">Appearance</div>
      <div class="card flat"><div class="chips">${themes.map(([k, label]) => html`<button class="chip ${s.theme === k ? "on" : ""}" data-theme="${k}">${label}</button>`)}</div></div>`);
  }
  render();
  const off = ctx.sync.on(() => render());
  ui.cleanup(off);

  on(el, "click", "[data-bookmarklet]", (e) => { e.preventDefault(); toast("Drag it to your bookmarks bar, then click it on any page."); });
  on(el, "click", "[data-act=sync]", () => ctx.sync.syncNow());
  on(el, "click", "[data-act=push-template]", async (e, b) => {
    b.disabled = true;
    try { await ctx.sync.pushTemplate(); toast("Claude's files updated"); } catch (err) { toast(`Couldn't update them: ${err.message}`, { error: true }); }
    b.disabled = false;
  });
  on(el, "click", "[data-theme]", async (e, b) => { await ctx.saveSettings({ theme: b.dataset.theme }); render(); });
  on(el, "change", "[data-secret]", async (e, f) => { await ctx.saveSecrets({ githubToken: f.value.trim(), ignoreHostToken: false }); toast("Saved"); render(); ctx.sync.syncNow(); });
  on(el, "change", "[data-set-plain]", async (e, f) => { await ctx.saveSettings({ [f.dataset.setPlain]: f.value.trim() }); toast("Saved"); });
  on(el, "change", "[data-set]", async (e, f) => {
    const [a, b] = f.dataset.set.split(".");
    if (b === "folder") { try { cleanFolder(f.value); } catch (err) { return toast(err.message, { error: true }); } }
    await ctx.saveSettings({ [a]: { [b]: f.value.trim() } });
    toast("Saved");
  });
}
