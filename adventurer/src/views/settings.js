// Settings, in sections: Access/Key (the GitHub token — the Tasks site's by
// default when installed there — and where quests sync), the receptionist,
// your stats profile (only what the norms need: sex and age band), and sync.

import { html, toast, confirmSheet } from "../ui/dom.js";
import { AGE_BANDS } from "../core/norms.js";
import { speak, voices, bestVoice, hasClips } from "../ui/voice.js";
import { PACKS } from "../core/voicepack.js";
import { coachVoice } from "../ui/coach.js";

const coachOpts = (f) => ({ coachVoice: !!f.coachVoice, coachName: (f.coachName || "Sergeant Brass").trim().slice(0, 24) || "Sergeant Brass", coachVoiceName: f.coachVoiceName || "", coachVoicePack: f.coachVoicePack ?? "", coachVolume: Number(f.coachVolume), coachRate: Number(f.coachRate), coachPitch: Number(f.coachPitch), deviceFallback: !!f.deviceFallback });
const voiceOpts = (f) => ({ voicePack: f.voicePack ?? "", deviceFallback: !!f.deviceFallback, voiceName: f.voiceName || "", voiceVolume: Number(f.voiceVolume), voiceRate: Number(f.voiceRate), voicePitch: Number(f.voicePitch) });

// A character's rendered voices to pick from, each with ▶ to hear a line, then "This device's voice".
function packPicker(who, name, chosen) {
  return html`<div class="field"><span>Voice</span><div class="pack-list">
    ${PACKS[who].voices.map((v) => html`<div class="pack-row"><label class="check"><input type="radio" name="${name}" value="${v.id}" ${chosen === v.id ? "checked" : ""}> ${v.label}</label><button type="button" class="btn small ghost" data-preview="${who}:${v.id}" aria-label="Hear ${v.label}">▶</button></div>`)}
    <div class="pack-row"><label class="check"><input type="radio" name="${name}" value="" ${chosen ? "" : "checked"}> This device's voice (set below)</label></div>
  </div></div>`;
}

// The device's English voices, filled in once the browser has listed them (Chrome lists them late).
function fillVoices(sel, chosen, kind) {
  if (!sel) return;
  const best = bestVoice(kind);
  sel.replaceChildren(new Option(best ? `Best on this device (${best})` : "Best on this device", ""), ...voices().map((v) => new Option(`${v.name} · ${v.lang}`, v.name, false, v.name === chosen)));
}

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
        ${packPicker("joy", "voicePack", s.voicePack)}
        <div class="grid2">
          <label class="field"><span>Device voice</span><select class="input" name="voiceName" data-voices><option value="">Best on this device</option></select></label>
          <label class="field"><span>Volume</span><input class="input" type="range" name="voiceVolume" min="0" max="1" step="0.05" value="${s.voiceVolume ?? 1}"></label>
          <label class="field"><span>Speed</span><input class="input" type="range" name="voiceRate" min="0.6" max="1.6" step="0.05" value="${s.voiceRate ?? 1}"></label>
          <label class="field"><span>Pitch</span><input class="input" type="range" name="voicePitch" min="0.5" max="2" step="0.05" value="${s.voicePitch ?? 1.1}"></label>
        </div>
        <label class="check"><input type="checkbox" name="deviceFallback" ${s.deviceFallback ? "checked" : ""}> Device voice for lines without a Piper clip (Joy and the coach)</label>
        <button type="button" class="btn small" data-a="voice-test">▶ Hear her</button>
        <p class="hint">The named voices are recorded with Piper, a free offline voice engine, and play from this site; speed and pitch apply to them too. With the box above off, a sentence they don't cover is skipped rather than said in another voice. Device voices: on Windows the "Online (Natural)" voices (Aria, Jenny) sound the most human; on iPhone, download an "Enhanced" voice in Settings › Accessibility › Spoken Content.</p>
      </fieldset>
      <fieldset><legend>Training coach</legend>
        <label class="check"><input type="checkbox" name="coachVoice" ${s.coachVoice ? "checked" : ""}> Coach's voice: he counts your reps, calls the tempo, cues your form and calls your rest out loud (tap his portrait to hush)</label>
        <div class="grid2">
          <label class="field"><span>Name</span><input class="input" name="coachName" value="${s.coachName}" maxlength="24"></label>
        </div>
        ${packPicker("brass", "coachVoicePack", s.coachVoicePack)}
        <div class="grid2">
          <label class="field"><span>Device voice</span><select class="input" name="coachVoiceName" data-coach-voices><option value="">Best on this device</option></select></label>
          <label class="field"><span>Volume</span><input class="input" type="range" name="coachVolume" min="0" max="1" step="0.05" value="${s.coachVolume ?? 1}"></label>
          <label class="field"><span>Speed</span><input class="input" type="range" name="coachRate" min="0.6" max="1.6" step="0.05" value="${s.coachRate ?? 1}"></label>
          <label class="field"><span>Pitch</span><input class="input" type="range" name="coachPitch" min="0.6" max="1.5" step="0.05" value="${s.coachPitch ?? 1}"></label>
        </div>
        <button type="button" class="btn small" data-a="coach-test">▶ Hear him</button>
        <p class="hint">Rep counts and the like play as a chain of short clips. Anything the clips don't cover uses the device voice only if "Device voice for lines without a Piper clip" is on. For that he picks a male voice, British if your device has one (on Windows, "Ryan" or "Thomas Online (Natural)"). Phones that only name voices by language get the UK one, pitched down.</p>
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
    fillVoices(el.querySelector("[data-voices]"), s.voiceName);
    fillVoices(el.querySelector("[data-coach-voices]"), s.coachVoiceName, "male");
  };
  draw();
  if ("speechSynthesis" in window) { const refill = () => { fillVoices(el.querySelector("[data-voices]"), ctx.settings().voiceName); fillVoices(el.querySelector("[data-coach-voices]"), ctx.settings().coachVoiceName, "male"); }; speechSynthesis.addEventListener("voiceschanged", refill); ui.cleanup(() => speechSynthesis.removeEventListener("voiceschanged", refill)); }
  ui.onStore((c) => { if (["sync", "sync-end", "sync-error"].includes(c.op)) draw(); });

  el.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "sync") { await ctx.syncNow(); toast(ctx.store.status.error ? ctx.store.status.error : "Synced.", { error: !!ctx.store.status.error }); }
    const form = () => Object.fromEntries(new FormData(el.querySelector("form")));
    const line = (who) => PACKS[who].preview[Math.floor(Math.random() * PACKS[who].preview.length)];
    if (a === "voice-test") speak(line("joy"), voiceOpts(form()));
    if (a === "coach-test") speak(line("brass"), coachVoice(coachOpts(form())));
    const pv = e.target.closest("[data-preview]")?.dataset.preview;
    if (pv) {
      const [who] = pv.split(":"), text = line(who);
      if (!hasClips(pv, text)) toast("That voice isn't on this device yet; the device voice will say it.");
      speak(text, who === "brass" ? { ...coachVoice(coachOpts(form())), pack: pv } : { ...voiceOpts(form()), pack: pv });
    }
    if (a === "forget" && await confirmSheet("Forget the token saved on this device?", { confirm: "Forget" })) { ctx.store.setSecrets({ githubToken: "" }); draw(); }
  });
  el.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const [owner, repo] = String(f.repo || "").split("/").map((x) => x.trim());
    if (!owner || !repo) return toast("Repo should look like owner/name.", { error: true });
    ctx.store.setSettings({ owner, repo, folder: (f.folder || "quests").trim().replace(/^\/+|\/+$/g, "") || "quests",
      relay: !!f.relay, relayName: (f.relayName || "Joy").trim().slice(0, 24) || "Joy", chattiness: f.chattiness, voice: !!f.voice, ...voiceOpts(f), ...coachOpts(f), autoSync: !!f.autoSync });
    if (f.token?.trim()) ctx.store.setSecrets({ githubToken: f.token.trim() });
    const prof = ctx.store.profile();
    if (prof.sex !== f.sex || (prof.ageBand || "") !== f.ageBand) ctx.store.setStats({ profile: { sex: f.sex, ageBand: f.ageBand || undefined } });
    toast("Saved.");
    draw();
    ctx.syncNow();
  });
}
