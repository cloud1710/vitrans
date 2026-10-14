// The translation API's side of the shared translation core (web/engine/core.js -- the one module graph the page and
// the Functions run; this file is the only place that imports it).
// - Packs: the deploy-time bundle of tools/bundle_packs.py ({format: 1, manifest, files: {"<id>@<version>/<file>" or
//   "_style/<file>": base64 of the registry's file bytes}}) is a pack source; file bytes are decoded with the core's
//   decodeText (strict UTF-8, BOM kept) and parsed once per isolate into a pack set (buildPackSet).
// - Helper parity: /classify runs prepareTranslation over the WHOLE document text (what the client's translateFile
//   passes to its injected prepare) and returns the wire setup {packs: [{id, version}] in merge order, hits: [glossary
//   English keys in the helper's order]} with setup_id = sha256 of it. /translate sends that setup back with every
//   batch; setupFor rebuilds the helper's system prompt from it (buildSystem(style prompt, merged pack, hits)), so all
//   batches of a document get the same prompt the helper would use (and share a cacheable prefix).
import { buildPackSet, prepareTranslation, loadStyle, loadPacks, Match, buildSystem, translateSegments, decodeText,
  sha256Hex, APP_VERSION } from "../../web/engine/core.js";
import { ApiError } from "./http.js";

export const MAX_HITS = 80; // the helper's glossary_hits limit (packs.py)
export const MAX_PACKS = 6; // matching.py MAX_PACKS
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

/** prepareTranslation over the whole document text: {event (the helper's classify event, each pack with its
 * version), setup (wire setup), setupId}. domainIds: pack ids the user chose ([] = automatic selection). */
export async function classifyDocument(set, text, domainIds) {
  const s = await prepareTranslation(text, { packs: set, domain: domainIds.join(",") });
  const versions = new Map(s.packRows.map((r) => [r.id, r.version]));
  const event = { ...s.classify, packs: s.classify.packs.map((p) => ({ ...p, version: versions.get(p.id) ?? null })) };
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
 * row of each lower-case English key, as glossary_hits takes them), term fixes, TM scope. */
function baseFor(set, packs) {
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
        fixes: pack.termFixes.map((f) => ({ en: f.en, vi: f.vi, wrong: [...f.wrong] })) };
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

/** The core setup {setupId, system, scope, fixes, hits} of a checked wire setup, cached per isolate by setup_id. */
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
        fixes: base.fixes, hits };
    })();
    m.set(id, built);
    built.catch(() => m.delete(id));
  }
  return m.get(id);
}

/** One batch through the core with the document's setup (no translation memory on the server: nothing is kept). */
export async function translate(set, setup, segments, { model, modelKey, signal = null, sleep = undefined } = {}) {
  const s = await setupFor(set, setup);
  return translateSegments(segments, { model, modelKey, setup: s, tm: null, signal, ...(sleep ? { sleep } : {}) });
}
