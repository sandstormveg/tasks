// The app context handed to every view: the store, device settings, synced
// preferences, and the services (sync, media, AI) built on top of them.
// Inside a host app (see host.js) the host's defaults sit between the built-in
// defaults and what you've saved, and its GitHub token is used if you haven't
// given the journal one of its own.

import { Store } from "../data/store.js";
import { openIdbBackend, memoryBackend } from "../data/backend.js";
import { deviceTimeZone, dayKey, isoLocal } from "../core/dates.js";
import { mergePrefs } from "../core/prompts.js";
import { Derived } from "./derived.js";
import { SyncService } from "./sync-service.js";
import { MediaService } from "./media-service.js";

export const DEFAULT_SETTINGS = {
  theme: "auto",
  textScale: 1,
  deviceName: "",
  // Your data repo, prefilled so a new device only needs the token.
  // folder: keep the journal inside one folder of the repo ("" = the whole repo).
  github: { owner: "sandstormveg", repo: "journal-data", branch: "", folder: "" },
  autoSync: true,
  ai: { model: "claude-opus-5-5", cleanup: true, conversation: true, documents: true, patterns: true, confirmBulk: true },
  transcription: {
    engine: "auto", // auto | webspeech | api | none
    language: "auto", // auto | en | vi
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    model: "gpt-4o-transcribe",
    keepAudio: true,
    autoApproveShort: true,
  },
  integrations: {
    // cues: show what you did in Tasks when you catch up on a past day (read-only).
    tasks: { repo: "sandstormveg/tasks-data", path: "data/tasks.json", category: "From journal", cues: true, publicRepo: "sandstormveg/tasks" },
    atlas: { repo: "sandstormveg/epistemic-atlas", paths: ["concepts", "claims", "models", "questions", "agents"], siteUrl: "" },
  },
  sealing: { autoLockMinutes: 15 },
};

function deepMerge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && v && typeof v === "object" && !Array.isArray(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function guessDeviceName() {
  const ua = (globalThis.navigator?.userAgent || "").toLowerCase();
  if (/iphone/.test(ua)) return "iPhone";
  if (/ipad/.test(ua)) return "iPad";
  if (/android/.test(ua)) return "Android phone";
  if (/mac os/.test(ua)) return "Mac";
  if (/windows/.test(ua)) return "Windows PC";
  if (/linux/.test(ua)) return "Linux computer";
  return "this device";
}

/** The host app's saved GitHub token, if it keeps one where we can read it. */
function hostToken(host) {
  if (!host?.tokenKey) return "";
  try { return (globalThis.localStorage?.getItem(host.tokenKey) || "").trim(); } catch { return ""; }
}

export async function createContext({ backend, host = null } = {}) {
  let be = backend;
  if (!be) {
    try { be = await openIdbBackend(); } catch (err) {
      console.error("IndexedDB unavailable, using memory (nothing will persist)", err);
      be = memoryBackend();
      be.volatile = true;
    }
  }
  const store = await new Store(be).load();

  const defaults = host?.defaults ? deepMerge(DEFAULT_SETTINGS, host.defaults) : DEFAULT_SETTINGS;
  const ctx = {
    store,
    host,
    volatile: !!be.volatile,
    settings() { return deepMerge(defaults, store.getKv("settings", {})); },
    async saveSettings(patch) {
      const next = deepMerge(this.settings(), patch);
      await store.setKv("settings", next);
      return next;
    },
    secrets() {
      const own = store.getKv("secrets", {});
      if (own.githubToken || own.ignoreHostToken) return own;
      const shared = hostToken(host);
      return shared ? { ...own, githubToken: shared, githubTokenFrom: host.name } : own;
    },
    // Saves only the journal's own secrets: a token borrowed from the host is never copied.
    async saveSecrets(patch) { await store.setKv("secrets", { ...store.getKv("secrets", {}), ...patch }); },
    prefs() { return mergePrefs(store.config("preferences", {})); },
    async savePrefs(prefs) { await store.setConfig("preferences", prefs); },
    chapters() { return (store.config("chapters", { list: [] }).list || []).slice().sort((a, b) => String(b.from).localeCompare(String(a.from))); },
    async saveChapters(list) { await store.setConfig("chapters", { list }); },
    tz() { return deviceTimeZone(); },
    today() { return dayKey(new Date(), this.tz(), this.prefs().rollover_hour ?? 4); },
    now() { return isoLocal(new Date(), this.tz()); },
    deviceName() { return this.settings().deviceName || guessDeviceName(); },
    navigate(hash, { replace = false } = {}) {
      if (replace) history.replaceState(null, "", hash); else location.hash = hash;
      if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
  };
  ctx.derived = new Derived(store);
  ctx.media = new MediaService(ctx);
  ctx.sync = new SyncService(ctx);
  ctx.ai = {
    // Loaded lazily so the AI SDK never loads unless you use an AI feature.
    async get() {
      if (!this._mod) this._mod = await import("../ai/assistant.js");
      return this._mod.createAssistant(ctx);
    },
    configured() { return !!ctx.secrets().anthropicKey; },
  };
  return ctx;
}
