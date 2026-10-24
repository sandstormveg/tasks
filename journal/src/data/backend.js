// Storage backends with one tiny async interface. IndexedDB in the browser;
// an in-memory twin for tests and Node tools. Stores:
//   records   — every synced record (persisted form; sealed ones encrypted)
//   blobs     — media bytes keyed by repo path
//   kv        — device-only state: settings, secrets, sync state, drafts
//   revisions — earlier versions of records (your edits, sync conflicts)

export const STORES = { records: "id", blobs: "key", kv: "key", revisions: "rid" };
const DB_NAME = "living-journal";
const DB_VERSION = 1;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openIdbBackend(name = DB_NAME) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(store)) {
          const os = d.createObjectStore(store, { keyPath });
          if (store === "revisions") os.createIndex("recordId", "recordId");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database upgrade blocked — close other tabs of the journal and reload."));
  });
  const tx = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);
  return {
    kind: "indexeddb",
    getAll: (store) => promisify(tx(store).getAll()),
    get: (store, key) => promisify(tx(store).get(key)),
    put: (store, value) => promisify(tx(store, "readwrite").put(value)),
    async putMany(store, values) {
      if (!values.length) return;
      await new Promise((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        for (const v of values) os.put(v);
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("transaction aborted"));
      });
    },
    delete: (store, key) => promisify(tx(store, "readwrite").delete(key)),
    clear: (store) => promisify(tx(store, "readwrite").clear()),
    byIndex: (store, index, key) => promisify(tx(store).index(index).getAll(key)),
    close: () => db.close(),
    async destroy() { db.close(); await promisify(indexedDB.deleteDatabase(name)); },
  };
}

export function memoryBackend() {
  const data = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
  // Copies on the way in and out, like IndexedDB. Blob rows are copied
  // shallowly so their byte payload is shared rather than cloned.
  const clone = (store, v) => (store === "blobs" ? { ...v } : structuredClone(v));
  const keyOf = (store, v) => v[STORES[store]];
  return {
    kind: "memory",
    data,
    async getAll(store) { return [...data[store].values()].map((v) => clone(store, v)); },
    async get(store, key) { const v = data[store].get(key); return v === undefined ? undefined : clone(store, v); },
    async put(store, value) { data[store].set(keyOf(store, value), clone(store, value)); },
    async putMany(store, values) { for (const v of values) data[store].set(keyOf(store, v), clone(store, v)); },
    async delete(store, key) { data[store].delete(key); },
    async clear(store) { data[store].clear(); },
    async byIndex(store, index, key) { return [...data[store].values()].filter((v) => v[index] === key).map((v) => clone(store, v)); },
    close() {},
    async destroy() { for (const m of Object.values(data)) m.clear(); },
  };
}
