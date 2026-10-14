// Pack source of the browser engine: the registry that tools/build_site.py publishes on the page's own origin under
// /registry/ (manifest.json + <id>-<version>.zip, the same files tools/build_registry.py builds for the helper), so
// the browser reads exactly what the helper reads. Port of helper/vitranslate/registry.py for the browser:
// - manifest(): <base>manifest.json, invalid entries (and duplicate ids) and non-finite idf values dropped; when it
//   cannot be fetched or is not a manifest, `offline` is set and it throws PackUnavailable: the pipeline then runs
//   without domain packs (engine contract), as the helper does with an empty manifest.
// - readText(packId, version, file): the text of one file of a pack (null when the pack has no such file). The zip is
//   checked against the manifest's sha256 BEFORE anything is unpacked (only the known pack file names, pack.json must
//   name the same id and version), unpacked with the engine's zip reader and kept by sha256 in Cache Storage; a cached
//   copy is checked again before use. lastSource(id) says "cache" or "downloaded" (the helper's report values).
// - The bundled writing-style pack (packs/_style, which the helper ships instead of downloading) is published as
//   plain files under <base>_style/: readText("_style", any version, file).
// Only plain GETs of the manifest and of pack files leave the page; no document content is ever sent.
import { readZip, inflateEntry } from "./ooxml/zip.js";

export const PACK_FILES = new Set(["pack.json", "prompt.md", "glossary.csv", "rules.json", "tests.jsonl", "sources.md"]);
export const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
export const MAX_PACK_BYTES = 50 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 16;
export const PACK_CACHE = "vt-packs-v1";
export const STYLE_ID = "_style";

const ID_RE = /^[a-z0-9_-]+$/;
const VERSION_RE = /^\p{Nd}+\.\p{Nd}+\.\p{Nd}+$/u;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]*\.zip$/;
const SHA_RE = /^[0-9a-f]{64}$/;

/** A pack could not be fetched, verified or unpacked. */
export class PackUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = "PackUnavailable";
    this.code = "pack_unavailable";
  }
}

const isStr = (v, re) => typeof v === "string" && (!re || re.test(v));
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const plainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validEntry(e) {
  if (!plainObject(e)) return false;
  if (!(isStr(e.id, ID_RE) && isStr(e.name) && isStr(e.version, VERSION_RE) && isStr(e.file, FILE_RE)
    && isStr(e.sha256, SHA_RE))) return false;
  const detect = e.detect === undefined ? [] : e.detect;
  if (!(Number.isInteger(e.size) && e.size >= 0)) return false;
  if (!plainObject(e.profile) || !Object.values(e.profile).every(finite)) return false;
  if (!Array.isArray(detect) || !detect.every((t) => typeof t === "string")) return false;
  return e.parent === undefined || e.parent === null || isStr(e.parent, ID_RE);
}

/** The manifest with invalid pack entries (and duplicate ids) and invalid idf values dropped; throws when the text is
 * not a manifest (helper: registry._parse). */
export function parseManifest(text) {
  const m = JSON.parse(text);
  if (!plainObject(m) || !Array.isArray(m.packs)) throw new Error("not a pack manifest");
  const packs = [];
  const seen = new Set();
  for (const e of m.packs) {
    if (validEntry(e) && !seen.has(e.id)) {
      seen.add(e.id);
      packs.push(e);
    }
  }
  const idf = {};
  if (plainObject(m.idf)) for (const [t, w] of Object.entries(m.idf)) if (finite(w)) idf[t] = w;
  return Object.assign({}, m, { packs, idf });
}

const empty = () => ({ packs: [], idf: {} });
const errText = (e) => String(e && e.message ? e.message : e);

async function sha256Hex(subtle, bytes) {
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decode(bytes, what) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);  // a BOM stays, as Python reads
  } catch (e) {
    throw new PackUnavailable(what + " is not UTF-8 text");
  }
}

// {name: bytes} of a verified pack zip (helper: registry._extract + the pack.json check of ensure()).
function unpack(data, entry) {
  let entries;
  const fail = () => new PackUnavailable("pack " + entry.id + " could not be unpacked");
  try {
    entries = readZip(data).entries;
  } catch (e) {
    throw fail();
  }
  const names = entries.map((e) => e.name);
  if (entries.length > MAX_ZIP_ENTRIES || new Set(names).size !== names.length || !names.every((n) => PACK_FILES.has(n))) {
    throw new PackUnavailable("pack " + entry.id + ": unexpected zip entries " + JSON.stringify(names.slice(0, MAX_ZIP_ENTRIES)));
  }
  if (entries.reduce((s, e) => s + e.usize, 0) > MAX_UNPACKED_BYTES) {
    throw new PackUnavailable("pack " + entry.id + " is too large when unpacked");
  }
  const files = new Map();
  try {
    for (const e of entries) files.set(e.name, inflateEntry(e));
  } catch (e) {
    throw fail();
  }
  if (!files.has("pack.json")) throw fail();
  let meta;
  try { meta = JSON.parse(decode(files.get("pack.json"), "pack.json")); } catch (e) { throw fail(); }
  if (!plainObject(meta) || meta.id !== entry.id || meta.version !== entry.version) {
    throw new PackUnavailable("pack " + entry.id + ": pack.json does not name " + entry.id + "@" + entry.version);
  }
  return files;
}

/**
 * The packs source of the engine contract: { manifest(), readText(packId, version, file), offline, lastSource }.
 * One instance per job: lastSource tells how this job got each pack (Cache Storage or a download).
 * opts: { base (default "registry/" next to the page), fetch, caches (null: no Cache Storage), subtle }.
 */
export function createRegistry(opts) {
  const o = opts || {};
  const loc = globalThis.location && globalThis.location.href;
  const base = new URL(o.base || "registry/", loc || undefined).href;
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const caches = o.caches !== undefined ? o.caches : (globalThis.caches || null);
  const subtle = o.subtle || (globalThis.crypto && globalThis.crypto.subtle);
  const unpacked = new Map();  // sha256 -> Map(name -> bytes)
  let current = null;

  async function openCache() {
    try { return caches ? await caches.open(PACK_CACHE) : null; } catch (e) { return null; }
  }

  async function getBytes(url, cap, what) {
    const res = await doFetch(url, { cache: "no-cache" });
    if (!res.ok) throw new PackUnavailable(what + " could not be downloaded (HTTP " + res.status + ")");
    const declared = Number(res.headers.get("content-length"));
    if (declared > cap) throw new PackUnavailable(what + " is larger than " + cap + " bytes");
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length > cap) throw new PackUnavailable(what + " is larger than " + cap + " bytes");
    return data;
  }

  const sources = {};
  const reg = {
    offline: null,  // unknown until manifest() runs

    /** How this job got the pack: "cache" (Cache Storage) | "downloaded" | null (helper: registry.last_source). */
    lastSource(packId) {
      return sources[packId] || null;
    },

    /** The parsed manifest; throws PackUnavailable when it cannot be fetched or is not a manifest (the engine
     * contract: the job then runs offline, without domain packs, as the helper does with no cached manifest). */
    async manifest() {
      try {
        const data = await getBytes(base + "manifest.json", MAX_MANIFEST_BYTES, "manifest.json");
        current = parseManifest(decode(data, "manifest.json"));
        reg.offline = false;
      } catch (e) {
        current = empty();
        reg.offline = true;
        throw e instanceof PackUnavailable ? e : new PackUnavailable("the pack registry is not reachable or its "
          + "manifest is invalid (" + errText(e) + ")");
      }
      return current;
    },

    async readText(packId, version, file) {
      if (!PACK_FILES.has(file)) throw new TypeError("not a pack file name: " + file);
      if (packId === STYLE_ID) return readStyle(file);
      if (!current) await reg.manifest();
      const entry = current.packs.find((e) => e.id === packId && e.version === version);
      if (!entry) throw new PackUnavailable("pack " + packId + "@" + version + " is not in the registry manifest");
      const files = await ensure(entry);
      return files.has(file) ? decode(files.get(file), packId + "/" + file) : null;
    },
  };

  async function readStyle(file) {
    let res;
    try { res = await doFetch(base + STYLE_ID + "/" + file, { cache: "no-cache" }); } catch (e) {
      throw new PackUnavailable("style pack file " + file + " could not be downloaded (" + errText(e) + ")");
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new PackUnavailable("style pack file " + file + " could not be downloaded (HTTP " + res.status + ")");
    return decode(new Uint8Array(await res.arrayBuffer()), STYLE_ID + "/" + file);
  }

  async function ensure(entry) {
    if (unpacked.has(entry.sha256)) return unpacked.get(entry.sha256);  // another file of a pack this instance has
    const url = base + entry.file;
    const key = url + "?sha256=" + entry.sha256;
    const cache = await openCache();
    let data = null;
    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit) {
          const bytes = new Uint8Array(await hit.arrayBuffer());
          if ((await sha256Hex(subtle, bytes)) === entry.sha256) data = bytes;
          else await cache.delete(key);  // damaged copy: download again
        }
      } catch (e) {
        data = null;
      }
    }
    let source = "cache";
    if (!data) {
      source = "downloaded";
      try {
        data = await getBytes(url, MAX_PACK_BYTES, "pack file " + entry.file);
      } catch (e) {
        if (e instanceof PackUnavailable) throw e;
        throw new PackUnavailable("pack file " + entry.file + " could not be downloaded (" + errText(e) + ")");
      }
      if ((await sha256Hex(subtle, data)) !== entry.sha256) {
        throw new PackUnavailable("pack " + entry.id + ": sha256 mismatch, the download was refused");
      }
    }
    const files = unpack(data, entry);
    if (source === "downloaded" && cache) {
      try { await cache.put(key, new Response(data)); } catch (e) { /* only costs a download next time */ }
    }
    unpacked.set(entry.sha256, files);
    sources[entry.id] = source;
    return files;
  }

  return reg;
}
