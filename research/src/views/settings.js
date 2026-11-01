// Settings. Device-only things (tokens, keys, theme) stay on this device;
// journal preferences (prompt rules, rating scale, chapters) sync with it.

import { html, raw, on, toast, errorToast, confirmSheet, sheet, download, bytes, promptSheet } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { cleanFolder } from "../data/folder-remote.js";
import { MODELS } from "../ai/assistant.js";
import { PROMPT_KINDS, learnedSuppressions } from "../core/prompts.js";
import { QUESTION_KINDS, PRIVACY_LEVELS } from "../core/model.js";
import { createSealing, unlockSealing } from "../core/crypto.js";
import { webSpeechSupported } from "../voice/transcribe.js";
import { addDays, formatDay } from "../core/dates.js";

const SECTIONS = [
  ["sync", "cloud", "Sync & backup", "Your private GitHub repository"],
  ["ai", "sparkle", "AI", "Claude, with your own key — optional"],
  ["voice", "mic", "Voice", "Dictation and transcription engines"],
  ["privacy", "lock", "Privacy & sealing", "Passphrase-encrypted entries, what's never tracked"],
  ["prompts", "question", "Prompts", "How often the journal asks, and about what"],
  ["appearance", "moon", "Appearance", "Theme and text size"],
  ["days", "calendar", "Days & ratings", "Rating scale, when a day ends"],
  ["integrations", "link", "Tasks & Atlas", "Send tasks; link ideas from your knowledge system"],
  ["data", "download", "Your data", "Export, import, storage, sample data"],
];

export async function mount(el, ctx, route, ui) {
  const section = route.params[0] || "";
  const S = SECTIONS.find((s) => s[0] === section);
  ui.setTitle(S ? S[2] : "Settings", { back: S ? "#/settings" : undefined });
  const renderers = { sync, ai, voice, privacy, prompts, appearance, days, integrations, data };
  if (!S) {
    el.innerHTML = String(html`<h2 class="view-title">Settings</h2>
      <div class="stack-sm">${SECTIONS.map(([k, ic, t, d]) => html`<a class="entry-card row" href="#/settings/${k}">${raw(icon(ic))}<div class="grow"><div class="title">${t}</div><div class="small muted">${d}</div></div>${raw(icon("chevron"))}</a>`)}</div>
      <p class="small faint" style="margin-top:24px">Living Journal · local-first · your words stay yours. <a href="https://github.com/sandstormveg/Journal_system/blob/main/docs/PRODUCT.md" target="_blank" rel="noopener">How it works</a></p>`);
    return;
  }
  const render = () => { el.innerHTML = String(renderers[section](ctx)); };
  render();
  ui.onStore((c) => { if (c.op === "kv" && (c.key === "settings" || c.key === "secrets")) return; if (c.types?.includes("config") || c.op === "unlock" || c.op === "lock") render(); });
  const off = ctx.sync.on(() => { if (section === "sync") render(); });
  ui.cleanup(off);
  on(el, "click", "[data-act]", (e, b) => act(ctx, b.dataset.act, b, el, render).catch(errorToast));
  on(el, "change", "[data-set],[data-pref],[data-secret]", (e, t) => change(ctx, t, render).catch(errorToast));
}

// ---------- change handlers ----------

function valueOf(t) {
  if (t.type === "checkbox") return t.checked;
  if (t.type === "number" || t.dataset.num != null) return t.value === "" ? null : Number(t.value);
  return t.value;
}

function setPath(obj, path, v) {
  const out = structuredClone(obj);
  const keys = path.split(".");
  let o = out;
  for (const k of keys.slice(0, -1)) { o[k] = o[k] && typeof o[k] === "object" ? o[k] : {}; o = o[k]; }
  o[keys[keys.length - 1]] = v;
  return out;
}

async function change(ctx, t, render) {
  const v = valueOf(t);
  if (t.dataset.set === "github.folder") {
    try { cleanFolder(v); } catch (err) { return toast(err.message, { error: true }); }
  }
  if (t.dataset.set) {
    const keys = t.dataset.set.split(".");
    const patch = {};
    let o = patch;
    for (const k of keys.slice(0, -1)) { o[k] = {}; o = o[k]; }
    o[keys[keys.length - 1]] = v;
    await ctx.saveSettings(patch);
  }
  if (t.dataset.pref) await ctx.savePrefs(setPath(ctx.prefs(), t.dataset.pref, v));
  if (t.dataset.secret) await ctx.saveSecrets({ [t.dataset.secret]: v.trim() });
  if (t.dataset.rerender != null) render();
  toast("Saved", { timeout: 1200 });
}

const sw = (attr, checked, title, desc) => html`<label class="switch"><input type="checkbox" ${raw(attr)} ${checked ? "checked" : ""}><span><span class="t">${title}</span>${desc ? html`<br><span class="d">${desc}</span>` : ""}</span></label>`;

// ---------- sections ----------

function sync(ctx) {
  const s = ctx.settings();
  const sec = ctx.secrets();
  const st = ctx.sync.status;
  const conf = ctx.sync.configured();
  return html`
    <p class="view-sub">Your journal lives on this device first. Sync keeps a private, versioned copy in a GitHub repository you own — readable Markdown files, with full history — and shares it between your phone and computer.</p>
    ${conf ? html`<div class="notice ${st.state === "error" ? "danger" : "ok"}">${raw(icon(st.state === "error" ? "warn" : "cloud"))}<div class="grow">
        ${st.state === "error" ? html`<b>Sync problem:</b> ${st.error}` : st.state === "syncing" ? "Syncing…" : html`Synced ${st.lastSync ? new Date(st.lastSync).toLocaleString() : "—"} with <b>${s.github.owner}/${s.github.repo}${s.github.folder ? `/${s.github.folder.replace(/^\/+|\/+$/g, "")}` : ""}</b>.`}
        ${st.state === "error" && sec.githubTokenFrom && ["not-found", "forbidden", "auth"].includes(st.errorCode) ? html`<div class="small" style="margin-top:4px">This is the token saved in ${sec.githubTokenFrom}. On GitHub (Settings → Developer settings → Fine-grained tokens), give it <b>${s.github.owner}/${s.github.repo}</b> with <b>Contents: Read and write</b> — or paste a journal-only token below. Your entries are safe on this device meanwhile.</div>` : ""}
        <div class="small">${ctx.sync.pendingCount()} change${ctx.sync.pendingCount() === 1 ? "" : "s"} waiting on this device.</div></div>
        <button class="btn small" data-act="sync-now">Sync now</button></div>` : ""}
    ${(st.conflicts || []).length ? html`<div class="notice warn" style="margin-top:8px">${raw(icon("warn"))}<div>${st.conflicts.map((c) => html`<div class="small">${c.message} <a href="#/entry/${c.id}">Open</a></div>`)}</div></div>` : ""}
    ${(st.problems || []).length ? html`<div class="notice warn" style="margin-top:8px">${raw(icon("warn"))}<div>${st.problems.slice(0, 5).map((p) => html`<div class="small"><code>${p.path || p.id}</code>: ${p.message}</div>`)}</div></div>` : ""}
    <div class="section-title">Repository</div>
    <div class="card flat">
      <div class="row wrap"><label class="field grow"><span>Owner</span><input class="input" data-set="github.owner" value="${s.github.owner}" placeholder="sandstormveg" autocomplete="off" autocapitalize="off"></label>
      <label class="field grow"><span>Repository</span><input class="input" data-set="github.repo" value="${s.github.repo}" placeholder="journal-data" autocomplete="off" autocapitalize="off"></label>
      <label class="field" style="width:120px"><span>Branch</span><input class="input" data-set="github.branch" value="${s.github.branch}" placeholder="default" autocomplete="off" autocapitalize="off"></label></div>
      <label class="field"><span>Folder in the repository</span><input class="input" data-set="github.folder" value="${s.github.folder || ""}" placeholder="none — the whole repository" autocomplete="off" autocapitalize="off"></label>
      ${s.github.folder ? html`<p class="hint">The journal reads and writes only inside <code>${s.github.folder}/</code>; the rest of the repository is never touched.</p>` : ""}
      ${sec.githubTokenFrom
        ? html`<div class="notice ok" style="margin-top:8px">${raw(icon("lock"))}<div class="grow small">Using the token you saved in <b>${sec.githubTokenFrom}</b>. Paste a different one below only if you want the journal to use its own.</div></div>
          <label class="field"><span>Journal's own token (optional)</span><input class="input" type="password" data-secret="githubToken" value="" placeholder="leave empty to use ${sec.githubTokenFrom}'s" autocomplete="off"></label>`
        : html`<label class="field"><span>Fine-grained access token</span><input class="input" type="password" data-secret="githubToken" value="${sec.githubToken || ""}" placeholder="github_pat_…" autocomplete="off"></label>`}
      ${ctx.host?.tokenKey && sec.ignoreHostToken ? html`<p class="hint"><button class="btn small" data-act="use-host-token">Use the token saved in ${ctx.host.name}</button></p>` : ""}
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="test-sync">Check &amp; sync</button>${conf ? html`<button class="btn" data-act="push-template" title="README, CLAUDE.md, steward skill and tools/journal.mjs">Update steward files</button><button class="btn ghost danger" data-act="disconnect">Disconnect this device</button>` : ""}</div>
      ${sw('data-set="autoSync"', s.autoSync, "Sync automatically", "On open, after you stop typing, when you come back online, and every few minutes")}
      <label class="field"><span>This device's name (shown in commit messages)</span><input class="input" data-set="deviceName" value="${s.deviceName}" placeholder="${ctx.deviceName()}" autocomplete="off"></label>
    </div>
    ${ctx.host ? html`<details class="layer" style="margin-top:12px" ${conf ? "" : "open"}><summary>${raw(icon("info"))}Inside ${ctx.host.name}</summary><div class="small stack-sm">
      <div>The journal is part of ${ctx.host.name} here, so it ${s.github.folder ? html`keeps its files in the <code>${s.github.folder}/</code> folder of <b>${s.github.owner}/${s.github.repo}</b>` : html`syncs with <b>${s.github.owner}/${s.github.repo}</b>`}${ctx.host.tokenKey ? html` and uses the token you already saved in ${ctx.host.name}` : ""}. Tap <b>Check &amp; sync</b>.</div>
      <div>The token needs <b>Contents: Read and write</b> on that repository. The journal still refuses to sync to a public repository.</div>
      <div class="faint">Anyone or anything that can read that repository — including Claude sessions working on your ${ctx.host.name.toLowerCase()} — can read journal files that aren't sealed. Seal what should stay unreadable.</div></div></details>` : ""}
    <details class="layer" style="margin-top:12px" ${conf || ctx.host ? "" : "open"}><summary>${raw(icon("info"))}${ctx.host ? "Using a repository of its own instead" : "How to set this up (5 minutes)"}</summary><div class="small stack-sm">
      <div>1. On GitHub, create a <b>new private repository</b> (e.g. <code>journal-data</code>). Leave it empty. The journal refuses to sync to a public repository.</div>
      <div>2. Create a <b>fine-grained personal access token</b> (Settings → Developer settings → Fine-grained tokens) with access to <i>only that repository</i> and permission <b>Contents: Read and write</b>. Optionally add <code>tasks-data</code> (to send tasks) and your Atlas repo (read-only is enough) to the same token.</div>
      <div>3. Paste the owner, repository and token above, then <b>Check &amp; sync</b>. The first sync adds a README and the steward rules (CLAUDE.md) to the repo.</div>
      <div>4. Do the same on your other devices — they'll download everything.</div>
      <div class="faint">The token is stored only in this browser's local storage and sent only to api.github.com — the same approach as your tasks app. Anyone with this unlocked device could use it; revoke it on GitHub if a device is lost.</div></div></details>`;
}

function ai(ctx) {
  const s = ctx.settings();
  const sec = ctx.secrets();
  return html`
    <p class="view-sub">Everything works without AI. With a key, Claude can tidy voice notes, talk things through with you, read documents you allow, and suggest patterns and questions — each time with a clear look at what's being sent.</p>
    <div class="card flat">
      <label class="field"><span>Anthropic API key</span><input class="input" type="password" data-secret="anthropicKey" value="${sec.anthropicKey || ""}" placeholder="sk-ant-…" autocomplete="off"></label>
      <p class="hint">From console.anthropic.com → API keys. Stored only on this device; requests go straight from this browser to Anthropic. You pay for your own usage.</p>
      <label class="field"><span>Model</span><select class="select" data-set="ai.model">${Object.entries(MODELS).map(([k, m]) => html`<option value="${k}" ${s.ai.model === k ? "selected" : ""}>${m.label} — ${m.note}</option>`)}</select></label>
      <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="test-ai">Test the key</button></div>
    </div>
    <div class="section-title">Use AI for</div>
    <div class="card flat">
      ${sw('data-set="ai.cleanup"', s.ai.cleanup, "Tidying voice transcripts", "Rules-based cleanup always runs; AI cleanup is checked against your exact words before you approve it")}
      ${sw('data-set="ai.conversation"', s.ai.conversation, "Talk it through", "A reflective conversation that becomes an entry you approve")}
      ${sw('data-set="ai.documents"', s.ai.documents, "Reading documents", "Only documents you mark as allowing AI; readings are stored separately and labelled")}
      ${sw('data-set="ai.patterns"', s.ai.patterns, "Suggesting patterns and questions", "Proposals only — nothing enters your meta-record without your decision")}
    </div>
    <p class="small muted">Entries marked <b>No AI</b> or <b>Sealed</b> are never sent, by any feature. Refusal fallback is on: if the model's safety system declines a request, the API retries it on Anthropic's recommended fallback model.</p>`;
}

function voice(ctx) {
  const s = ctx.settings();
  const t = s.transcription;
  const sec = ctx.secrets();
  return html`
    <p class="view-sub">Choose how speech becomes text. The journal owns the workflow; engines are swappable. Audio is always saved first, so nothing is lost if transcription fails or you're offline.</p>
    <div class="card flat">
      <label class="field"><span>Engine</span><select class="select" data-set="transcription.engine" data-rerender>
        <option value="auto" ${t.engine === "auto" ? "selected" : ""}>Automatic — API if set up, else browser dictation</option>
        <option value="webspeech" ${t.engine === "webspeech" ? "selected" : ""}>Browser dictation (free, live)${webSpeechSupported() ? "" : " — not available in this browser"}</option>
        <option value="api" ${t.engine === "api" ? "selected" : ""}>Transcription API (record, then transcribe)</option>
        <option value="none" ${t.engine === "none" ? "selected" : ""}>Record only — transcribe later</option></select></label>
      <label class="field"><span>Language</span><select class="select" data-set="transcription.language"><option value="auto" ${t.language === "auto" ? "selected" : ""}>Automatic</option><option value="en" ${t.language === "en" ? "selected" : ""}>English</option><option value="vi" ${t.language === "vi" ? "selected" : ""}>Tiếng Việt</option></select></label>
      ${sw('data-set="transcription.keepAudio"', t.keepAudio, "Keep the original audio", "Saved with the entry (and synced). Off: audio is deleted once you approve the transcript")}
      ${sw('data-set="transcription.autoApproveShort"', t.autoApproveShort, "Skip review for short, faithful notes", "Under ~45 words with no meaning changes detected")}
    </div>
    <div class="section-title">Transcription API (optional)</div>
    <div class="card flat">
      <p class="small muted" style="margin-top:0">Any OpenAI-compatible <code>/audio/transcriptions</code> endpoint. Good for long notes, accents and Vietnamese.</p>
      <div class="chips" style="margin-bottom:10px"><button class="chip" data-act="preset" data-endpoint="https://api.openai.com/v1/audio/transcriptions" data-model="gpt-4o-transcribe">OpenAI</button><button class="chip" data-act="preset" data-endpoint="https://api.groq.com/openai/v1/audio/transcriptions" data-model="whisper-large-v3-turbo">Groq (Whisper)</button><button class="chip" data-act="preset" data-endpoint="http://localhost:8000/v1/audio/transcriptions" data-model="whisper-1">Self-hosted</button></div>
      <label class="field"><span>Endpoint</span><input class="input" data-set="transcription.endpoint" value="${t.endpoint}" autocomplete="off"></label>
      <label class="field"><span>Model</span><input class="input" data-set="transcription.model" value="${t.model}" autocomplete="off"></label>
      <label class="field"><span>API key</span><input class="input" type="password" data-secret="transcriptionKey" value="${sec.transcriptionKey || ""}" autocomplete="off"></label>
      <p class="hint">Browser dictation sends audio to your browser vendor's speech service (Apple on iPhone, Google in Chrome). The API option sends it to the endpoint above. No-AI and sealed voice notes are recorded only, unless you choose “transcribe anyway”.</p>
    </div>`;
}

function privacy(ctx) {
  const sealing = ctx.store.config("sealing", null);
  const set = !!sealing?.salt;
  const locked = ctx.store.isLocked();
  const s = ctx.settings();
  const counts = { normal: 0, "no-ai": 0, sealed: 0 };
  for (const e of ctx.store.all("entry")) counts[e.privacy || "normal"] = (counts[e.privacy || "normal"] || 0) + 1;
  return html`
    <div class="section-title">Three levels, per entry</div>
    <div class="card flat">${Object.entries(PRIVACY_LEVELS).map(([k, p]) => html`<div style="margin-bottom:10px"><b>${p.label}</b> <span class="faint small">· ${counts[k] || 0} entries</span><div class="small muted">${p.hint}</div></div>`)}
      <p class="small faint" style="margin:0">“No AI” is enforced by this app and by the steward's tooling; it is a rule, not encryption. For a technical guarantee, use Sealed.</p></div>
    <div class="section-title">Sealing</div>
    <div class="card flat">
      ${!set ? html`<p style="margin-top:0">Set a passphrase to seal your most private entries (e.g. therapy notes). Sealed text and photos are encrypted on this device (AES-256) before they're stored or synced.</p>
          <div class="notice warn">${raw(icon("warn"))}<span><b>There is no recovery.</b> If you forget the passphrase, sealed entries can't be opened by anyone — including you. Keep it in a password manager.</span></div>
          <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="seal-setup">Set a passphrase</button></div>`
        : html`<div class="row"><div class="grow">${locked ? html`${raw(icon("lock"))} Locked — ${ctx.store.sealedLockedCount()} sealed entr${ctx.store.sealedLockedCount() === 1 ? "y" : "ies"} hidden` : html`${raw(icon("unlock"))} Unlocked on this device`}</div>
          ${locked ? html`<button class="btn primary" data-act="unlock">Unlock</button>` : html`<button class="btn" data-act="lock">Lock now</button>`}</div>
          <label class="field" style="margin-top:12px"><span>Lock automatically after</span><select class="select" data-set="sealing.autoLockMinutes" data-num>${[5, 15, 30, 60, 240].map((m) => html`<option value="${m}" ${s.sealing.autoLockMinutes === m ? "selected" : ""}>${m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`} of inactivity</option>`)}</select></label>`}
    </div>
    <div class="section-title">Deliberately not tracked</div>
    <div class="card flat small">
      <div>• <b>Location</b> — photo GPS is never read; there's no location tracking.</div>
      <div>• <b>Streaks, word counts, “engagement”</b> — missing days create no backlog and no guilt.</div>
      <div>• <b>Analytics or telemetry</b> — the app makes no requests except to the services you configure (GitHub, Anthropic, a transcription endpoint).</div>
      <div>• <b>Silence</b> — not answering a prompt is never read as avoidance.</div>
    </div>`;
}

function prompts(ctx) {
  const p = ctx.prefs();
  const P = p.prompts;
  const learned = learnedSuppressions(p.feedback);
  const paused = P.paused_until && P.paused_until >= ctx.today();
  return html`
    <p class="view-sub">The journal asks only when a question seems worth it, and never by notification. Everything here is visible and reversible.</p>
    <div class="card flat">
      <label class="field"><span>Cards on Today (at most)</span><select class="select" data-pref="prompts.budget" data-num>${[0, 1, 2, 3, 4].map((n) => html`<option value="${n}" ${P.budget === n ? "selected" : ""}>${n === 0 ? "None" : n}</option>`)}</select></label>
      <label class="field"><span>Evening starts at</span><select class="select" data-pref="prompts.evening_hour" data-num>${[17, 18, 19, 20, 21, 22].map((h) => html`<option value="${h}" ${P.evening_hour === h ? "selected" : ""}>${h}:00</option>`)}</select></label>
      ${sw('data-pref="prompts.on_this_day"', P.on_this_day !== false, "Show “On this day” memories", "Entries from the same date in earlier years. Turn off if anniversaries are hard.")}
      ${sw('data-pref="simple_today"', !!p.simple_today, "Simpler Today", "Just the writing area and today's moments")}
      <div class="btn-row" style="margin-top:6px">${paused ? html`<span class="small">Paused until ${formatDay(P.paused_until, { day: "numeric", month: "short" })}</span><button class="btn small" data-act="unpause">Resume</button>` : html`<button class="btn small" data-act="pause" data-days="7">Pause prompts for a week</button><button class="btn small" data-act="pause" data-days="30">…a month</button>`}</div>
    </div>
    <div class="section-title">Kinds of prompt</div>
    <div class="card flat">${Object.entries(PROMPT_KINDS).map(([k, label]) => sw(`data-act="toggle-kind" data-kind="${k}"`, !(P.disabled || []).includes(k), label, ""))}</div>
    <div class="section-title">What the journal has learned</div>
    <div class="card flat small">
      ${learned.length ? learned.map((l) => html`<div class="row"><span class="grow">Showing fewer <b>${PROMPT_KINDS[l.kind] || QUESTION_KINDS[l.kind.replace(/^q:/, "")] || l.kind}</b> — you marked ${l.notHelpful} of ${l.n} unhelpful.</span><button class="btn small ghost" data-act="reset-fb" data-kind="${l.kind}">Reset</button></div>`) : html`<p class="muted" style="margin:0">Nothing yet. Thumbs up/down on prompts teach it what's useful; you'll see what it learned here.</p>`}
      ${(p.muted_topics || []).length ? html`<div style="margin-top:10px"><b>Muted topics</b>${p.muted_topics.map((m) => html`<div class="row"><span class="grow">#${m.topic || m}${m.until ? ` until ${m.until}` : ""}</span><button class="btn small ghost" data-act="unmute" data-topic="${m.topic || m}">Unmute</button></div>`)}</div>` : ""}
      ${(p.never_kinds || []).length ? html`<div style="margin-top:10px"><b>Never raised</b>${p.never_kinds.map((k) => html`<div class="row"><span class="grow">${QUESTION_KINDS[k] || k}</span><button class="btn small ghost" data-act="unnever" data-kind="${k}">Allow again</button></div>`)}</div>` : ""}
      <div class="btn-row" style="margin-top:10px"><button class="btn small" data-act="mute-topic">Mute a topic…</button></div>
    </div>`;
}

function appearance(ctx) {
  const s = ctx.settings();
  const themes = [["auto", "Automatic", "Paper by day, Ink by night"], ["paper", "Paper", "Warm and light"], ["ink", "Ink", "Calm and dark"], ["lantern", "Lantern", "Warm dark, like a Hội An evening"], ["terminal", "Terminal", "Neon on black, to match Tasks"]];
  return html`<div class="card flat">
    <span class="label">Theme</span><div class="stack-sm">${themes.map(([k, t, d]) => html`<label class="switch" style="padding:6px 0"><input type="radio" name="theme" data-set="theme" value="${k}" ${s.theme === k ? "checked" : ""}><span><span class="t">${t}</span><br><span class="d">${d}</span></span></label>`)}</div>
    <label class="field" style="margin-top:12px"><span>Text size</span><select class="select" data-set="textScale" data-num>${[[0.9, "Smaller"], [1, "Default"], [1.1, "Larger"], [1.22, "Largest"]].map(([v, l]) => html`<option value="${v}" ${Number(s.textScale) === v ? "selected" : ""}>${l}</option>`)}</select></label></div>`;
}

function days(ctx) {
  const p = ctx.prefs();
  return html`<div class="card flat">
    <label class="field"><span>Rating scale for new days</span><select class="select" data-pref="rating_scale" data-num><option value="10" ${p.rating_scale === 10 ? "selected" : ""}>1–10</option><option value="5" ${p.rating_scale === 5 ? "selected" : ""}>1–5</option></select></label>
    <p class="hint">Each day stores its own scale, so changing this never rewrites old ratings — and imported ratings keep theirs.</p>
    <label class="field"><span>A day ends at</span><select class="select" data-pref="rollover_hour" data-num>${[0, 2, 3, 4, 5, 6].map((h) => html`<option value="${h}" ${p.rollover_hour === h ? "selected" : ""}>${h === 0 ? "Midnight" : `${h}:00 am`}</option>`)}</select></label>
    <p class="hint">Writing at 1am about “today” usually means the day that just ended. The composer always shows which day it'll file under.</p></div>`;
}

function integrations(ctx) {
  const s = ctx.settings().integrations;
  return html`
    <p class="view-sub">The journal connects to your other systems without absorbing them. Nothing is sent anywhere without you tapping it.</p>
    <div class="section-title">Tasks</div>
    <div class="card flat">
      <p class="small muted" style="margin-top:0">From an entry's menu → “To tasks”, you write the task and it's added to your tasks app's data. The default is your <b>private</b> tasks repo, so journal context never lands in public data.</p>
      <label class="field"><span>Repository</span><input class="input" data-set="integrations.tasks.repo" value="${s.tasks.repo}" autocomplete="off"></label>
      <label class="field"><span>File</span><input class="input" data-set="integrations.tasks.path" value="${s.tasks.path}" autocomplete="off"></label>
      <label class="field"><span>Category for new tasks</span><input class="input" data-set="integrations.tasks.category" value="${s.tasks.category}" autocomplete="off"></label>
      <p class="hint">Uses the sync token — give it access to this repository too.</p>
      ${sw('data-set="integrations.tasks.cues"', s.tasks.cues !== false, "Use my tasks as memory cues", "When you catch up on a past day, show what you finished, added or noted in Tasks that day. Read-only, only when you open that day, never sent to AI")}
      <label class="field"><span>Public tasks repository (also read for cues)</span><input class="input" data-set="integrations.tasks.publicRepo" value="${s.tasks.publicRepo || ""}" placeholder="none" autocomplete="off"></label>
    </div>
    <div class="section-title">Knowledge system (Atlas)</div>
    <div class="card flat">
      <p class="small muted" style="margin-top:0">Type <code>@concept-id</code> in an entry to link an idea from your Atlas (same convention as Atlas chat). The journal can fetch the list of ids so it can show names and suggest links.</p>
      <label class="field"><span>Repository</span><input class="input" data-set="integrations.atlas.repo" value="${s.atlas.repo}" autocomplete="off"></label>
      <label class="field"><span>Site URL (optional, for “open in Atlas”)</span><input class="input" data-set="integrations.atlas.siteUrl" value="${s.atlas.siteUrl}" placeholder="https://…" autocomplete="off"></label>
      <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="atlas-refresh">Fetch concept list</button><span class="small muted">${(ctx.store.getKv("atlas-index", { items: [] }).items || []).length} cached</span></div>
    </div>`;
}

function data(ctx) {
  const entries = ctx.store.all("entry").length;
  const sample = ctx.store.all("entry").filter((e) => e.source?.system === "sample").length;
  return html`
    <div class="section-title">Export</div>
    <div class="card flat"><p class="small muted" style="margin-top:0">A .zip of your journal in its plain Markdown format — readable anywhere, importable back. Sealed entries stay encrypted.</p>
      <div class="btn-row"><button class="btn primary" data-act="export" data-media="1">${raw(icon("download"))}Everything</button><button class="btn" data-act="export" data-media="0">Text only (small)</button></div></div>
    <div class="section-title">Import</div>
    <div class="card flat"><div class="btn-row"><a class="btn" href="#/import/notion">Notion journal</a><a class="btn" href="#/import/ics">Calendar (.ics)</a><a class="btn" href="#/import/backup">Restore backup</a></div></div>
    <div class="section-title">On this device</div>
    <div class="card flat small" data-storage>${entries} entries. <button class="btn small ghost" data-act="storage">Check storage</button></div>
    <div class="section-title">Try it out</div>
    <div class="card flat"><p class="small muted" style="margin-top:0">Add a handful of clearly-marked, fictional sample entries, a proposal and a question to explore the app. Remove them in one tap.</p>
      <div class="btn-row">${sample ? html`<button class="btn" data-act="sample-remove">Remove ${sample} sample entries</button>` : html`<button class="btn" data-act="sample-add">Add sample data</button>`}</div></div>
    <div class="section-title">Reset</div>
    <div class="card flat"><p class="small muted" style="margin-top:0">Erase this device's copy (entries, media, settings, keys). Your sync repository is not touched.</p><button class="btn danger" data-act="wipe">Erase this device</button></div>`;
}

// ---------- actions ----------

async function act(ctx, name, b, el, render) {
  if (name === "sync-now") { await ctx.sync.syncNow(); return; }
  if (name === "test-sync") {
    const remote = ctx.sync.remote();
    if (!remote) return toast("Fill in owner, repository and token first.");
    const info = await remote.getRepoInfo();
    if (!info.private) {
      await sheet({ title: "That repository is public", body: html`<p><b>${info.fullName}</b> is public. Your journal will only sync to a private repository. Make it private on GitHub (Settings → General → Danger zone), or create a new private one.</p>`, foot: html`<button class="btn primary" data-close>OK</button>` });
      return;
    }
    if (info.canPush === false) return toast("This token can read the repository but not write. Give it Contents: Read and write.", { error: true });
    toast(`Connected to ${info.fullName} (private). Syncing…`);
    const r = await ctx.sync.syncNow();
    if (r) toast(`Synced: ${r.pushed} up, ${r.pulled} down${r.pendingMedia ? `, ${r.pendingMedia} media still uploading` : ""}.`);
    return;
  }
  if (name === "push-template") {
    await ctx.sync.pushTemplate();
    return toast("Steward files updated in the repository.");
  }
  if (name === "disconnect") {
    if (!(await confirmSheet("Stop syncing on this device? Your entries stay here and in the repository.", { confirm: "Disconnect" }))) return;
    await ctx.saveSecrets({ githubToken: "", ignoreHostToken: true });
    ctx.sync.set({ state: "off" });
    return render();
  }
  if (name === "use-host-token") {
    await ctx.saveSecrets({ ignoreHostToken: false });
    render();
    return ctx.sync.syncNow();
  }
  if (name === "test-ai") {
    const close = toast("Testing…", { timeout: 0 });
    try {
      const ai = await ctx.ai.get();
      const out = await ai.cleanupTranscript("um so this is uh a test of the the key");
      close();
      toast(`Works — ${ai.model} replied: “${out}”`, { timeout: 6000 });
    } catch (err) { close(); throw err; }
    return;
  }
  if (name === "preset") {
    await ctx.saveSettings({ transcription: { endpoint: b.dataset.endpoint, model: b.dataset.model, engine: "api" } });
    toast("Preset applied — add that service's API key below.");
    return render();
  }
  if (name === "seal-setup") {
    const v = await sheet({
      title: "Set a sealing passphrase",
      body: html`<label class="field"><span>Passphrase (8+ characters; a few words is best)</span><input class="input" type="password" data-p1 autofocus autocomplete="new-password"></label>
        <label class="field"><span>Again</span><input class="input" type="password" data-p2 autocomplete="new-password"></label>
        <label class="switch"><input type="checkbox" data-ack><span><span class="t">I understand there's no way to recover it</span></span></label>`,
      foot: html`<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Set passphrase</button>`,
      setup: (d, close) => d.querySelector("[data-ok]").addEventListener("click", () => {
        const p1 = d.querySelector("[data-p1]").value, p2 = d.querySelector("[data-p2]").value;
        if (p1 !== p2) return toast("The passphrases don't match.");
        if (!d.querySelector("[data-ack]").checked) return toast("Please confirm you understand there's no recovery.");
        close(p1);
      }),
    });
    if (!v) return;
    const { config, key } = await createSealing(v);
    await ctx.store.setConfig("sealing", config);
    await ctx.store.unlock(key);
    toast("Sealing is ready. Choose “Sealed” on any entry or document.");
    return render();
  }
  if (name === "unlock") {
    const p = await promptSheet({ title: "Unlock sealed entries", label: "Passphrase", type: "password", confirm: "Unlock" });
    if (!p) return;
    const key = await unlockSealing(p, ctx.store.config("sealing", null));
    const r = await ctx.store.unlock(key);
    toast(r.failed ? `Unlocked, but ${r.failed} entries couldn't be opened (sealed with a different passphrase?)` : "Unlocked");
    return render();
  }
  if (name === "lock") { ctx.store.lock(); return render(); }
  if (name === "pause" || name === "unpause") {
    const p = ctx.prefs();
    await ctx.savePrefs({ ...p, prompts: { ...p.prompts, paused_until: name === "pause" ? addDays(ctx.today(), Number(b.dataset.days)) : null } });
    return render();
  }
  if (name === "toggle-kind") {
    const p = ctx.prefs();
    const dis = new Set(p.prompts.disabled || []);
    if (b.checked) dis.delete(b.dataset.kind); else dis.add(b.dataset.kind);
    await ctx.savePrefs({ ...p, prompts: { ...p.prompts, disabled: [...dis] } });
    return;
  }
  if (name === "reset-fb") {
    const p = ctx.prefs();
    const fb = { ...p.feedback };
    delete fb[b.dataset.kind];
    await ctx.savePrefs({ ...p, feedback: fb });
    return render();
  }
  if (name === "unmute") {
    const p = ctx.prefs();
    await ctx.savePrefs({ ...p, muted_topics: (p.muted_topics || []).filter((m) => (m.topic || m) !== b.dataset.topic) });
    return render();
  }
  if (name === "unnever") {
    const p = ctx.prefs();
    await ctx.savePrefs({ ...p, never_kinds: (p.never_kinds || []).filter((k) => k !== b.dataset.kind) });
    return render();
  }
  if (name === "mute-topic") {
    const t = await promptSheet({ title: "Mute a topic", label: "Tag or topic", placeholder: "e.g. work", hint: "Prompts and suggestions won't raise it for 90 days." });
    if (!t?.trim()) return;
    const p = ctx.prefs();
    await ctx.savePrefs({ ...p, muted_topics: [...(p.muted_topics || []), { topic: t.trim().replace(/^#/, "").toLowerCase(), until: addDays(ctx.today(), 90) }] });
    return render();
  }
  if (name === "atlas-refresh") {
    const { refreshAtlasIndex } = await import("../integrations/atlas.js");
    const n = await refreshAtlasIndex(ctx);
    toast(`Fetched ${n} Atlas ids`);
    return render();
  }
  if (name === "export") {
    const close = toast("Preparing export…", { timeout: 0 });
    try {
      const { exportZip } = await import("../data/export.js");
      const r = await exportZip(ctx, { includeMedia: b.dataset.media === "1" });
      close();
      download(`living-journal-${ctx.today()}${b.dataset.media === "1" ? "" : "-text"}.zip`, r.blob);
      toast(`Exported ${r.records} records${b.dataset.media === "1" ? ` and ${r.media} media files${r.missing ? ` (${r.missing} not on this device)` : ""}` : ""} · ${bytes(r.blob.size)}`, { timeout: 7000 });
    } catch (err) { close(); throw err; }
    return;
  }
  if (name === "storage") {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    el.querySelector("[data-storage]").innerHTML = String(html`${ctx.store.all("entry").length} entries · ${ctx.store.blobMeta.size} media files.
      ${est ? html`Using ${bytes(est.usage)} of ${bytes(est.quota)} available.` : ""} ${persisted ? html`<span class="badge ok">protected from automatic clearing</span>` : html`<span class="badge warn">the browser may clear this under storage pressure</span> <button class="btn small" data-act="persist">Ask to keep it</button>`}`);
    return;
  }
  if (name === "persist") {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? "The browser will keep your journal." : "The browser declined — installing to the home screen usually helps. Sync keeps a safe copy either way.", { timeout: 7000 });
    return;
  }
  if (name === "sample-add") {
    const { addSampleData } = await import("../app/sample.js");
    const n = await addSampleData(ctx);
    toast(`Added ${n} sample entries (tagged #sample)`);
    return render();
  }
  if (name === "sample-remove") {
    const { removeSampleData } = await import("../app/sample.js");
    const n = await removeSampleData(ctx);
    toast(`Removed ${n} sample records`);
    return render();
  }
  if (name === "wipe") {
    const typed = await promptSheet({ title: "Erase this device?", label: "Type ERASE to confirm", hint: ctx.sync.configured() ? `${ctx.sync.pendingCount()} changes haven't synced yet and would be lost.` : "Nothing is synced — this deletes your only copy. Export first.", confirm: "Erase" });
    if (typed !== "ERASE") return;
    await ctx.store.wipe();
    location.hash = "#/today";
    location.reload();
  }
}
