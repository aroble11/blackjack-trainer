/**
 * store.js — a tiny promise-based IndexedDB key/value store (no dependencies).
 *
 * One database, one object store ('kv'). Every call degrades gracefully to a
 * no-op / undefined if IndexedDB is unavailable (private mode, old browser), so
 * the game still runs — just without persistence.
 */
const DB_NAME = 'blackjack-trainer';
const STORE = 'kv';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      })
  );
}

export function idbGet(key) {
  return run('readonly', (s) => s.get(key)).catch(() => undefined);
}

export function idbSet(key, value) {
  return run('readwrite', (s) => s.put(value, key)).catch(() => {});
}

export function idbDel(key) {
  return run('readwrite', (s) => s.delete(key)).catch(() => {});
}
