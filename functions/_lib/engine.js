// The translation API's side of the shared translation core (web/engine/core.js -- the one module graph the page and
// the Functions run; this file and live.js, the live-captions profile, are the only places that import it).
// - Packs: the deploy-time bundle of tools/bundle_packs.py ({format: 1, manifest, files: {"<id>@<version>/<file>" or
//   "_style/<file>": base64 of the registry's file bytes}}) is a pack source; file bytes are decoded with the core's
//   decodeText (strict UTF-8, BOM kept) and parsed once per isolate into a pack set (buildPackSet).
// - Helper parity: /classify runs prepareTranslation over the WHOLE document text (what the client's translateFile
//   passes to its injected prepare) and returns the wire setup {packs: [{id, version}] in merge order, hits: [glossary
//   English keys in the helper's order]} with setup_id = sha256 of it. /translate sends that setup back with every
//   batch; setupFor rebuilds the helper's system prompt from it (buildSystem(style prompt, merged pack, hits)), so all
//   batches of a document get the same prompt the helper would use (and share a cacheable prefix).
// - Term review (/terms, spec Amendment G): termSpans and packKeyFlags read English terms with the core's glossary
//   matcher (qa.js bounded: whole words, plurals of the last word, US / UK spellings, space or hyphen between words).
import { buildPackSet, prepareTranslation, loadStyle, loadPacks, Match, buildSystem, translateSegments, decodeText,
  sha256Hex, APP_VERSION, allowedWords, defaultSleep, abortError, countTerms, selectMatches } from "../../web/engine/core.js";
import { bounded } from "../../web/engine/qa.js";
import { compile } from "../../web/engine/pyre.js";
import { ApiError } from "./http.js";

export const MAX_HITS = 80; // the helper's glossary_hits limit (packs.py)
export const MAX_PACKS = 6; // matching.py MAX_PACKS
export const MAX_PHOTO_PACKS = 3; // packs named in a photo's text (classifyDocument photo)
// Speed (spec Amendment H): the segments of one batch are translated SEGMENT_POOL at a time (each with the core's own
// decisions, in segment order), and the model calls of one request start at least CALL_INTERVAL_MS apart, so a job
// with the page's 3 batches in flight makes at most 225 calls a minute (Workers AI text generation: 300 requests a
// minute per account) whatever the model's latency; SEGMENT_POOL stays under a Worker's 6 open connections.
export const SEGMENT_POOL = 5;
export const CALL_INTERVAL_MS = 800;
const MAX_CACHED_SETUPS = 256; // per isolate; the oldest goes first
const ID_RE = /^[a-z0-9_-]+$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

const misconfigured = (message) => new ApiError(500, "server_misconfigured", message);
const badRequest = (message) => new ApiError(400, "bad_request", message);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hasOnly = (obj, keys) => Object.keys(obj).every((k) => keys.includes(k)) && keys.every((k) => k in obj);
const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** The bundle as the core's pack source {manifest(), readText(id, version, file)}. */
export function bundleSource(bundle) {
  if (!isObject(bundle) || bundle.format !== 1 || !isObject(bundle.manifest) || !isObject(bundle.files)) {
    throw misconfigured("The pack bundle is missing or not in format 1 (tools/bundle_packs.py builds it).");
  }
  return {
    manifest: async () => bundle.manifest,
    readText: async (id, version, file) => {
      if (id === "_shared") return null; // registry packs carry their includes expanded
      const key = id === "_style" ? "_style/" + file : id + "@" + version + "/" + file;
      return own(bundle.files, key) && typeof bundle.files[key] === "string" ? decodeText(fromBase64(bundle.files[key]))
        : null;
    },
  };
}

const sets = new WeakMap(); // bundle -> Promise<pack set>

/** The parsed pack set of a bundle, built once per isolate (a failed build is tried again by the next request). */
export function packSetOf(bundle) {
  if (!sets.has(bundle)) {
    const built = buildPackSet(bundleSource(bundle));
    sets.set(bundle, built);
    built.catch(() => sets.delete(bundle));
  }
  return sets.get(bundle);
}

export function setupIdOf(setup) {
  return sha256Hex(JSON.stringify({ packs: setup.packs.map((p) => [p.id, p.version]), hits: setup.hits }));
}

/** The packs of a photo's short text by name: those whose detect keywords or id words ("pathology", "molecular
 * pathology") occur in it (the core's term counting: whole words, any case, plurals), most occurrences first, at most
 * MAX_PHOTO_PACKS; a pack whose child is among them is left to come as the child's parent. -> [pack ids] */
export function photoPacks(text, manifest) {
  const entries = (manifest && manifest.packs) || [];
  const found = [];
  for (const e of entries) {
    const counts = countTerms(text, [...(e.detect || []), String(e.id).split("-").join(" ")]);
    let n = 0;
    for (const c of counts.values()) n += c;
    if (n) found.push([e, n]);
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  const isAncestorOfFound = (id) => found.some(([e]) => {
    for (let p = e.parent, k = 0; p && k < 16; p = byId.has(p) ? byId.get(p).parent : null, k++) if (p === id) return true;
    return false;
  });
  return found.filter(([e]) => !isAncestorOfFound(e.id))
    .sort((a, b) => b[1] - a[1] || (a[0].id < b[0].id ? -1 : 1)).slice(0, MAX_PHOTO_PACKS).map(([e]) => e.id);
}

/** prepareTranslation over the whole document text: {event (the helper's classify event, each pack with its
 * version), setup (wire setup), setupId}. domainIds: pack ids the user chose ([] = automatic selection). photo (the
 * image tool, whose text is a few short lines): when the automatic selection finds no pack, the packs named in the
 * text (photoPacks) are used, with reason "detect"; the thresholds for files do not change. */
export async function classifyDocument(set, text, domainIds, { photo = false } = {}) {
  let domain = domainIds;
  let detected = [];
  if (photo && !domainIds.length && !selectMatches(text, set.manifest).length) {
    detected = photoPacks(text, set.manifest);
    domain = detected;
  }
  const s = await prepareTranslation(text, { packs: set, domain: domain.join(",") });
  const versions = new Map(s.packRows.map((r) => [r.id, r.version]));
  const reason = (p) => (p.reason === "user" && detected.includes(p.id) ? "detect" : p.reason);
  const event = { ...s.classify,
    packs: s.classify.packs.map((p) => ({ ...p, reason: reason(p), version: versions.get(p.id) ?? null })) };
  const setup = { packs: s.packRows.map((r) => ({ id: r.id, version: r.version })), hits: s.hits.map((h) => h[0]) };
  return { event, setup, setupId: await setupIdOf(setup) };
}

/** A wire pack list checked against the bundle: 400 when malformed, 409 packs_changed when an id or a version is
 * not the bundle's (the deployment changed during a job). */
export function checkPacks(set, packs) {
  if (!Array.isArray(packs) || packs.length > MAX_PACKS) {
    throw badRequest("setup.packs must be a list of at most " + MAX_PACKS + " {id, version}.");
  }
  const seen = new Set();
  const out = [];
  for (const p of packs) {
    if (!isObject(p) || !hasOnly(p, ["id", "version"]) || typeof p.id !== "string" || !ID_RE.test(p.id) ||
      typeof p.version !== "string" || !VERSION_RE.test(p.version) || seen.has(p.id)) {
      throw badRequest("setup.packs must hold distinct {id, version} entries.");
    }
    seen.add(p.id);
    const entry = set.manifest.packs.find((e) => e.id === p.id);
    if (!entry || entry.version !== p.version) {
      throw new ApiError(409, "packs_changed", "The service's glossary packs changed; start the translation again.");
    }
    out.push({ id: p.id, version: p.version });
  }
  return out;
}

const bases = new WeakMap(); // pack set -> Map(pack keys -> Promise<base>)

/** The pack part of a setup, fixed by the pack list (in merge order): style, merged pack, its glossary keys (first
 * row of each lower-case English key, as glossary_hits takes them), term fixes, TM scope, the words the
 * suspicious-word check accepts (allowedWords of the merged pack). */
export function baseFor(set, packs) {
  let m = bases.get(set);
  if (!m) bases.set(set, (m = new Map()));
  const key = packs.map((p) => p.id + "@" + p.version).join("+");
  if (!m.has(key)) {
    const built = (async () => {
      const style = await loadStyle(set);
      const matches = packs.map((p) => new Match(set.manifest.packs.find((e) => e.id === p.id), 0, [], 0, 0, "user"));
      const [pack, , missing, packKey] = await loadPacks(matches, set);
      if (missing.length) throw misconfigured("A glossary pack of the bundle could not be loaded.");
      const rows = new Map();
      const seen = new Set();
      for (const [en, vi] of pack.glossary) {
        if (seen.has(en.toLowerCase())) continue;
        seen.add(en.toLowerCase());
        rows.set(en, vi);
      }
      return { style, pack, rows, scope: packKey + "+" + style.key() + "+" + APP_VERSION,
        fixes: pack.termFixes.map((f) => ({ en: f.en, vi: f.vi, wrong: [...f.wrong] })), allowed: allowedWords(pack) };
    })();
    m.set(key, built);
    built.catch(() => m.delete(key));
  }
  return m.get(key);
}

/** The wire setup of a /translate request, checked: {packs, hits} only; packs as checkPacks; hits = at most
 * MAX_HITS distinct glossary English keys of those packs; setupId, when given, must be the setup's. */
export async function checkSetup(set, setup, setupId = undefined) {
  if (!isObject(setup) || !hasOnly(setup, ["packs", "hits"])) {
    throw badRequest("setup must be {packs, hits} as /api/v1/classify returned it.");
  }
  const packs = checkPacks(set, setup.packs);
  const hits = setup.hits;
  if (!Array.isArray(hits) || hits.length > MAX_HITS || !hits.every((h) => typeof h === "string" && h)) {
    throw badRequest("setup.hits must be a list of at most " + MAX_HITS + " glossary terms.");
  }
  const lower = new Set(hits.map((h) => h.toLowerCase()));
  if (lower.size !== hits.length) throw badRequest("setup.hits lists a term twice.");
  const base = await baseFor(set, packs);
  if (!hits.every((h) => base.rows.has(h))) throw badRequest("setup.hits has a term that is not in the packs' glossary.");
  const clean = { packs, hits: [...hits] };
  if (setupId !== undefined && (typeof setupId !== "string" || setupId !== await setupIdOf(clean))) {
    throw badRequest("setup_id does not match the setup.");
  }
  return clean;
}

const setups = new WeakMap(); // pack set -> Map(setup_id -> Promise<setup>)

/** The core setup {setupId, system, scope, fixes, hits, allowed} of a checked wire setup, cached per isolate by
 * setup_id. */
export async function setupFor(set, setup) {
  const id = await setupIdOf(setup);
  let m = setups.get(set);
  if (!m) setups.set(set, (m = new Map()));
  if (!m.has(id)) {
    if (m.size >= MAX_CACHED_SETUPS) m.delete(m.keys().next().value);
    const built = (async () => {
      const base = await baseFor(set, setup.packs);
      const hits = setup.hits.map((en) => [en, base.rows.get(en)]);
      return { setupId: id, system: buildSystem(base.style.prompt, base.pack, hits), scope: base.scope,
        fixes: base.fixes, hits, allowed: base.allowed };
    })();
    m.set(id, built);
    built.catch(() => m.delete(id));
  }
  return m.get(id);
}

/** [start, end] spans (UTF-16 indices) of an English term in a lower-case text, found as the core finds glossary
 * terms (glossaryHits). */
export function termSpans(term, lowerText) {
  const out = [];
  for (const m of compile(bounded(term)).finditer(lowerText)) out.push([m.start(), m.end()]);
  return out;
}

const SEP = "|"; // no glossary pattern matches it or across it: one term per line of the joined text

/** For each term: is it a glossary key of these packs (checkPacks output, merge order) as the matcher reads keys --
 * a key's pattern covers the whole term ("Biopsies" and "biopsy", "tumor" and "tumour")? One pass per key over the
 * joined terms, as glossaryHits makes over a document. -> [boolean] */
export async function packKeyFlags(set, packs, terms) {
  const flags = terms.map(() => false);
  if (!terms.length) return flags;
  const base = await baseFor(set, packs);
  const lines = terms.map((t) => t.toLowerCase().split(SEP).join(" ").trim());
  const ends = new Map(); // start of a line -> [its end, its index]
  let at = 0;
  lines.forEach((line, i) => {
    ends.set(at, [at + line.length, i]);
    at += line.length + SEP.length;
  });
  const text = lines.join(SEP);
  for (const key of base.rows.keys()) {
    for (const m of compile(bounded(key)).finditer(text)) {
      const line = ends.get(m.start());
      if (line && line[0] === m.end()) flags[line[1]] = true;
    }
  }
  return flags;
}

/** The model with its calls started at least intervalMs apart (in the order they are asked for). */
function paced(model, intervalMs, now, wait) {
  let nextAt = -Infinity;
  return async (messages, opts = {}) => {
    const t = now();
    const at = Math.max(t, nextAt);
    nextAt = at + intervalMs;
    if (at > t) await wait(at - t, opts.signal || null);
    return model(messages, opts);
  };
}

/** One batch through the core with the document's setup (no translation memory on the server: nothing is kept).
 * The segments go SEGMENT_POOL at a time, each through the core's translateSegments on its own (the same decisions
 * and calls as one after another); the results come back in segment order. A segment that fails stops the segments
 * after it (none is started any more, the ones in flight are aborted) and the batch fails with the error of the first
 * segment that failed in document order, as one after another would. sleep (seconds, signal): the core's retry wait,
 * also the pacing's unless wait (ms, signal) is given; now: the pacing's clock (tests). */
export async function translate(set, setup, segments, { model, modelKey, signal = null, sleep = undefined,
  pool = SEGMENT_POOL, intervalMs = CALL_INTERVAL_MS, now = () => Date.now(), wait = undefined } = {}) {
  const s = await setupFor(set, setup);
  const call = paced(model, intervalMs, now, wait || ((ms, sig) => (sleep || defaultSleep)(ms / 1000, sig)));
  const results = new Array(segments.length);
  const stops = new Map(); // index in flight -> its AbortController
  let failedAt = segments.length; // the first failing index so far
  let failure = null;
  let next = 0;
  const onAbort = () => stops.forEach((c) => c.abort());
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  const lane = async () => {
    while (next < failedAt && !(signal && signal.aborted)) {
      const k = next++;
      const stop = new AbortController();
      stops.set(k, stop);
      try {
        [results[k]] = await translateSegments([segments[k]], { model: call, modelKey, setup: s, tm: null,
          signal: stop.signal, ...(sleep ? { sleep } : {}) });
      } catch (err) {
        if (!stop.signal.aborted && k < failedAt) { // a real failure, before any so far: the segments after it stop
          failedAt = k;
          failure = err;
          for (const [j, c] of stops) if (j > k) c.abort();
        }
      } finally {
        stops.delete(k);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(Math.max(1, pool), segments.length) }, lane));
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  if (signal && signal.aborted) throw abortError();
  if (failure) throw failure;
  return results;
}
