// On-device OCR for the image tool (/anh/) and the PDF reader (scanned pages): PaddleOCR PP-OCRv5 mobile text
// detection + English recognition (ONNX, converted from the official PaddlePaddle models with paddle2onnx) on
// onnxruntime-web 1.30.0, everything served from this origin (web/ocr/vendor, web/ocr/models; README.md has the
// sources, licences and sha256). Two backends: WebGPU (the runtime's JSPI build) when the browser has WebGPU, JSPI
// (WebAssembly.Suspending) and a GPU adapter, and the engine reads a known line back (the self-test); otherwise
// WebAssembly, one thread, in the runtime's own module worker (env.wasm.proxy) so the page stays responsive. Images
// never leave the device: only the recognized text goes anywhere, and only when the caller sends it.
//
//   const ocr = await loadOcr({ onProgress, signal });          // downloads ~27-29 MB once (browser cache), sha256
//   const r = await ocr.recognize(source, { signal });          // source: ImageBitmap | canvas | ImageData | <img>
//   r = { width, height, lines: [{ text, box: [x0, y0, x1, y1], quad: [[x, y] x 4], score, span }] }  (reading order;
//       span: [start, end] of the text along the box, fractions of its length)
//   ocr.backend: "webgpu" | "wasm"
//
// The pipeline is PaddleOCR's (pre.js, db.js, order.js, ctc.js): detection on the image resized to a long side of at
// most detMaxSide (multiples of 32), DB post-processing to rotated line boxes in image coordinates, reading order,
// recognition of each box cut from the full-resolution image (height 48, batches of 6 by width), CTC decoding; lines
// below dropScore (0.5, PaddleOCR's drop_score) or empty are left out. Error codes (OcrError.code): ocr_unsupported
// (no WebAssembly), ocr_download (a file did not arrive), ocr_integrity (a file is not the pinned one), ocr_runtime
// (the runtime or a model did not start); an abort is an AbortError.
import { dbBoxes } from "./db.js";
import { ctcDecode, charList } from "./ctc.js";
import { detSize, resizeBilinear, detTensor, recBatches, recTensor, REC_BATCH } from "./pre.js";
import { readingOrder, quadBounds } from "./order.js";

export const OCR_MODEL = "PP-OCRv5 mobile det + en_PP-OCRv5 mobile rec";
export const DET_MAX_SIDE = 960;
export const DROP_SCORE = 0.5;
const MODEL_DIR = "models/pp-ocrv5-mobile-en/";
const ORT_DIR = "vendor/onnxruntime-web-1.30.0/";
// path relative to web/ocr/, size, sha256 (README.md: where each one comes from)
export const OCR_FILES = {
  det: { path: MODEL_DIR + "det.onnx", bytes: 4826518,
    sha256: "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d" },
  rec: { path: MODEL_DIR + "rec.onnx", bytes: 7874456,
    sha256: "498c10d6816df8c6b087cf4ebaed9591a8d6e90d5edd7115af48e1b869ab5b7c" },
  dict: { path: MODEL_DIR + "dict.txt", bytes: 1416,
    sha256: "e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6" },
};
export const ORT_FILES = {
  js: { path: ORT_DIR + "ort.wasm.min.js", bytes: 50126,
    sha256: "219e6a1fc8a9938268d18efca3c91d310bd2f4a59bbd13744df5b2b7fc6cee3b" },
  glue: { path: ORT_DIR + "ort-wasm-simd-threaded.js", bytes: 24381,
    sha256: "e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b" },
  wasm: { path: ORT_DIR + "ort-wasm-simd-threaded.wasm", bytes: 14239897,
    sha256: "3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2" },
};
// the JSPI build of the same release: the WebGPU execution provider (the asyncify WebGPU build is over Cloudflare
// Pages' 25 MiB per file)
export const ORT_GPU_FILES = {
  js: { path: ORT_DIR + "ort.jspi.min.js", bytes: 66511,
    sha256: "bc57179d923fda2d88d4a395359c8df44399dde087bf9ff44fc0e40ab398e4d9" },
  glue: { path: ORT_DIR + "ort-wasm-simd-threaded.jspi.js", bytes: 50918,
    sha256: "270e2c6da9f297239d301d329782b6446641cb1e16a77967690adcfca35f3268" },
  wasm: { path: ORT_DIR + "ort-wasm-simd-threaded.jspi.wasm", bytes: 16758545,
    sha256: "a54c76f86b0f0d9572380cf1c6292a7b3903716ffcbcd6b0e5c7050bf430eb93" },
};
/** Bytes downloaded on first use with the WebAssembly backend (models, dictionary, runtime); WebGPU: 2.5 MB more. */
export const DOWNLOAD_BYTES = OCR_FILES.det.bytes + OCR_FILES.rec.bytes + OCR_FILES.dict.bytes + ORT_FILES.wasm.bytes;
export const SELF_TEST_TEXT = "ViTranslate 2026 OCR";

export class OcrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OcrError";
    this.code = code;
  }
}

function abortError(signal) {
  const r = signal && signal.reason;
  return r && r.name === "AbortError" ? r : new DOMException("The operation was aborted.", "AbortError");
}

function check(signal) {
  if (signal && signal.aborted) throw abortError(signal);
}

/**
 * The OCR pipeline on RGBA pixels (width x height) with the models given as functions:
 *   runDet(Float32Array 3 x h x w, w, h) -> Float32Array h x w (text probability)
 *   runRec(Float32Array n x 3 x 48 x width, n, width) -> { probs: Float32Array n x steps x classes, steps, classes }
 * o: { runDet, runRec, chars (ctc.charList of the dictionary), detMaxSide?, dropScore?, signal? }
 * -> { width, height, lines: [{ text, box, quad, score, span }] } in reading order (span: [start, end] of the text
 * along the box, fractions of its length).
 */
export async function recognizeRgba(rgba, width, height, o) {
  const signal = o.signal;
  const drop = o.dropScore === undefined ? DROP_SCORE : o.dropScore;
  check(signal);
  const ds = detSize(width, height, o.detMaxSide || DET_MAX_SIDE);
  const small = ds.w === width && ds.h === height ? rgba : resizeBilinear(rgba, width, height, ds.w, ds.h);
  const pred = await o.runDet(detTensor(small, ds.w, ds.h), ds.w, ds.h);
  check(signal);
  const boxes = dbBoxes(pred, ds.w, ds.h, { destW: width, destH: height });
  const quads = readingOrder(boxes.map((b) => b.quad)).map((i) => boxes[i].quad);
  const read = new Array(quads.length);
  for (const batch of recBatches(quads, REC_BATCH)) {
    check(signal);
    const t = recTensor(rgba, width, height, batch.items.map((i) => quads[i]), batch.ratio);
    const r = await o.runRec(t.data, t.n, t.width);
    const stride = t.width / r.steps;  // input columns per output step
    batch.items.forEach((i, row) => {
      read[i] = Object.assign(ctcDecode(r.probs, r.steps, r.classes, o.chars, row), { stride, content: t.widths[row] });
    });
  }
  check(signal);
  const lines = [];
  quads.forEach((quad, i) => {
    const d = read[i];
    const text = d.text.trim();
    if (text && d.score >= drop) lines.push({ text, box: quadBounds(quad), quad, score: d.score, span: textSpan(d) });
  });
  return { width, height, lines };
}

// Where the text runs along its box, as fractions [start, end] of the box's length: the first and last non-space
// characters' time steps (each covers `stride` input columns; one step of slack on each side) over the crop's
// width in the recognition input. Lets the overlay leave alone what the recognizer did not read (a drawn bullet).
function textSpan(d) {
  const chars = Array.from(d.text);
  let a = 0, b = chars.length - 1;
  while (a <= b && chars[a] === " ") a += 1;
  while (b >= a && chars[b] === " ") b -= 1;
  if (a > b || !d.content) return [0, 1];
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return [clamp(((d.steps[a] - 1) * d.stride) / d.content), clamp(((d.steps[b] + 2) * d.stride) / d.content)];
}

// RGBA pixels of an ImageData, a canvas (2D or offscreen) or anything drawImage takes (ImageBitmap, <img>, video)
function pixelsOf(source) {
  if (source && source.data && Number.isInteger(source.width) && Number.isInteger(source.height)
      && typeof source.getContext !== "function") {
    return { data: source.data, width: source.width, height: source.height };
  }
  const w = source.naturalWidth || source.videoWidth || source.width;
  const h = source.naturalHeight || source.videoHeight || source.height;
  if (!w || !h) throw new OcrError("ocr_runtime", "The image has no size.");
  const own = typeof source.getContext === "function" ? source.getContext("2d", { willReadFrequently: true }) : null;
  if (own) return { data: own.getImageData(0, 0, w, h).data, width: w, height: h };
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

async function sha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

// one pinned file, read as it streams in (onBytes(n) per chunk), then checked against its sha256
async function fetchPinned(base, file, onBytes, signal) {
  let res;
  try {
    res = await fetch(new URL(file.path, base), { signal, credentials: "same-origin" });
  } catch (e) {
    if (signal && signal.aborted) throw abortError(signal);
    throw new OcrError("ocr_download", file.path + ": " + (e && e.message ? e.message : e));
  }
  if (!res.ok) throw new OcrError("ocr_download", file.path + ": HTTP " + res.status);
  let bytes;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    let buf = new Uint8Array(file.bytes);
    let n = 0;
    for (;;) {
      let part;
      try {
        part = await reader.read();
      } catch (e) {
        if (signal && signal.aborted) throw abortError(signal);
        throw new OcrError("ocr_download", file.path + ": " + (e && e.message ? e.message : e));
      }
      if (part.done) break;
      if (n + part.value.length > buf.length) {
        const bigger = new Uint8Array(Math.max(buf.length * 2, n + part.value.length));
        bigger.set(buf.subarray(0, n));
        buf = bigger;
      }
      buf.set(part.value, n);
      n += part.value.length;
      onBytes(part.value.length);
    }
    bytes = n === buf.length ? buf : buf.slice(0, n);
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    onBytes(bytes.length);
  }
  if (bytes.length !== file.bytes || (await sha256Hex(bytes)) !== file.sha256) {
    throw new OcrError("ocr_integrity", file.path + " is not the pinned file (" + bytes.length + " bytes).");
  }
  return bytes;
}

/** "webgpu" when the browser has WebGPU, JSPI and a GPU adapter and WASM was not asked for; else "wasm". */
export function chooseBackend({ gpu, jspi, adapter, prefer }) {
  return prefer !== "wasm" && gpu && jspi && adapter ? "webgpu" : "wasm";
}

function editDistance(a, b) {
  const s = Array.from(a), t = Array.from(b);
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[t.length];
}

/** True when the self-test line came back close enough (at most 2 edits in its 20 characters). */
export function selfTestPassed(text) {
  return editDistance(String(text || "").replace(/\s+/g, " ").trim(), SELF_TEST_TEXT) <= 2;
}

// the self-test picture: SELF_TEST_TEXT in black on white (null where no canvas exists)
function selfTestPixels() {
  const w = 560, h = 96;
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h)
    : typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width: w, height: h }) : null;
  const ctx = c && c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000000";
  ctx.font = "44px Arial, Helvetica, sans-serif";
  ctx.fillText(SELF_TEST_TEXT, 20, 64);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

async function gpuAdapter() {
  if (typeof navigator === "undefined" || !navigator.gpu) return false;
  try {
    const a = await Promise.race([navigator.gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 3000))]);
    return !!a;
  } catch (e) {
    return false;
  }
}

/** The runtime of the engine: WebGPU when chosen, started and its check passes (the self-test line), else WASM.
 * start(backend) -> runtime { release() }; check(runtime) -> bool. -> { rt, backend, fallback (why not WebGPU) }.
 * An abort is passed on. */
export async function startWithFallback(backend, start, check) {
  let why = null;
  if (backend === "webgpu") {
    try {
      const rt = await start("webgpu");
      if (await check(rt)) return { rt, backend: "webgpu", fallback: null };
      why = "self-test";
      await rt.release().catch(() => {});
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      why = String(e && e.message ? e.message : e);
    }
  }
  return { rt: await start("wasm"), backend: "wasm", fallback: why };
}

let loading = null;  // the engine being loaded / loaded (one per page; the runtime's settings are global)

/**
 * Load the OCR engine (once per page; later calls share it): { recognize(source, {signal}), backend, model,
 * dispose() }. opts: { onProgress({stage: "download" | "start" | "ready", loaded, total, backend}), signal (the
 * first caller's signal stops the download), base (URL of web/ocr/, default this module's folder), detMaxSide,
 * dropScore, backend ("auto" default | "wasm"), proxy (WASM backend: default true, inference in a worker) }.
 */
export function loadOcr(opts) {
  if (!loading) {
    loading = createEngine(opts || {});
    loading.catch(() => { loading = null; });  // a later call tries again
  }
  return loading;
}

// one runtime build with the two models: { backend, runDet, runRec, release() }
async function startRuntime(base, files, wasm, models, backend, proxy) {
  const ort = await import(new URL(files.js.path, base).href);
  ort.env.logLevel = "error";                            // the runtime's own messages: errors only
  ort.env.wasm.numThreads = 1;                           // no SharedArrayBuffer without cross-origin isolation
  ort.env.wasm.proxy = backend === "wasm" && proxy;      // a same-origin module worker (CSP worker-src 'self')
  ort.env.wasm.wasmBinary = wasm;                        // the checked bytes: no second download
  ort.env.wasm.wasmPaths = { mjs: new URL(files.glue.path, base).href, wasm: new URL(files.wasm.path, base).href };
  const so = { executionProviders: [backend], graphOptimizationLevel: "all", logSeverityLevel: 3 };  // errors only
  const det = await ort.InferenceSession.create(models.det, so);
  const rec = await ort.InferenceSession.create(models.rec, so);
  return {
    backend,
    runDet: async (data, w, h) => {
      const out = await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, h, w]) });
      return out[det.outputNames[0]].data;
    },
    runRec: async (data, n, width) => {
      const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor("float32", data, [n, 3, 48, width]) });
      const t = out[rec.outputNames[0]];
      return { probs: t.data, steps: t.dims[1], classes: t.dims[2] };
    },
    release: () => Promise.all([det.release(), rec.release()]),
  };
}

async function createEngine(o) {
  const signal = o.signal;
  const base = o.base ? new URL(o.base, location.href) : new URL("./", import.meta.url);
  const progress = typeof o.onProgress === "function" ? o.onProgress : () => {};
  if (typeof WebAssembly !== "object") throw new OcrError("ocr_unsupported", "This browser has no WebAssembly.");
  check(signal);
  let backend = chooseBackend({ gpu: typeof navigator !== "undefined" && !!navigator.gpu,
    jspi: typeof WebAssembly.Suspending === "function", adapter: o.backend !== "wasm" && (await gpuAdapter()),
    prefer: o.backend });
  let files = backend === "webgpu" ? ORT_GPU_FILES : ORT_FILES;
  let loaded = 0;
  let total = OCR_FILES.det.bytes + OCR_FILES.rec.bytes + OCR_FILES.dict.bytes + files.wasm.bytes;
  const onBytes = (n) => { loaded += n; progress({ stage: "download", loaded: Math.min(loaded, total), total, backend }); };
  progress({ stage: "download", loaded, total, backend });
  const [det, rec, dict, wasm] = await Promise.all([OCR_FILES.det, OCR_FILES.rec, OCR_FILES.dict, files.wasm]
    .map((f) => fetchPinned(base, f, onBytes, signal)));
  check(signal);
  progress({ stage: "start", loaded, total, backend });
  const chars = charList(new TextDecoder("utf-8").decode(dict));
  const models = { det, rec };
  const start = async (b) => {
    if (b === "webgpu") return startRuntime(base, files, wasm, models, "webgpu", false);
    let bytes = wasm;
    if (files !== ORT_FILES) {  // WebGPU did not work out: the WebAssembly runtime's own binary
      files = ORT_FILES;
      total += files.wasm.bytes;
      progress({ stage: "download", loaded, total, backend: b });
      bytes = await fetchPinned(base, files.wasm, onBytes, signal);
      check(signal);
      progress({ stage: "start", loaded, total, backend: b });
    }
    try {
      return await startRuntime(base, files, bytes, models, "wasm", o.proxy !== false);
    } catch (e) {
      throw new OcrError("ocr_runtime", "The OCR runtime did not start: " + (e && e.message ? e.message : e));
    }
  };
  const selfTest = async (rt) => {
    const px = selfTestPixels();
    if (!px) return false;
    const read = await recognizeRgba(px.data, px.width, px.height, { runDet: rt.runDet, runRec: rt.runRec, chars, signal });
    return selfTestPassed(read.lines.map((l) => l.text).join(" "));
  };
  const started = await startWithFallback(backend, start, selfTest);
  const rt = started.rt;
  backend = started.backend;
  const fallback = started.fallback;  // why WebGPU was not used after all
  let busy = Promise.resolve();  // one recognition at a time (one runtime)
  progress({ stage: "ready", loaded, total, backend });
  return {
    backend,
    fallback,
    model: OCR_MODEL,
    recognize(source, ropts) {
      const r = ropts || {};
      const run = busy.then(() => {
        check(r.signal);
        const px = pixelsOf(source);
        return recognizeRgba(px.data, px.width, px.height, { runDet: rt.runDet, runRec: rt.runRec, chars, signal: r.signal,
          detMaxSide: r.detMaxSide || o.detMaxSide, dropScore: r.dropScore === undefined ? o.dropScore : r.dropScore });
      });
      busy = run.catch(() => {});
      return run;
    },
    async dispose() {
      loading = null;
      await rt.release();
    },
  };
}
