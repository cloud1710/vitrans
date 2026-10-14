// One translation job on the client (port of helper/vitranslate/pipeline.py run_job, without fonts.py, the
// python-docx / python-pptx re-open check and the read-back pass): package -> items -> packs -> translate ->
// apply -> PPTX fit -> write -> report. The progress events and the report have the helper's shape, so the page
// renders every engine with the same code. Browser only (DOMParser); the translation itself is the core's
// (core.js), local or remote.
//
// translateFile(bytes, name, options) -> {bytes, name: "<stem>_vi.<ext>", report}
//   translateSegments  async (segments, {setup, tm, signal}) -> results: core.translateSegments' contract. Default:
//              the local core with `model` / `modelId` (and `tm`, `sleep`); a remote engine passes a function that
//              posts the batch (e.g. to /api/v1/translate) and returns the results.
//   prepare    async (fullText, {domain, signal}) -> setup: core.prepareTranslation's result (only setup.classify,
//              pack, packRows, unavailable, unavailableNames, offline are read here; translateSegments gets the
//              whole setup). Default: the local core with `packs`.
//   batchSize  segments per translateSegments call (default 1: one progress event and one abort check per
//              segment; a remote engine uses <= 20)
//   model      async (messages, {temperature, maxTokens, think: false, signal}) -> text (local default only)
//   modelId    model name: the "device" event, the report and (local) the TM keys
//   device     {kind, name} for the "device" event
//   packs      pack source or parsed pack set (core.js; local default only)
//   domain     comma-separated pack ids chosen by the user ("" = automatic selection)
//   tm         {get, put} (tm.js MemoryTM / IndexedDbTM) or null, handed to translateSegments
//   onProgress (event) => void; events: {stage: "extract"}, {stage: "extract", segments, words, skipped},
//              {stage: "classify", offline, unavailable, packs, candidates}, {stage: "device", device,
//              device_name, model, polish: false[, estimate]}, {stage: "translate", done, total, where[, eta_s]},
//              {stage: "write"}, {stage: "done", flagged}
//   signal     AbortSignal: the job stops between batches (and before model calls) with an AbortError
//   notes / comments (PPTX speaker notes / DOCX comments, as the helper's Options), fast (report flag),
//   appVersion (part of the TM scope), estimator, sleep, now, yieldFn (tests)
// Errors carry .code: "unsupported_file" (UnsupportedFile), "model_failed" (ModelError, after one retry),
// "output_invalid" (JobError with .report: the written file does not read back), "aborted" (AbortError).
import { OoxmlPackage, UnsupportedFile } from "./ooxml/package.js";
import { collectParts } from "./ooxml/document.js";
import { apply } from "./ooxml/codec.js";
import { isEssentialSpan, essentialIds } from "./ooxml/essential.js";
import { fitPptx } from "./fit.js";
import { stripTags } from "./tags.js";
import { compile } from "./pyre.js";
import { abortError } from "./translate.js";
import { prepareTranslation, translateSegments as coreTranslateSegments, APP_VERSION } from "./core.js";
import { buildReport } from "./report.js";
import { pySplit, pyRoundN, cpLen } from "./py.js";

export { choosePacks, topCandidates, loadPacks, APP_VERSION, RETRY_DELAY } from "./core.js";

/** The job ran but its output cannot be delivered; .report is the report of what was done. */
export class JobError extends Error {
  constructor(message, report = {}) {
    super(message);
    this.name = "JobError";
    this.code = "output_invalid";
    this.report = report;
  }
}

const X_RE = compile(String.raw`<x\d+/>`);

function head(s, n) {
  return cpLen(s) <= n ? s : Array.from(s).slice(0, n).join("");
}

/** Report text: a placeholder shows as a space, tags are dropped, spaces collapsed, at most 300 characters. */
export function shown(tagged) {
  return head(pySplit(stripTags(X_RE.sub(" ", tagged))).join(" "), 300);
}

/** Path(name).suffix of the helper. */
export function suffixOf(name) {
  const base = name.split(/[\\/]/).pop();
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i) : "";
}

export function outputName(name) {
  const base = name.split(/[\\/]/).pop();
  const suffix = suffixOf(base);
  return base.slice(0, base.length - suffix.length) + "_vi" + suffix;
}

/** A turn of the event loop for the page (the engine runs on the main thread: DOMParser is not in workers). */
export function yieldToPage() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function checkAbort(signal) {
  if (signal && signal.aborted) throw abortError();
}

/** The written package must read back: zip, entries and every changed part (the helper re-opens its output with
 * python-docx / python-pptx; this is the structural part of that check). */
function verifyOutput(bytes, parts) {
  const pkg = new OoxmlPackage(bytes);
  for (const part of parts) pkg.root(part);
}

const seconds = (t1, t0) => pyRoundN((t1 - t0) / 1000, 1);

export async function translateFile(bytes, name, { translateSegments = null, prepare = null, batchSize = 1, model,
  modelId, device = { kind: "gpu", name: "" }, packs, domain = "", tm = null, onProgress = () => {}, signal = null,
  notes = true, comments = false, fast = false, appVersion = APP_VERSION, estimator = null, sleep = undefined,
  now = () => Date.now(), yieldFn = yieldToPage } = {}) {
  const prepareFn = prepare || ((text, opts) => prepareTranslation(text, { packs, domain: opts.domain, appVersion }));
  const translateFn = translateSegments || ((segments, opts) => coreTranslateSegments(segments, { model,
    modelKey: modelId, setup: opts.setup, tm: opts.tm, signal: opts.signal, ...(sleep ? { sleep } : {}) }));
  const progress = (event) => onProgress(event);
  const started = now();
  progress({ stage: "extract" });
  const pkg = new OoxmlPackage(bytes);
  const suffix = suffixOf(name);
  if ("." + pkg.kind !== suffix.toLowerCase()) {
    throw new UnsupportedFile("the file extension " + (suffix || "(none)") + " does not match its content (a " +
      pkg.kind.toUpperCase() + " package)");
  }
  const items = [];
  for (const partItems of collectParts(pkg, { notes, comments })) {
    items.push(...partItems);
    await yieldFn();
    checkAbort(signal);
  }
  const work = items.filter((i) => i.segment);
  const skipped = items.filter((i) => !i.segment).map((i) => ({ where: i.location, reason: i.skip, text: head(i.text, 200) }));
  const fullText = work.map((i) => i.segment.plain).join("\n");
  const words = work.map((i) => pySplit(i.segment.plain).length);
  progress({ stage: "extract", segments: work.length, words: words.reduce((a, b) => a + b, 0), skipped: skipped.length });

  const setup = await prepareFn(fullText, { domain, signal });
  checkAbort(signal);
  progress(setup.classify);

  const estimate = estimator ? estimator(device, modelId, words, false) : null;
  const deviceEvent = { stage: "device", device: device.kind, device_name: device.name, model: modelId, polish: false };
  if (estimate) deviceEvent.estimate = estimate.summary();
  progress(deviceEvent);
  const tTranslate = now();
  const segments = work.map((item, n) => ({ id: n, tagged: item.segment.tagged, essential: essentialIds(item.segment),
    prev: n > 0 ? work[n - 1].segment.plain : "", nxt: n + 1 < work.length ? work[n + 1].segment.plain : "",
    where: item.location }));
  const rows = [];
  const pairs = [];
  const size = Math.max(1, Math.floor(batchSize) || 1);
  for (let start = 0; start < segments.length; start += size) {
    checkAbort(signal);
    const batch = segments.slice(start, start + size);
    const results = await translateFn(batch, { setup, tm, signal });
    if (!Array.isArray(results) || results.length !== batch.length) {
      throw new Error("translateSegments returned " + (Array.isArray(results) ? results.length : typeof results) +
        " results for " + batch.length + " segments");
    }
    for (const [k, r] of results.entries()) {
      const n = start + k;
      const item = work[n];
      if (r.id !== batch[k].id) throw new Error("translateSegments answered segment " + r.id + " for " + batch[k].id);
      const segment = r.reduced ? item.segment.reduced(isEssentialSpan) : item.segment;
      const outcome = { text: r.text, segment, level: r.level, flags: r.flags, cached: r.cached };
      pairs.push([item, outcome]);
      const flags = [...outcome.flags];
      if (item.segment.locked.length) flags.push("locked_text:" + item.segment.locked.map((t) => head(t, 60)).join(" | "));
      rows.push({ where: item.location, src: shown(item.segment.tagged), out: shown(outcome.text), level: outcome.level,
        flags, cached: outcome.cached });
      const event = { stage: "translate", done: n + 1, total: work.length, where: item.location };
      if (estimate) event.eta_s = Math.round(estimate.remainingTranslate(n + 1, (now() - tTranslate) / 1000));
      progress(event);
    }
    await yieldFn();
  }
  checkAbort(signal);
  const tPolish = now();
  const tWrite = now();

  progress({ stage: "write" });
  let lastPart = null;
  for (let k = 0; k < pairs.length; k++) {
    const [item, outcome] = pairs[k];
    if (lastPart !== null && item.part !== lastPart) await yieldFn();
    lastPart = item.part;
    const fixes = apply(item.element, outcome.segment, outcome.text); // placeholder fixes made while writing
    if (fixes.length) rows[k].flags = rows[k].flags.concat(fixes.map((f) => "apply:" + f));
    pkg.markDirty(item.part);
  }
  const fitChanges = pkg.kind === "pptx" ? fitPptx(pairs.filter(([i]) => i.part.includes("/slides/"))) : [];
  const fontChanges = []; // fonts.py is not part of the browser engine
  const out = pkg.save();
  const outName = outputName(name);
  const meta = { file: name.split(/[\\/]/).pop(), output: outName, kind: pkg.kind, domain: setup.pack.id,
    domain_name: setup.pack.name, pack: setup.pack.key, packs: setup.packRows, packs_unavailable: setup.unavailable,
    packs_unavailable_names: setup.unavailableNames, registry_offline: setup.offline, device: device.kind,
    device_name: device.name, model: modelId, fast, polish: { enabled: false },
    seconds: { prepare: seconds(tTranslate, started), translate: seconds(tPolish, tTranslate),
      polish: seconds(tWrite, tPolish), write: seconds(now(), tWrite) } };
  const report = buildReport(meta, rows, skipped, fitChanges, fontChanges);
  try {
    verifyOutput(out, [...pkg.dirty]);
  } catch (err) {
    throw new JobError("the translated file could not be opened again (" + ((err && err.name) || "Error") +
      "); no output was kept", report);
  }
  progress({ stage: "done", flagged: report.counts.flagged });
  return { bytes: out, name: outName, report };
}
