// LiteRT-LM runtime shared by the page (browser engine) and /lab/: Gemma 4 E2B / E4B web builds through Google's
// LiteRT-LM JavaScript API on WebGPU, the model file kept in Cache Storage, and the engine contract's model function
//   model(messages, { temperature, maxTokens, think, signal }) -> Promise<string>
// (thinking off, greedy at temperature 0, an answer cut at maxTokens comes back "" as the helper's Ollama client does).
// Talks to cdn.jsdelivr.net (library + wasm) and huggingface.co, which redirects the model file to a *.hf.co CDN host.
//
// Pinned: @litert-lm/core 0.17.1 (2026-09-16; jsDelivr's +esm bundle pins its one dependency, @litertjs/wasm-utils
// 2.5.3 of 2026-07-17). 0.18.0 (2026-10-06) carries a Safari fix (LiteRT-LM PR 3750, "Fix Safari crash by splitting
// JSPI and Asyncify builds") but is not two weeks old yet (version-age rule: usable from 2026-10-20).
export const LITERT_VERSION = "0.17.1";
export const LITERT_URL = "https://cdn.jsdelivr.net/npm/@litert-lm/core@" + LITERT_VERSION + "/+esm";
export const LITERT_WASM_BASE = "https://cdn.jsdelivr.net/npm/@litert-lm/core@" + LITERT_VERSION + "/wasm/";
export const LITERT_CACHE = "vt-lab-litert";  // Cache Storage name of the .litertlm files (the lab's: shared)
export const CTX_TOKENS = 8192;               // prompt + answer of one call (the helper's num_ctx)
export const STALL_MS = 240000;               // no load progress for this long: report instead of hanging

const MB = 1024 * 1024;

// LiteRT-LM "-web" builds (2/4/8-bit QAT weights, text only) that Google's web chat demo loads; Apache-2.0.
// bytes = the file on Hugging Face at the pinned commit. Measured in Chrome 155 on the PC (RTX 5080), 2026-10-14:
// memMB = GPU memory after loading (E2B: buffers 186 MB + textures 819 MB, NVIDIA dedicated +1.19 GB), largestMB =
// biggest single GPU allocation (E2B: a 96 MB buffer; textures <= 32 MB, so no 1 GiB binding is needed), heapMB =
// the wasm heap LiteRT-LM grows to (E2B: 1346 MB; likely the per-layer embeddings, which native builds memory-map).
// E4B: buffers 347 MB (largest 160 MB) + textures 2104 MB, wasm heap 889 MB. id = the model name in reports and in
// the translation-memory key (a different build from Ollama's gemma4:e2b / e4b).
export const LITERT_MODELS = [
  { key: "litert-e2b", runtime: "litert", name: "Gemma 4 E2B (LiteRT-LM)", label: "Gemma 4 E2B", id: "gemma4:e2b-web",
    repo: "litert-community/gemma-4-E2B-it-litert-lm", rev: "b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1",
    file: "gemma-4-E2B-it-web.litertlm", bytes: 2008432640, downloadGB: 2.01, memMB: 1200, largestMB: 96, heapMB: 1350 },
  { key: "litert-e4b", runtime: "litert", name: "Gemma 4 E4B (LiteRT-LM)", label: "Gemma 4 E4B", id: "gemma4:e4b-web",
    repo: "litert-community/gemma-4-E4B-it-litert-lm", rev: "2eee7ac325f20eb8c9ac1d0e972f7c84663062da",
    file: "gemma-4-E4B-it-web.litertlm", bytes: 2969059328, downloadGB: 2.97, memMB: 2500, largestMB: 160, heapMB: 900 },
];

export function litertModel(key) {
  return LITERT_MODELS.find((m) => m.key === key) || null;
}

export function litertModelUrl(model) {
  return "https://huggingface.co/" + model.repo + "/resolve/" + model.rev + "/" + model.file;
}

/** A load or run failure of the runtime: code = unknown_model | runtime_load_failed | model_download_failed |
 * runtime_stalled. */
export class RuntimeError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

const errText = (e) => String(e && e.message ? e.message : e);

function abortError(signal) {
  const r = signal && signal.reason;
  return r && r.name === "AbortError" ? r : new DOMException("The operation was aborted.", "AbortError");
}

export function round(x, n) {
  const f = Math.pow(10, n || 0);
  return Math.round(x * f) / f;
}

// The library's own pick (dist/load.js): relaxed SIMD and JSPI choose among four builds; Safari and Firefox have no
// JSPI and get an Asyncify build. `force` ("jspi", "compat-jspi", "asyncify", "compat-asyncify") measures another
// build, e.g. Safari's on Chrome.
const LITERT_WASM = { "jspi": "litertlm_wasm_internal.js", "compat-jspi": "litertlm_wasm_compat_internal.js",
  "asyncify": "litertlm_wasm_asyncify_internal.js", "compat-asyncify": "litertlm_wasm_compat_asyncify_internal.js" };
export function litertWasmFile(features, force) {
  if (force && LITERT_WASM[force]) return LITERT_WASM[force];
  return LITERT_WASM[(features.relaxedSimd ? "" : "compat-") + (features.jspi ? "jspi" : "asyncify")];
}

// The same checks as the library's wasm_feature_detect.js: a module using a relaxed-SIMD opcode, WebAssembly.Suspending.
const RELAXED_SIMD_WASM = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1,
  253, 15, 65, 2, 253, 15, 253, 128, 2, 11];
export function wasmFeatures() {
  const W = globalThis.WebAssembly;
  if (!W) return { relaxedSimd: false, jspi: false };
  let relaxedSimd = false;
  try { relaxedSimd = W.validate(new Uint8Array(RELAXED_SIMD_WASM)); } catch (e) { relaxedSimd = false; }
  return { relaxedSimd, jspi: "Suspending" in W };
}

const SAMPLER_TOP_K = 1;
const SAMPLER_TOP_P = 2;

// One conversation per call: the system prompt (or the earlier messages) as preface, thinking off (Gemma 4's template
// only adds <|think|> when enable_thinking is true; the web SDK has no thinking budget), top-1 sampling (= greedy, as
// temperature 0 elsewhere); a temperature above 0 samples top-p 0.95 at that temperature.
export function litertConversationConfig(system, maxTokens, opts) {
  const o = opts || {};
  const messages = Array.isArray(system) ? system : [{ role: "system", content: system }];
  const t = Number(o.temperature) || 0;
  const samplerParams = t > 0 ? { type: SAMPLER_TOP_P, k: 64, p: 0.95, temperature: t, seed: 0 }
    : { type: SAMPLER_TOP_K, k: 1, p: 1, temperature: 1, seed: 0 };
  return {
    preface: { messages, extra_context: { enable_thinking: !!o.think } },
    sessionConfig: { maxOutputTokens: maxTokens, samplerParams },
  };
}

// A LiteRT-LM response + getBenchmarkInfo() as a lab row (same fields as the other runtimes, plus thought_chars:
// the length of any thinking channel, which must stay 0).
export function litertResult(response, bench, ms, maxTokens) {
  const r = response || {};
  const c = r.content;
  const text = typeof c === "string" ? c
    : Array.isArray(c) ? c.filter((p) => p && p.type === "text").map((p) => p.text || "").join("") : "";
  const thought = r.channels && typeof r.channels.thought === "string" ? r.channels.thought : "";
  const b = bench || {};
  const num = (x, n) => (typeof x === "number" && isFinite(x) && x > 0 ? round(x, n) : null);
  const completion = b.lastDecodeTokenCount || 0;
  return { text, finish: completion >= maxTokens ? "length" : "stop", ms: Math.round(ms),
    prompt_tokens: b.lastPrefillTokenCount || 0, completion_tokens: completion,
    ttft_s: num(b.timeToFirstTokenInSecond, 3), prefill_tps: num(b.lastPrefillTokensPerSecond, 1),
    decode_tps: num(b.lastDecodeTokensPerSecond, 1), thought_chars: thought.length };
}

// ---- dependencies (injected by the tests) ----

let libPromise = null;
function importLib() {
  if (!libPromise) {
    libPromise = import(LITERT_URL).catch((e) => {
      libPromise = null;
      throw e;
    });
  }
  return libPromise;
}

function resolveDeps(deps) {
  const d = deps || {};
  const perf = globalThis.performance;
  return {
    lib: d.lib || null,
    caches: d.caches !== undefined ? d.caches : (globalThis.caches || null),
    fetch: d.fetch || ((...a) => globalThis.fetch(...a)),
    features: d.features || null,
    now: d.now || (() => (perf ? perf.now() : Date.now())),
  };
}

async function openCache(d) {
  try { return d.caches ? await d.caches.open(LITERT_CACHE) : null; } catch (e) { return null; }
}

/** True when the model file is in the shared Cache Storage (no download needed). Never throws. */
export async function isModelCached(model, deps) {
  const cache = await openCache(resolveDeps(deps));
  if (!cache) return false;
  try { return !!(await cache.match(litertModelUrl(model))); } catch (e) { return false; }
}

/** Remove the model file from the browser (Cache Storage). */
export async function deleteModel(model, deps) {
  const cache = await openCache(resolveDeps(deps));
  if (cache) await cache.delete(litertModelUrl(model));
}

// Passes the chunks of `body` through, counting bytes; onDone when the source ends.
function countingStream(body, onBytes, onDone) {
  const reader = body.getReader();
  return new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) { if (onDone) onDone(); ctrl.close(); return; }
      onBytes(value.byteLength);
      ctrl.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

// The .litertlm file as a stream: from Cache Storage when stored, else from Hugging Face, teed into the cache (as
// Google's web chat demo does). report(phase "cache" | "download", loaded, total). Returns { stream, cache:
// Promise<status>, abort() }.
async function openModelStream(model, report, mark, d, signal) {
  const url = litertModelUrl(model);
  const cache = await openCache(d);
  let hit = null;
  try { hit = cache ? await cache.match(url) : null; } catch (e) { hit = null; }
  let got = 0;
  const done = () => mark("stream_end");
  if (hit && hit.body) {
    mark("cache_read_start");
    const total = Number(hit.headers.get("content-length")) || model.bytes;
    return { stream: countingStream(hit.body, (n) => { got += n; report("cache", got, total); }, done),
      cache: Promise.resolve("hit"), abort: () => {} };
  }
  mark("download_start");
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  let res;
  try {
    res = await d.fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (signal && signal.aborted) throw abortError(signal);
    throw new RuntimeError("model_download_failed", "Không tải được mô hình: " + errText(e), e);
  }
  if (!res.ok || !res.body) {
    throw new RuntimeError("model_download_failed", "Không tải được mô hình (HTTP " + res.status + ").");
  }
  const total = Number(res.headers.get("content-length")) || model.bytes;
  const counted = countingStream(res.body, (n) => { got += n; report("download", got, total); }, done);
  if (!cache) return { stream: counted, cache: Promise.resolve("no cache"), abort: () => ctrl.abort() };
  const [toEngine, toCache] = counted.tee();
  const put = cache.put(url, new Response(toCache, { headers: { "Content-Type": "application/octet-stream",
    "Content-Length": String(total) } })).then(() => "stored", (e) => "not stored: " + errText(e));
  return { stream: toEngine, cache: put, abort: () => ctrl.abort() };
}

const loadedWasm = new WeakMap();  // library -> wasm path: the library keeps one wasm module per page

const MB_TEXT = (n) => Math.round(n / MB);

/**
 * Loads one LiteRT-LM model: a session { id, runtime, dtype, timings, info, generate(system, user, maxTokens, opts),
 * unload(), clearCache() }, where generate returns a lab row (litertResult) and system is the system prompt or the
 * preface messages. onProgress(fraction 0..1, text, { phase, loaded, total }) with phase wasm | download | cache |
 * store. opts: { ctx (max tokens per call, default CTX_TOKENS), litertWasm (forced build), signal }.
 */
export async function loadLiteRT(model, onProgress, opts, deps) {
  const o = opts || {};
  const d = resolveDeps(deps);
  const signal = o.signal;
  const report = (phase, fraction, text, loaded, total) => {
    if (onProgress) onProgress(fraction, text, { phase, loaded, total });
  };
  if (signal && signal.aborted) throw abortError(signal);
  let L = d.lib;
  if (!L) {
    try { L = await importLib(); } catch (e) {
      throw new RuntimeError("runtime_load_failed", "Không tải được thư viện LiteRT-LM: " + errText(e), e);
    }
  }
  const features = d.features || wasmFeatures();
  if (!loadedWasm.has(L)) {
    const path = LITERT_WASM_BASE + litertWasmFile(features, o.litertWasm);
    report("wasm", 0, "Đang tải LiteRT-LM wasm…");
    try { await L.loadLiteRtLm(path); } catch (e) {
      throw new RuntimeError("runtime_load_failed", "Không nạp được LiteRT-LM wasm: " + errText(e), e);
    }
    loadedWasm.set(L, path);
  }
  const ctx = o.ctx || CTX_TOKENS;
  const t0 = d.now();
  const marks = {};
  const mark = (k) => { if (marks[k] === undefined) marks[k] = round((d.now() - t0) / 1000, 2); };
  const src = await openModelStream(model, (phase, loaded, total) => {
    report(phase, Math.min(1, loaded / total), (phase === "cache" ? "Đang nạp bản đã tải " : "Đang tải ")
      + MB_TEXT(loaded) + " / " + MB_TEXT(total) + " MB", loaded, total);
  }, mark, d, signal);
  let engine;
  try {
    engine = await L.Engine.create({ model: src.stream, mainExecutorSettings: { maxNumTokens: ctx },
      benchmarkEnabled: true });
  } catch (e) {
    src.abort();
    if (signal && signal.aborted) throw abortError(signal);
    throw new RuntimeError("runtime_load_failed", "LiteRT-LM không nạp được mô hình: " + errText(e), e);
  }
  mark("engine_ready");
  report("store", 1, "Đang lưu bản tải vào bộ nhớ đệm…");
  const cacheStatus = await src.cache;
  let heap = null;
  try { heap = Math.round(engine.wasm.HEAPU8.byteLength / MB); } catch (e) { heap = null; }
  return {
    id: model.repo + "/" + model.file, runtime: "litert", dtype: "web (2/4/8-bit)", timings: { marks_s: marks },
    info: { wasm: loadedWasm.get(L).slice(LITERT_WASM_BASE.length), features, cache: cacheStatus, wasm_heap_mb: heap,
      max_num_tokens: ctx },
    async generate(system, user, maxTokens, genOpts) {
      const g = genOpts && typeof genOpts === "object" ? genOpts : {};  // the lab passes the source text here
      const sig = g.signal;
      if (sig && sig.aborted) throw abortError(sig);
      const conv = await engine.createConversation(litertConversationConfig(system, maxTokens, g));
      const onAbort = () => { try { conv.cancel(); } catch (e) { /* already finished */ } };
      if (sig) sig.addEventListener("abort", onAbort, { once: true });
      try {
        const s0 = d.now();
        const resp = await conv.sendMessage(user);
        const ms = d.now() - s0;
        if (sig && sig.aborted) throw abortError(sig);
        let bench = null;
        try { bench = await conv.getBenchmarkInfo(); } catch (e) { bench = null; }
        return litertResult(resp, bench, ms, maxTokens);
      } catch (e) {
        if (sig && sig.aborted) throw abortError(sig);
        throw e;
      } finally {
        if (sig) sig.removeEventListener("abort", onAbort);
        try { await conv.delete(); } catch (e) { /* engine already gone */ }
      }
    },
    async unload() { await engine.delete(); },
    async clearCache() { await deleteModel(model, deps); },
  };
}

// Overall fraction of a page load: the file read / download takes most of it, then storing and the warm-up call.
const PHASE_SPAN = { wasm: [0, 0], download: [0, 0.94], cache: [0, 0.94], store: [0.95, 0.95], warmup: [0.97, 0.97],
  ready: [1, 1] };

/**
 * The engine contract's model function for `key` (litert-e2b | litert-e4b), loaded and warmed up (first-run shader
 * compilation). onProgress({ phase, fraction, loaded, total, text }) with a never-decreasing fraction. A load with no
 * progress for stallMs rejects with RuntimeError "runtime_stalled" (LiteRT-LM 0.17.1 can hang on Safari). The
 * function carries key, id, label, info and unload().
 */
export async function createModel(opts) {
  const o = opts || {};
  const model = litertModel(o.key);
  if (!model) throw new RuntimeError("unknown_model", "unknown model " + o.key);
  const signal = o.signal;
  if (signal && signal.aborted) throw abortError(signal);
  const stallMs = o.stallMs || STALL_MS;
  let last = 0;
  const emit = (phase, frac, text, loaded, total) => {
    const [a, b] = PHASE_SPAN[phase] || [last, last];
    last = Math.max(last, a + (b - a) * Math.min(1, Math.max(0, frac || 0)));
    if (o.onProgress) o.onProgress({ phase, fraction: last, loaded: loaded || 0, total: total || 0, text: text || "" });
  };
  let settled = false;
  let timer = null;
  let rejectNow = null;
  const guard = new Promise((_, reject) => { rejectNow = reject; });
  const work = (async () => {
    const session = await loadLiteRT(model, (f, text, det) => { poke(); emit(det.phase, f, text, det.loaded, det.total); },
      { ctx: o.ctx, litertWasm: o.litertWasm, signal }, o.deps);
    if (o.warmup !== false) {
      poke();
      emit("warmup", 1, "Chạy khởi động (biên dịch shader)…");
      await session.generate("You are a translator.", "Translate:\nHello", 4, { signal });
    }
    return session;
  })();
  function poke() {
    if (settled) return;
    clearTimeout(timer);
    timer = setTimeout(() => rejectNow(new RuntimeError("runtime_stalled", "Nạp mô hình không tiến triển sau "
      + Math.round(stallMs / 1000) + " giây (LiteRT-LM " + LITERT_VERSION + ").")), stallMs);
  }
  const onAbort = () => rejectNow(abortError(signal));
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  poke();
  let session;
  try {
    session = await Promise.race([work, guard]);
  } finally {
    settled = true;
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    // a load that finishes after the page gave up on it must not keep the GPU memory
    work.then((s) => { if (session !== s) s.unload().catch(() => {}); }, () => {});
  }
  emit("ready", 1, "");
  const fn = async (messages, callOpts) => {
    const c = callOpts || {};
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) throw new TypeError("messages: a non-empty array of {role, content}");
    const turn = list[list.length - 1];
    const row = await session.generate(list.slice(0, -1), String(turn.content == null ? "" : turn.content),
      c.maxTokens || 1024, { temperature: c.temperature, think: c.think, signal: c.signal });
    return row.finish === "length" ? "" : row.text;
  };
  fn.key = model.key;
  fn.id = model.id;
  fn.label = model.label;
  fn.info = session.info;
  fn.timings = session.timings;
  fn.unload = () => session.unload();
  return fn;
}
