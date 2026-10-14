// The translation core: one engine for every runtime -- the page (browser), the Cloudflare Pages Function
// (workerd) and the Node tests. ES modules only; it relies on TextEncoder / TextDecoder, crypto.subtle and timers,
// never on the DOM, IndexedDB or Node built-ins (tests/bare.test.mjs runs it in a bare realm). The OOXML layer
// (ooxml/*, fit.js, pipeline.js translateFile) is the client job path built on top of it.
//
// A job in three calls (each a port of a step of helper/vitranslate/pipeline.py run_job):
//   setup = await prepareTranslation(fullText, {packs, domain})   // pack choice + glossary hits + system prompt
//   setup.classify                                                 // the helper's "classify" progress event
//   results = await translateSegments(segments, {model, modelKey, setup, tm, signal})
// segments: [{id, tagged, essential: [span ids kept at level 3], prev, nxt, where}] (prev / nxt: the neighbouring
// segments' plain text, "" for none; where: a location for messages); results: [{id, text, level, flags, cached,
// reduced, spans}] -- the helper's Translator decisions (reduced: the text belongs to the segment without its
// non-essential spans, as at levels 3-5; spans: the span ids of that segment).
// packs: a pack source {manifest() -> registry manifest, readText(packId, version, file) -> text | null,
// lastSource?(packId)} (the style pack is readText("_style", null, file)), or an already parsed pack set
// {manifest, style, packs: {id: pack data}} (packToData / packFromData: JSON-safe pack data, e.g. bundled at deploy).
import { Translator, TaggedSegment, buildSystem, ModelError, abortError } from "./translate.js";
import { scorePacks, selectPacks as selectMatches, families } from "./matching.js";
import { compile } from "./pyre.js";
import { loadPack, mergePacks, glossaryHits, EMPTY_PACK, Pack, TermFix, PackError } from "./packs.js";
import { pyStrip, pySplit, pyRoundN } from "./py.js";

export { Translator, TaggedSegment, isEssential, buildSystem, buildUser, ModelError, abortError, Outcome, CHECK_KINDS,
  TRANSLATOR_VERSION, SPAN_PROMPT } from "./translate.js";
export { MemoryTM, tmKey, sha256Hex } from "./tm.js";
export { buildReport, reviewLevel, INFO_KINDS, WARNING_KINDS } from "./report.js";
export { scorePacks, families, countTerms, Match, THRESHOLD, MIN_TERMS, MIN_DETECT, MAX_FAMILIES,
  MAX_PACKS } from "./matching.js";
export { selectMatches };
export { loadPack, mergePacks, glossaryHits, readGlossary, decodeText, EMPTY_PACK, Pack, TermFix,
  PackError } from "./packs.js";

export const APP_VERSION = "0.1.0"; // the helper's config.VERSION: part of the TM scope
export const RETRY_DELAY = 3; // seconds before the one retry of a segment whose model call failed

const isAbortError = (err) => Boolean(err) && (err.name === "AbortError" || err.code === "aborted");

// ---------------------------------------------------------------- pack data

/** A pack as JSON-safe data (bundled pack sets, transport). */
export function packToData(pack) {
  return { id: pack.id, version: pack.version, name: pack.name, detect: [...pack.detect], prompt: pack.prompt,
    glossary: pack.glossary.map((r) => [...r]), term_fixes: pack.termFixes.map((f) => ({ en: f.en, vi: f.vi,
      wrong: [...f.wrong] })), tests: pack.tests, merged_key: pack.mergedKey || "" };
}

/** A Pack from packToData output (a Pack is returned as it is); every "wrong" pattern must compile. */
export function packFromData(data) {
  if (data instanceof Pack) return data;
  const fixes = (data.term_fixes || data.termFixes || []).map((f) => (Array.isArray(f)
    ? new TermFix(f[0], f[1], [...(f[2] || [])]) : new TermFix(f.en, f.vi, [...(f.wrong || [])])));
  for (const fx of fixes) {
    for (const pat of fx.wrong) {
      try {
        compile(pat);
      } catch (err) {
        throw new PackError("pack " + data.id + ": invalid wrong pattern for " + fx.en + ": " + err.message);
      }
    }
  }
  return new Pack(data.id, data.version, "name" in data ? data.name : data.id, data.detect || [], data.prompt || "",
    (data.glossary || []).map((r) => [r[0], r[1], r[2] === undefined ? "" : r[2]]), fixes, data.tests || [],
    data.merged_key || data.mergedKey || "");
}

const isSource = (packs) => Boolean(packs) && typeof packs.readText === "function";

/** A parsed pack set from a pack source: {manifest, style, packs: {id: pack data}} (JSON-safe; e.g. built at
 * deploy time and bundled with a Cloudflare Function). Every manifest pack is read; one that cannot be read is
 * left out (a job then reports it unavailable, as with the source). */
export async function buildPackSet(source) {
  const manifest = await source.manifest();
  const set = { manifest, style: packToData(await loadStyle(source)), packs: {} };
  for (const entry of (manifest && manifest.packs) || []) {
    try {
      set.packs[entry.id] = packToData(await loadPack(...readerFor(source, entry.id, entry.version)));
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }
  return set;
}

function readerFor(packs, id, version) {
  return [(f) => packs.readText(id, version, f), (f) => packs.readText("_shared", null, f)];
}

/** The style pack (_style) of a pack source or set. */
export async function loadStyle(packs) {
  if (isSource(packs)) return loadPack(...readerFor(packs, "_style", null));
  if (packs && packs.style) return packFromData(packs.style);
  throw new PackError("the pack set has no _style pack");
}

async function packOf(packs, entry) {
  if (isSource(packs)) return loadPack(...readerFor(packs, entry.id, entry.version));
  const set = packs && packs.packs;
  if (!set || !Object.prototype.hasOwnProperty.call(set, entry.id)) throw new PackError("pack " + entry.id + " is not in the pack set");
  return packFromData(set[entry.id]);
}

// ---------------------------------------------------------------- pack choice (pipeline.py)

/** [matches in merge order, unknown ids]. domain = comma-separated pack ids chosen by the user (reason "user", no
 * family / pack cap), else cosine selection; either way a chosen pack brings its parent along. */
export function choosePacks(text, domain, manifest) {
  if (!domain) return [selectMatches(text, manifest), []];
  const wanted = [...new Set(domain.split(",").map((d) => pyStrip(d)).filter((d) => d))];
  const scored = scorePacks(text, manifest);
  const byId = new Map(scored.map((m) => [m.entry.id, m]));
  const chosen = wanted.filter((d) => byId.has(d)).map((d) => byId.get(d).with("user"));
  return [families(chosen, scored), wanted.filter((d) => !byId.has(d))];
}

/** The n best-scoring packs that were not selected (cosine score shown next to the selected ones). */
export function topCandidates(text, manifest, chosen, n = 3) {
  return scorePacks(text, manifest).filter((m) => !chosen.has(m.entry.id)).slice(0, n)
    .map((m) => ({ id: m.entry.id, name: m.entry.name || m.entry.id, score: pyRoundN(m.score, 3) }));
}

/** Matched terms (normalised lower case) as the pack writes them: glossary English, else the detect keyword. */
function asWritten(matched, pack) {
  const written = new Map();
  for (const w of pack.detect) written.set(pySplit(w.toLowerCase()).join(" "), w);
  for (const [en] of pack.glossary) written.set(pySplit(en.toLowerCase()).join(" "), en);
  return matched.map((t) => (written.has(t) ? written.get(t) : t));
}

/** Load the chosen packs: [merged pack or EMPTY_PACK, report rows, entries that could not be had, TM pack key]. */
export async function loadPacks(matches, packs) {
  const loaded = [];
  const rows = [];
  const missing = [];
  const keys = [];
  for (const m of matches) {
    const e = m.entry;
    let pk;
    try {
      pk = await packOf(packs, e);
    } catch (err) {
      if (isAbortError(err)) throw err;
      missing.push(e); // unavailable or unreadable: the job goes on without it
      continue;
    }
    loaded.push(pk);
    keys.push(pk.key() + "#" + String(e.sha256).slice(0, 8));
    rows.push({ id: e.id, name: "name" in e ? e.name : e.id, version: "version" in e ? e.version : null,
      score: pyRoundN(m.score, 3), matched: asWritten(m.matched, pk), reason: m.reason,
      source: packs && typeof packs.lastSource === "function" ? (packs.lastSource(e.id) ?? null) : null });
  }
  const pack = mergePacks(loaded) || EMPTY_PACK;
  return [pack, rows, missing, keys.join("+") || pack.key()];
}

async function manifestOf(packs, manifest) {
  if (manifest === undefined) {
    try {
      manifest = isSource(packs) ? await packs.manifest() : (packs ? packs.manifest : null);
    } catch (err) {
      if (isAbortError(err)) throw err;
      manifest = null; // the registry cannot be reached: offline, no domain pack
    }
  }
  if (Array.isArray(manifest)) manifest = { packs: manifest, idf: {} };
  return manifest ? [manifest, false] : [{ packs: [], idf: {} }, true];
}

/** Pack choice for a document text: {classify (the helper's "classify" event), pack (merged Pack), packRows,
 * unavailable / unavailableNames, packKey, offline, manifest, matches}. manifest: given, else the source's / set's. */
export async function classifyText(text, { packs = null, manifest = undefined, domain = "", offline = undefined } = {}) {
  const [man, off] = await manifestOf(packs, manifest);
  const isOffline = offline === undefined ? off : offline;
  const [matches, unknown] = choosePacks(text, domain, man);
  const [pack, packRows, missing, packKey] = await loadPacks(matches, packs);
  const unavailable = unknown.concat(missing.map((e) => e.id));
  const unavailableNames = unknown.concat(missing.map((e) => e.name || e.id));
  const classify = { stage: "classify", offline: isOffline, unavailable: unavailableNames,
    packs: packRows.map((r) => ({ id: r.id, name: r.name, score: r.score, matched: r.matched, reason: r.reason })),
    candidates: topCandidates(text, man, new Set(matches.map((m) => m.entry.id))) };
  return { classify, pack, packRows, unavailable, unavailableNames, packKey, offline: isOffline, manifest: man, matches };
}

/** The helper's "classify" event for a text: {stage, offline, unavailable, packs: [{id, name, score, matched,
 * reason}], candidates} (cosine + detect gate + family rule; packs are read for the matched terms as written). */
export async function selectPacks(text, manifest, { packs = null, domain = "", offline = undefined } = {}) {
  return (await classifyText(text, { packs, manifest, domain, offline })).classify;
}

/** Everything a job needs before translating, as JSON-safe data: {classify, pack: {id, name, key}, packRows,
 * unavailable, unavailableNames, offline, packKey, styleKey, scope (the TM pack scope), system (prompt), hits,
 * fixes}. text = the document's segments' plain text joined by "\n" (glossary hits come from the whole text). */
export async function prepareTranslation(text, { packs, manifest = undefined, domain = "", offline = undefined,
  appVersion = APP_VERSION } = {}) {
  const style = await loadStyle(packs);
  const c = await classifyText(text, { packs, manifest, domain, offline });
  const hits = glossaryHits(text, c.pack.glossary);
  return { classify: c.classify, pack: { id: c.pack.id, name: c.pack.name, key: c.pack.key() }, packRows: c.packRows,
    unavailable: c.unavailable, unavailableNames: c.unavailableNames, offline: c.offline, packKey: c.packKey,
    styleKey: style.key(), scope: c.packKey + "+" + style.key() + "+" + appVersion,
    system: buildSystem(style.prompt, c.pack, hits), hits,
    fixes: c.pack.termFixes.map((f) => ({ en: f.en, vi: f.vi, wrong: [...f.wrong] })) };
}

// ---------------------------------------------------------------- translation

/** Wait `seconds`; an abort ends the wait with an AbortError. The abort listener is removed after a normal wake-up
 * (a long job retries many times on one signal). */
export function defaultSleep(seconds, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, seconds * 1000);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** One retry after retryDelay seconds when the model call fails; a second failure throws ModelError. */
async function translateOne(translator, seg, s, retryDelay, sleep, signal) {
  try {
    return await translator.translate(seg, s.prev || "", s.nxt || "");
  } catch (err) {
    if (!(err instanceof ModelError)) throw err;
    await sleep(retryDelay, signal);
  }
  try {
    return await translator.translate(seg, s.prev || "", s.nxt || "");
  } catch (err) {
    if (err instanceof ModelError) {
      throw new ModelError("The model failed twice while translating " + (s.where || s.id) + ": " + err.message, err);
    }
    throw err;
  }
}

/** Translate segments in order with the helper's Translator decisions (see the module notes). model: async
 * (messages, {temperature, maxTokens, think: false, signal}) -> text; modelKey: the model's name in TM keys; setup:
 * prepareTranslation's result (system, scope, fixes, hits are used); tm: {get, put} or null; onSegment(result,
 * index) after each segment; retryDelay / sleep: the retry of a failed model call. */
export async function translateSegments(segments, { model, setup, modelKey = "", tm = null, signal = null,
  onSegment = null, retryDelay = RETRY_DELAY, sleep = defaultSleep } = {}) {
  const translator = new Translator({ model, system: setup.system, modelKey, packKey: setup.scope,
    fixes: setup.fixes || [], hits: setup.hits || [], tm, signal });
  const out = [];
  for (const s of segments) {
    if (signal && signal.aborted) throw abortError();
    const seg = s instanceof TaggedSegment ? s : new TaggedSegment(s.tagged, s.essential || []);
    const res = await translateOne(translator, seg, s, retryDelay, sleep, signal);
    const r = { id: s.id, text: res.text, level: res.level, flags: res.flags, cached: res.cached,
      reduced: res.segment !== seg, spans: [...res.segment.spans.keys()] };
    out.push(r);
    if (onSegment) await onSegment(r, out.length - 1);
  }
  return out;
}
