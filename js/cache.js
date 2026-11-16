// Small IndexedDB key/value cache. Falls back to memory when IndexedDB is unavailable (private mode).
const mem = new Map();
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('gc-dashboard', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const tx = (db, mode) => db.transaction('kv', mode).objectStore('kv');
const wrap = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });

export async function cacheGet(key) {
  if (mem.has(key)) return mem.get(key);
  const db = await open();
  if (!db) return undefined;
  try { const v = await wrap(tx(db, 'readonly').get(key)); if (v) mem.set(key, v); return v; } catch { return undefined; }
}
export async function cacheSet(key, value) {
  mem.set(key, value);
  const db = await open();
  if (!db) return;
  try { tx(db, 'readwrite').put(value, key); } catch { /* quota or private mode: memory copy still works */ }
}
// Remove every entry that belongs to one site (called on Disconnect).
export async function cacheClear(prefix) {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  const db = await open();
  if (!db) return;
  try {
    const store = tx(db, 'readwrite');
    const req = store.openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) return; if (String(c.key).startsWith(prefix)) c.delete(); c.continue(); };
  } catch { /* ignore */ }
}
