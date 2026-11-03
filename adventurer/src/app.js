// The app context every view gets: the store, settings with the host's
// defaults, the token (your own, or the Tasks site's when installed there),
// sync, and the derived numbers (XP, rank, attributes) computed on demand.

import { Store, sync } from "./data/store.js";
import { attributeStats, totalXp, levelOf, rankOf, streak } from "./core/stats.js";
import { isExpired, OPEN } from "./core/quests.js";

export const DEFAULTS = {
  owner: "sandstormveg",
  repo: "tasks-data",
  publicRepo: "tasks",
  folder: "quests",
  relay: true,
  relayName: "Relay",
  chattiness: "normal",
  autoSync: true,
};

export async function loadHost() {
  try {
    const res = await fetch("host.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const h = await res.json();
    const home = typeof h.home === "string" && /^(\.\.?\/|\/(?!\/))[\w./#?=&%-]*$/.test(h.home) ? h.home : "";
    const tokenKey = typeof h.tokenKey === "string" && /^[\w.-]{1,64}$/.test(h.tokenKey) ? h.tokenKey : "";
    return h.name ? { name: String(h.name).slice(0, 40), home, tokenKey, defaults: h.defaults || {} } : null;
  } catch { return null; }
}

export function createContext(host) {
  const store = new Store();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ctx = {
    store,
    host,
    settings() { return { ...DEFAULTS, ...(host?.defaults || {}), ...store.settings }; },
    today() { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); },
    now() { return new Date().toISOString(); },
    token() {
      if (store.secrets.githubToken) return { token: store.secrets.githubToken, from: "own" };
      if (host?.tokenKey && !store.secrets.ignoreHostToken) {
        try { const t = localStorage.getItem(host.tokenKey); if (t) return { token: t, from: host.name }; } catch {}
      }
      return { token: "", from: null };
    },
    syncing: false,
    async syncNow() {
      const { token } = ctx.token();
      if (!token || ctx.syncing || !navigator.onLine) return;
      ctx.syncing = true;
      store.emit({ op: "sync-start" });
      try {
        const s = ctx.settings();
        await sync(store, { token, owner: s.owner, repo: s.repo, publicRepo: s.publicRepo, folder: s.folder, device: deviceName() });
      } catch (err) {
        store.status = { ...store.status, error: err.message || String(err) };
        store.persist();
        store.emit({ op: "sync-error" });
      } finally {
        ctx.syncing = false;
        store.emit({ op: "sync-end" });
      }
    },
    /** Quests with expiry applied (an open quest past its date reads as expired, and is saved so). */
    quests() {
      const today = ctx.today();
      return store.all().map((q) => (isExpired(q, today) ? { ...q, status: "expired" } : q));
    },
    derived() {
      const quests = ctx.quests();
      const history = store.tasks.history;
      const xp = totalXp({ quests, history });
      return {
        xp, level: levelOf(xp), rank: rankOf(xp),
        streak: streak({ quests, history, today: ctx.today() }),
        attributes: attributeStats({ quests, history, measurements: store.measurements(), profile: store.profile(), today: ctx.today() }),
        open: quests.filter((q) => OPEN.has(q.status)),
      };
    },
    taskTitle(id) {
      const t = [...store.tasks.active, ...store.tasks.history].find((x) => x.id === id);
      return t ? t.title : null;
    },
  };
  return ctx;
}

function deviceName() {
  const ua = navigator.userAgent.toLowerCase();
  return /android/.test(ua) ? "Android" : /iphone|ipad/.test(ua) ? "iPhone" : /windows/.test(ua) ? "Windows" : /mac os/.test(ua) ? "Mac" : "device";
}
