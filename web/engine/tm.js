// Translation memory keyed by model + pack + tagged source: translates duplicates once and resumes jobs (port of
// helper/vitranslate/tm.py). The interface is {get(key) -> Promise<[out, level] | null>, put(key, out, level)}:
// MemoryTM for tests and one-off runs, IndexedDbTM in the browser (one object store, the key as the record key).
// Keys are the helper's: sha256 hex of "model \0 pack key \0 tagged" (UTF-8), through Web Crypto.
import { hasNonSpace } from "./py.js";

const encoder = new TextEncoder();

/** sha256 of the UTF-8 bytes of text, as lower-case hex. */
export async function sha256Hex(text) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** TM.key(model, pack_key, tagged) of the helper. */
export function tmKey(model, packKey, tagged) {
  return sha256Hex([model, packKey, tagged].join("\u0000"));
}

/** An empty result is a failure, never a cache entry. */
function storable(out) {
  return typeof out === "string" && out !== "" && hasNonSpace(out);
}

export class MemoryTM {
  constructor() {
    this.rows = new Map();
  }

  async get(key) {
    const row = this.rows.get(key);
    return row ? [row.out, row.level] : null;
  }

  async put(key, out, level) {
    if (!storable(out)) return;
    this.rows.set(key, { out, level });
  }

  close() {}
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB translation memory (browser). IndexedDbTM.open(name) resolves to an open TM; close() when done. */
export class IndexedDbTM {
  static STORE = "tm";

  static async open(name = "vitranslate-tm", indexedDB = globalThis.indexedDB) {
    if (!indexedDB) throw new Error("IndexedDB is not available");
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IndexedDbTM.STORE)) req.result.createObjectStore(IndexedDbTM.STORE);
    };
    return new IndexedDbTM(await request(req));
  }

  constructor(db) {
    this.db = db;
  }

  async get(key) {
    const tx = this.db.transaction(IndexedDbTM.STORE, "readonly");
    const row = await request(tx.objectStore(IndexedDbTM.STORE).get(key));
    return row ? [row.out, row.level] : null;
  }

  async put(key, out, level) {
    if (!storable(out)) return;
    const tx = this.db.transaction(IndexedDbTM.STORE, "readwrite");
    tx.objectStore(IndexedDbTM.STORE).put({ out, level }, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  /** Every entry (for tests and diagnostics): [[key, out, level], ...]. */
  async entries() {
    const tx = this.db.transaction(IndexedDbTM.STORE, "readonly");
    const store = tx.objectStore(IndexedDbTM.STORE);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    return keys.map((k, i) => [k, values[i].out, values[i].level]);
  }

  close() {
    this.db.close();
  }
}
