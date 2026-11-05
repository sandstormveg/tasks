// Settings, in sections: Access/Key (the GitHub token — the Tasks site's by
// default when installed there — and where quests sync), the receptionist,
// your stats profile (only what the norms need: sex and age band), and sync.

import { html, toast, confirmSheet } from "../ui/dom.js";
import { AGE_BANDS } from "../core/norms.js";

export async function mount(el, ctx, route, ui) {
  const draw = () => {
    const s = ctx.settings();
    const tok = ctx.token();
    const prof = ctx.store.profile();
    const st = ctx.store.status;
    el.innerHTML = String(html`<h2 class="view-title">⚙ Settings</h2>
    <form class="form settings" data-f>
      <fieldset><legend>Access / Key</legend>
        <p class="small muted">${tok.from === "own" ? "Using your own token on this device." : tok.from ? `Using ${tok.from}'s token.` : "No token yet — the board stays on this device until you add one."}</p>
        <label class="field"><span>GitHub token (fine-grained, contents read/write on ${s.owner}/${s.repo})</span>
          <input class="input" type="password" name="token" autocomplete="off" placeholder="${tok.from && tok.from !== "own" ? `Leave empty to keep using ${tok.from}'s` : "github_pat_…"}"></label>
        ${tok.from === "own" ? html`<button type="button" class="btn small" data-a="forget">Forget my token</button>` : ""}
        <div class="grid2">
          <label class="field"><span>Private repo</span><input class="input" name="repo" value="${s.owner}/${s.repo}"></label>
          <label class="field"><span>Folder</span><input class="input" name="folder" value="${s.folder}"></label>
        </div>
        <p class="hint">Adventurer only writes inside this folder, and refuses a public repo.</p>
      </fieldset>
      <fieldset><legend>Receptionist</legend>
        <label class="check"><input type="checkbox" name="relay" ${s.relay ? "checked" : ""}> Show the receptionist at the counter</label>
        <label class="check"><input type="checkbox" name="voice" ${s.voice ? "checked" : ""}> Receptionist voice: she cheers you on out loud when you accept or turn in a quest (tap her portrait to hush)</label>
        <div class="grid2">
          <label class="field"><span>Name</span><input class="input" name="relayName" value="${s.relayName}" maxlength="24"></label>
          <label class="field"><span>Chattiness</span><select class="input" name="chattiness">${["quiet", "normal", "chatty"].map((c) => html`<option ${s.chattiness === c ? "selected" : ""}>${c}</option>`)}</select></label>
        </div>
      </fieldset>
      <fieldset><legend>Stats profile</legend>
        <p class="hint">Only used to pick the right population table. Synced to your private repo.</p>
        <div class="grid2">
          <label class="field"><span>Compare with</span><select class="input" name="sex"><option value="male" ${prof.sex !== "female" ? "selected" : ""}>men</option><option value="female" ${prof.sex === "female" ? "selected" : ""}>women</option></select></label>
          <label class="field"><span>Age band</span><select class="input" name="ageBand"><option value="">—</option>${AGE_BANDS.map((b) => html`<option ${prof.ageBand === b ? "selected" : ""}>${b}</option>`)}</select></label>
        </div>
      </fieldset>
      <fieldset><legend>Sync</legend>
        <label class="check"><input type="checkbox" name="autoSync" ${s.autoSync ? "checked" : ""}> Sync automatically</label>
        <p class="small muted">${st.error ? `Last problem: ${st.error}` : st.lastSync ? `Last synced ${new Date(st.lastSync).toLocaleString()}` : "Not synced yet."}</p>
        <button type="button" class="btn" data-a="sync">Sync now</button>
      </fieldset>
      <div class="row"><button class="btn primary" type="submit">Save</button></div>
    </form>`);
  };
  draw();
  ui.onStore((c) => { if (["sync", "sync-end", "sync-error"].includes(c.op)) draw(); });

  el.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "sync") { await ctx.syncNow(); toast(ctx.store.status.error ? ctx.store.status.error : "Synced.", { error: !!ctx.store.status.error }); }
    if (a === "forget" && await confirmSheet("Forget the token saved on this device?", { confirm: "Forget" })) { ctx.store.setSecrets({ githubToken: "" }); draw(); }
  });
  el.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const [owner, repo] = String(f.repo || "").split("/").map((x) => x.trim());
    if (!owner || !repo) return toast("Repo should look like owner/name.", { error: true });
    ctx.store.setSettings({ owner, repo, folder: (f.folder || "quests").trim().replace(/^\/+|\/+$/g, "") || "quests",
      relay: !!f.relay, relayName: (f.relayName || "Relay").trim().slice(0, 24) || "Relay", chattiness: f.chattiness, voice: !!f.voice, autoSync: !!f.autoSync });
    if (f.token?.trim()) ctx.store.setSecrets({ githubToken: f.token.trim() });
    const prof = ctx.store.profile();
    if (prof.sex !== f.sex || (prof.ageBand || "") !== f.ageBand) ctx.store.setStats({ profile: { sex: f.sex, ageBand: f.ageBand || undefined } });
    toast("Saved.");
    draw();
    ctx.syncNow();
  });
}
