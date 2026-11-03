// Research's app context: its own on-device database (so research and journal
// never mix), its own settings, the host's token when it lives inside Tasks,
// and sync into a folder of the data repo — `research/` in tasks-data — with
// the README, Claude rules and query tool seeded from research-template/.

import { Store } from "../data/store.js";
import { openIdbBackend, memoryBackend } from "../data/backend.js";
import { deviceTimeZone, dayKey, isoLocal } from "../core/dates.js";
import { deepMerge, hostToken } from "../app/context.js";
import { SyncService } from "../app/sync-service.js";
import { MediaService } from "../app/media-service.js";

export const RESEARCH_TEMPLATE = ["README.md", "CLAUDE.md", ".gitattributes", ".claude/skills/research/SKILL.md", "tools/research.mjs"];

export const DEFAULT_SETTINGS = {
  theme: "auto",
  textScale: 1,
  deviceName: "",
  // Your research lives in research/ of your private tasks data, next to (never touching) your tasks.
  github: { owner: "sandstormveg", repo: "tasks-data", branch: "", folder: "research" },
  autoSync: true,
  // Your Infodex (the Atlas site), for "open in Infodex" on card pages; set in Settings.
  infodexUrl: "",
};

function guessDeviceName() {
  const ua = (globalThis.navigator?.userAgent || "").toLowerCase();
  if (/android/.test(ua)) return "Android phone";
  if (/iphone/.test(ua)) return "iPhone";
  if (/mac os/.test(ua)) return "Mac";
  if (/windows/.test(ua)) return "Windows PC";
  if (/linux/.test(ua)) return "Linux computer";
  return "this device";
}

export async function createResearchContext({ backend, host = null } = {}) {
  let be = backend;
  if (!be) {
    try { be = await openIdbBackend("living-research"); } catch (err) {
      console.error("IndexedDB unavailable, using memory (nothing will persist)", err);
      be = memoryBackend();
      be.volatile = true;
    }
  }
  const store = await new Store(be).load();
  // Installed inside Tasks, Research has its own host.json (tools/install-into.mjs --app research).
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
    async saveSecrets(patch) { await store.setKv("secrets", { ...store.getKv("secrets", {}), ...patch }); },
    prefs() { return { rollover_hour: 4 }; },
    tz() { return deviceTimeZone(); },
    today() { return dayKey(new Date(), this.tz(), 4); },
    now() { return isoLocal(new Date(), this.tz()); },
    deviceName() { return this.settings().deviceName || guessDeviceName(); },
    navigate(hash, { replace = false } = {}) {
      if (replace) history.replaceState(null, "", hash); else location.hash = hash;
      if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
    sources() { return store.all("source").filter((s) => !s.deleted); },
    boards() { return store.all("board").filter((b) => !b.deleted); },
    pieces() { return store.all("piece").filter((p) => !p.deleted); },
    cards() { return store.all("card").filter((c) => !c.deleted); },
    /** Everything for the corkboard and the Deposit, in one list. */
    records() { return ["board", "pin", "string", "card", "piece", "source"].flatMap((t) => store.all(t)); },
  };
  ctx.sync = new SyncService(ctx, { template: RESEARCH_TEMPLATE, templateDir: "research-template", label: "research" });
  ctx.media = new MediaService(ctx); // pictures in image sources: lazy, downloaded on first view on a new device
  return ctx;
}
