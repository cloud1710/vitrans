// WebGPU lab core: device probe, model candidates on three runtimes, loading, one translation call, tag check.
// Measurement only. Talks to cdn.jsdelivr.net (libraries, onnxruntime-web / LiteRT-LM wasm), huggingface.co / *.hf.co
// (weights) and raw.githubusercontent.com (WebLLM compiled model library). Never to the ViTranslate helper.

// Pinned versions, each published more than two weeks before 2026-10-14:
// transformers.js 4.3.0 (2026-09-16; bundles onnxruntime-web 1.31.0-dev.20260914), web-llm 0.2.85 (2026-09-08).
// LiteRT-LM (Gemma 4 E2B / E4B) lives in ../engine/runtime.js, shared with the page's browser engine.
import { LITERT_VERSION, LITERT_URL, LITERT_WASM_BASE, LITERT_CACHE, LITERT_MODELS, litertModelUrl, litertWasmFile,
  wasmFeatures, litertConversationConfig, litertResult, loadLiteRT as loadLiteRTRuntime, deleteModel as deleteLiteRT,
  round } from "../engine/runtime.js";

export { LITERT_VERSION, LITERT_URL, LITERT_WASM_BASE, LITERT_CACHE, litertModelUrl, litertWasmFile, wasmFeatures,
  litertConversationConfig, litertResult, round };
export const TJS_VERSION = "4.3.0";
export const TJS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@" + TJS_VERSION + "/dist/transformers.min.js";
export const WEBLLM_VERSION = "0.2.85";
export const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@" + WEBLLM_VERSION + "/lib/index.js";

const MB = 1024 * 1024;
const GIB = 1024 * MB;

// downloadGB: files the runtime fetches (ONNX: tokenizer + text-only sessions; MLC: weight shards).
// largestMB: biggest single weight tensor (embedding), which must fit one GPU storage binding.
// memMB: GPU memory estimate (MLC: vram_required_MB of the prebuilt list; ONNX: weights + ~15 %).
// Qwen 3.5 ONNX: the -ONNX-OPT builds (LinearAttention / CausalConvWithState ops, which onnxruntime-web runs on
// WebGPU). The plain -ONNX builds express linear attention with Scan, which falls back to the CPU: measured
// 4.5 tok/s prefill, 15.5 tok/s decode for 4B on an RTX 5080. Repos are pinned to a commit (rev).
export const MODELS = [
  { key: "onnx-0.8b", runtime: "onnx", name: "Qwen 3.5 0.8B (ONNX)", repo: "onnx-community/Qwen3.5-0.8B-ONNX-OPT",
    rev: "9a4c21d8f724176b0a7edaaed36303044451886e", dtype: "q4f16", dtypeNoF16: "q4", downloadGB: 0.60, memMB: 750, largestMB: 127 },
  { key: "onnx-2b", runtime: "onnx", name: "Qwen 3.5 2B (ONNX)", repo: "onnx-community/Qwen3.5-2B-ONNX-OPT",
    rev: "ed446636739bf426e73c5a00714fd8e010d36c21", dtype: "q4f16", dtypeNoF16: "q4", downloadGB: 1.40, memMB: 1700, largestMB: 254 },
  { key: "onnx-4b", runtime: "onnx", name: "Qwen 3.5 4B (ONNX)", repo: "onnx-community/Qwen3.5-4B-ONNX-OPT",
    rev: "bb072268d0912bdc5cf4f41c8c6f53a03fd68624", dtype: "q4f16", dtypeNoF16: "q4", downloadGB: 2.82, memMB: 3300, largestMB: 318 },
  { key: "onnx-qwen3-4b", runtime: "onnx", name: "Qwen 3 4B (ONNX)", repo: "onnx-community/Qwen3-4B-ONNX",
    rev: "ca652ef636e8b121ff4a1607c37ab578cb866987", dtype: "q4f16", dtypeNoF16: null, downloadGB: 2.85, memMB: 3300, largestMB: 194 },
  { key: "onnx-opus", runtime: "onnx", kind: "mt", name: "opus-mt-en-vi (Marian, mốc so sánh)", repo: "Xenova/opus-mt-en-vi",
    rev: "30bcd461c0d7338ad106b36314d3eedc2d4e998c", dtype: "fp16", dtypeNoF16: "fp32", downloadGB: 0.21, memMB: 400, largestMB: 60,
    note: "Mô hình dịch máy nhỏ: không nhận thẻ định dạng và bảng chú giải; chỉ để so tốc độ và dung lượng." },
  { key: "mlc-2b", runtime: "webllm", name: "Qwen 3.5 2B (WebLLM)", f16: "Qwen3.5-2B-q4f16_1-MLC", f32: "Qwen3.5-2B-q4f32_1-MLC",
    downloadGB: 1.08, memMB: 2245, memMBf32: 2592, largestMB: 243 },
  { key: "mlc-4b", runtime: "webllm", name: "Qwen 3.5 4B (WebLLM)", f16: "Qwen3.5-4B-q4f16_1-MLC", f32: "Qwen3.5-4B-q4f32_1-MLC",
    downloadGB: 2.39, memMB: 3868, memMBf32: 4680, largestMB: 304 },
  { key: "mlc-9b", runtime: "webllm", name: "Qwen 3.5 9B (WebLLM)", f16: "Qwen3.5-9B-q4f16_1-MLC", f32: "Qwen3.5-9B-q4f32_1-MLC",
    downloadGB: 5.06, memMB: 6433, memMBf32: 7545, largestMB: 485, bigOnly: true },
  // LiteRT-LM Gemma 4 E2B / E4B web builds (measured sizes and pinned commits: ../engine/runtime.js)
  ...LITERT_MODELS,
];

const LIMIT_KEYS = ["maxBufferSize", "maxStorageBufferBindingSize", "maxStorageBuffersPerShaderStage",
  "maxComputeWorkgroupStorageSize", "maxComputeInvocationsPerWorkgroup", "maxComputeWorkgroupSizeX"];

export function deviceClass(ua, touchPoints) {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "desktop";
}

// Safari hides the device model and RAM, so the user names the device and the page compares its RAM with the minimum.
// RAM in GB per model (several values = sold with more RAM in the larger storage tiers; the smallest one counts).
// Every Apple device that runs Apple Intelligence has 8 GB or more, which is the same line as our minimum.
export const MIN_RAM_GB = 8;
export const APPLE_DEVICES = [
  { group: "iPhone", name: "iPhone SE (thế hệ 2)", ram: [3] },
  { group: "iPhone", name: "iPhone SE (thế hệ 3)", ram: [4] },
  { group: "iPhone", name: "iPhone 11 / 11 Pro / 11 Pro Max", ram: [4] },
  { group: "iPhone", name: "iPhone 12 / 12 mini", ram: [4] },
  { group: "iPhone", name: "iPhone 12 Pro / 12 Pro Max", ram: [6] },
  { group: "iPhone", name: "iPhone 13 / 13 mini", ram: [4] },
  { group: "iPhone", name: "iPhone 13 Pro / 13 Pro Max", ram: [6] },
  { group: "iPhone", name: "iPhone 14 / 14 Plus", ram: [6] },
  { group: "iPhone", name: "iPhone 14 Pro / 14 Pro Max", ram: [6] },
  { group: "iPhone", name: "iPhone 15 / 15 Plus", ram: [6] },
  { group: "iPhone", name: "iPhone 15 Pro", ram: [8] },
  { group: "iPhone", name: "iPhone 15 Pro Max", ram: [8] },
  { group: "iPhone", name: "iPhone 16e", ram: [8] },
  { group: "iPhone", name: "iPhone 16 / 16 Plus", ram: [8] },
  { group: "iPhone", name: "iPhone 16 Pro / 16 Pro Max", ram: [8] },
  { group: "iPhone", name: "iPhone 17", ram: [8] },
  { group: "iPhone", name: "iPhone 17e", ram: [8] },
  { group: "iPhone", name: "iPhone Air", ram: [12] },
  { group: "iPhone", name: "iPhone 17 Pro / 17 Pro Max", ram: [12] },
  { group: "iPhone", name: "iPhone 18 Pro / 18 Pro Max", ram: [12] },
  { group: "iPad", name: "iPad (thế hệ 8, 2020)", ram: [3] },
  { group: "iPad", name: "iPad (thế hệ 9, 2021)", ram: [3] },
  { group: "iPad", name: "iPad (thế hệ 10, 2022)", ram: [4] },
  { group: "iPad", name: "iPad (A16, 2025)", ram: [6] },
  { group: "iPad", name: "iPad mini (thế hệ 5, 2019)", ram: [3] },
  { group: "iPad", name: "iPad mini (thế hệ 6, 2021)", ram: [4] },
  { group: "iPad", name: "iPad mini (A17 Pro, 2024)", ram: [8] },
  { group: "iPad", name: "iPad Air (thế hệ 3, 2019)", ram: [3] },
  { group: "iPad", name: "iPad Air (thế hệ 4, 2020)", ram: [4] },
  { group: "iPad", name: "iPad Air (M1, 2022)", ram: [8] },
  { group: "iPad", name: "iPad Air (M2, 2024)", ram: [8] },
  { group: "iPad", name: "iPad Air (M3, 2025)", ram: [8] },
  { group: "iPad", name: "iPad Air (M4, 2026)", ram: [12] },
  { group: "iPad", name: "iPad Pro (2018)", ram: [4, 6] },
  { group: "iPad", name: "iPad Pro (2020)", ram: [6] },
  { group: "iPad", name: "iPad Pro (M1, 2021)", ram: [8, 16] },
  { group: "iPad", name: "iPad Pro (M2, 2022)", ram: [8, 16] },
  { group: "iPad", name: "iPad Pro (M4, 2024)", ram: [8, 16] },
  { group: "iPad", name: "iPad Pro (M5, 2025)", ram: [12, 16] },
];

// ok: meets MIN_RAM_GB with its smallest RAM size; measured: a 4-6 GB iPhone (that class crashed the tab at 2B).
export function deviceVerdict(dev) {
  if (!dev || !Array.isArray(dev.ram) || !dev.ram.length) return null;
  const lo = Math.min(...dev.ram), hi = Math.max(...dev.ram);
  return { ok: lo >= MIN_RAM_GB, ram: lo, ramText: lo === hi ? lo + " GB" : lo + "-" + hi + " GB",
    measured: dev.group === "iPhone" && lo >= 4 && hi <= 6 };
}

// ---- screen size -> candidate devices ----
// Safari hides the model but not the screen: screen.width x screen.height in points (always portrait on iOS) and
// devicePixelRatio narrow it down. Sizes checked 2026-10-14 against iosref.com/res, Apple's HIG device screen table
// (developer.apple.com, Wayback snapshot 2026-07-02) and Playwright's device descriptors; the 12 / 13 mini report
// 375x812 @3 (UIKit points; the HIG's 360x780 is native pixels / 3). RAM: iosref.com/memory-processor.
// zoom: the size reported with Display Zoom ("Larger Text"), where measured (zenn.dev/fsh, iOS 15; Apple developer
// forums 672792 / 716045 / 726117); null = not known. A zoomed phone of unknown zoom size can be taken for a smaller
// model: the card always links to the lab, where the user can name the device instead.
const S = (label, device, w, h, dpr, zoom) => ({ label, device, w, h, dpr, zoom: zoom || null });
export const SCREENS = [
  S("iPhone SE (thế hệ 2)", "iPhone SE (thế hệ 2)", 375, 667, 2, [320, 568]),
  S("iPhone SE (thế hệ 3)", "iPhone SE (thế hệ 3)", 375, 667, 2, [320, 568]),
  S("iPhone 11", "iPhone 11 / 11 Pro / 11 Pro Max", 414, 896, 2, [375, 812]),
  S("iPhone 11 Pro", "iPhone 11 / 11 Pro / 11 Pro Max", 375, 812, 3, [320, 693]),
  S("iPhone 11 Pro Max", "iPhone 11 / 11 Pro / 11 Pro Max", 414, 896, 3, [375, 812]),
  S("iPhone 12 mini", "iPhone 12 / 12 mini", 375, 812, 3, [320, 693]),
  S("iPhone 12", "iPhone 12 / 12 mini", 390, 844, 3, [320, 693]),
  S("iPhone 12 Pro", "iPhone 12 Pro / 12 Pro Max", 390, 844, 3, [320, 693]),
  S("iPhone 12 Pro Max", "iPhone 12 Pro / 12 Pro Max", 428, 926, 3, [375, 812]),
  S("iPhone 13 mini", "iPhone 13 / 13 mini", 375, 812, 3, [320, 693]),
  S("iPhone 13", "iPhone 13 / 13 mini", 390, 844, 3, [320, 693]),
  S("iPhone 13 Pro", "iPhone 13 Pro / 13 Pro Max", 390, 844, 3, [320, 693]),
  S("iPhone 13 Pro Max", "iPhone 13 Pro / 13 Pro Max", 428, 926, 3, [375, 812]),
  S("iPhone 14", "iPhone 14 / 14 Plus", 390, 844, 3, [320, 693]),        // zoom assumed: same panel as the 13
  S("iPhone 14 Plus", "iPhone 14 / 14 Plus", 428, 926, 3, [375, 812]),   // zoom assumed: same panel as the 13 Pro Max
  S("iPhone 14 Pro", "iPhone 14 Pro / 14 Pro Max", 393, 852, 3, [320, 693]),
  S("iPhone 14 Pro Max", "iPhone 14 Pro / 14 Pro Max", 430, 932, 3),
  S("iPhone 15", "iPhone 15 / 15 Plus", 393, 852, 3),
  S("iPhone 15 Plus", "iPhone 15 / 15 Plus", 430, 932, 3),
  S("iPhone 15 Pro", "iPhone 15 Pro", 393, 852, 3),
  S("iPhone 15 Pro Max", "iPhone 15 Pro Max", 430, 932, 3),
  S("iPhone 16e", "iPhone 16e", 390, 844, 3),
  S("iPhone 16", "iPhone 16 / 16 Plus", 393, 852, 3),
  S("iPhone 16 Plus", "iPhone 16 / 16 Plus", 430, 932, 3),
  S("iPhone 16 Pro", "iPhone 16 Pro / 16 Pro Max", 402, 874, 3),
  S("iPhone 16 Pro Max", "iPhone 16 Pro / 16 Pro Max", 440, 956, 3),
  S("iPhone 17", "iPhone 17", 402, 874, 3),
  S("iPhone 17e", "iPhone 17e", 390, 844, 3),                            // support.apple.com/126470: 2532x1170
  S("iPhone Air", "iPhone Air", 420, 912, 3),
  S("iPhone 17 Pro", "iPhone 17 Pro / 17 Pro Max", 402, 874, 3),
  S("iPhone 17 Pro Max", "iPhone 17 Pro / 17 Pro Max", 440, 956, 3),
  S("iPhone 18 Pro", "iPhone 18 Pro / 18 Pro Max", 402, 874, 3),
  S("iPhone 18 Pro Max", "iPhone 18 Pro / 18 Pro Max", 440, 956, 3),     // support.apple.com/148591: 2868x1320
  S("iPad (thế hệ 8)", "iPad (thế hệ 8, 2020)", 810, 1080, 2),
  S("iPad (thế hệ 9)", "iPad (thế hệ 9, 2021)", 810, 1080, 2),
  S("iPad (thế hệ 10)", "iPad (thế hệ 10, 2022)", 820, 1180, 2),
  S("iPad (A16)", "iPad (A16, 2025)", 820, 1180, 2),
  S("iPad mini (thế hệ 5)", "iPad mini (thế hệ 5, 2019)", 768, 1024, 2),
  S("iPad mini (thế hệ 6)", "iPad mini (thế hệ 6, 2021)", 744, 1133, 2),
  S("iPad mini (A17 Pro)", "iPad mini (A17 Pro, 2024)", 744, 1133, 2),
  S("iPad Air (thế hệ 3)", "iPad Air (thế hệ 3, 2019)", 834, 1112, 2),
  S("iPad Air (thế hệ 4)", "iPad Air (thế hệ 4, 2020)", 820, 1180, 2),
  S("iPad Air (M1)", "iPad Air (M1, 2022)", 820, 1180, 2),
  S("iPad Air 11 inch (M2)", "iPad Air (M2, 2024)", 820, 1180, 2),
  S("iPad Air 13 inch (M2)", "iPad Air (M2, 2024)", 1024, 1366, 2),
  S("iPad Air 11 inch (M3)", "iPad Air (M3, 2025)", 820, 1180, 2),
  S("iPad Air 13 inch (M3)", "iPad Air (M3, 2025)", 1024, 1366, 2),
  S("iPad Air 11 inch (M4)", "iPad Air (M4, 2026)", 820, 1180, 2),
  S("iPad Air 13 inch (M4)", "iPad Air (M4, 2026)", 1024, 1366, 2),
  S("iPad Pro 11 inch (2018)", "iPad Pro (2018)", 834, 1194, 2),
  S("iPad Pro 12.9 inch (2018)", "iPad Pro (2018)", 1024, 1366, 2),
  S("iPad Pro 11 inch (2020)", "iPad Pro (2020)", 834, 1194, 2),
  S("iPad Pro 12.9 inch (2020)", "iPad Pro (2020)", 1024, 1366, 2),
  S("iPad Pro 11 inch (M1)", "iPad Pro (M1, 2021)", 834, 1194, 2),
  S("iPad Pro 12.9 inch (M1)", "iPad Pro (M1, 2021)", 1024, 1366, 2),
  S("iPad Pro 11 inch (M2)", "iPad Pro (M2, 2022)", 834, 1194, 2),
  S("iPad Pro 12.9 inch (M2)", "iPad Pro (M2, 2022)", 1024, 1366, 2),
  S("iPad Pro 11 inch (M4)", "iPad Pro (M4, 2024)", 834, 1210, 2),
  S("iPad Pro 13 inch (M4)", "iPad Pro (M4, 2024)", 1032, 1376, 2),
  S("iPad Pro 11 inch (M5)", "iPad Pro (M5, 2025)", 834, 1210, 2),
  S("iPad Pro 13 inch (M5)", "iPad Pro (M5, 2025)", 1032, 1376, 2),
];

// Safari's fingerprinting protection (Private Browsing / known trackers; WebKit WebPageIOS.mm
// screenSizeForFingerprintingProtections) reports an iPhone's screen as the first of these at least as wide as the
// real one, and 414x896 for anything wider: such a size also stands for every phone of that width range.
const FP_BUCKETS = [[320, 568], [375, 667], [390, 844], [414, 896]];

function inBucket(s, w, h) {
  const k = FP_BUCKETS.findIndex(([bw, bh]) => bw === w && bh === h);
  if (k < 0) return false;
  const lo = k ? FP_BUCKETS[k - 1][0] : 0;
  return s.w > lo && (k === FP_BUCKETS.length - 1 || s.w <= w);
}

// Models that can report this screen (natively, zoomed, or bucketed by fingerprinting protection) for an "iPhone" /
// "iPad" device class: [{ label, device (APPLE_DEVICES name), ram (smallest RAM size, GB) }].
export function screenCandidates(cls, width, height, dpr) {
  if (cls !== "iPhone" && cls !== "iPad") return [];
  const w = Math.min(width || 0, height || 0), h = Math.max(width || 0, height || 0), r = Math.round(dpr || 0);
  const out = [];
  for (const s of SCREENS) {
    if (!s.label.startsWith(cls) || s.dpr !== r) continue;
    const native = s.w === w && s.h === h;
    const zoomed = !!s.zoom && s.zoom[0] === w && s.zoom[1] === h;
    if (native || zoomed || (cls === "iPhone" && inBucket(s, w, h))) {
      const dev = APPLE_DEVICES.find((d) => d.name === s.device);
      out.push({ label: s.label, device: s.device, ram: dev ? Math.min(...dev.ram) : 0 });
    }
  }
  return out;
}

// ok / below: every candidate on one side of MIN_RAM_GB; ask: both sides (one two-way question); unknown: none.
export function screenDecision(cands) {
  const ok = cands.filter((c) => c.ram >= MIN_RAM_GB), below = cands.filter((c) => c.ram < MIN_RAM_GB);
  const state = !cands.length ? "unknown" : !below.length ? "ok" : !ok.length ? "below" : "ask";
  return { state, ok, below };
}

// "iPhone 12 / 12 Pro / 13 / 13 Pro / …": at most `max` names, the repeated "iPhone " dropped after the first.
export function groupLabel(cands, max) {
  const n = max || 4;
  const names = cands.map((c, i) => (i && c.label.startsWith("iPhone ") ? c.label.slice(7) : c.label));
  return names.slice(0, n).join(" / ") + (names.length > n ? " / …" : "");
}

// iOS / iPadOS major version. Safari 26 freezes the OS part of its user agent ("iPhone OS 18_6" / "18_7") but its
// Version/ still tracks the OS major; Chrome on iOS (no Version/) still reports the real OS version.
export function iosMajor(ua) {
  const s = ua || "";
  let m = /Version\/(\d+)/.exec(s);
  if (m && /iPhone|iPad|iPod|Macintosh/.test(s)) return Number(m[1]);
  m = /(?:iPhone|CPU) OS (\d+)_/.exec(s);
  return m ? Number(m[1]) : null;
}

function browserName(ua) {
  let m;
  if ((m = ua.match(/Edg\/(\d+)/))) return "Edge " + m[1];
  if ((m = ua.match(/CriOS\/(\d+)/))) return "Chrome iOS " + m[1] + " (WebKit)";
  if (/FxiOS/.test(ua)) return "Firefox iOS (WebKit)";
  if ((m = ua.match(/SamsungBrowser\/(\d+)/))) return "Samsung Internet " + m[1];
  if ((m = ua.match(/Chrome\/(\d+)/))) return "Chrome " + m[1];
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return "Safari " + m[1];
  if ((m = ua.match(/Firefox\/(\d+)/))) return "Firefox " + m[1];
  return "khác";
}

export async function probeDevice() {
  const nav = globalThis.navigator || {};
  const ua = nav.userAgent || "";
  const info = {
    ua,
    device_class: deviceClass(ua, nav.maxTouchPoints || 0),
    browser: browserName(ua),
    cores: nav.hardwareConcurrency || null,
    device_memory_gb: nav.deviceMemory || null,  // Chrome / Android only, capped at 8 on phones
    screen: (globalThis.screen ? screen.width + "x" + screen.height + " @" + (globalThis.devicePixelRatio || 1) : null),
    storage: null,
    webgpu: { available: !!nav.gpu },
  };
  try {
    if (nav.storage && nav.storage.estimate) {
      const est = await nav.storage.estimate();
      info.storage = { quota_mb: Math.round((est.quota || 0) / MB), usage_mb: Math.round((est.usage || 0) / MB) };
    }
  } catch (e) { info.storage = { error: String(e) }; }
  if (!nav.gpu) return info;
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) { info.webgpu.adapter = null; return info; }
    let ai = adapter.info;
    if (!ai && adapter.requestAdapterInfo) { try { ai = await adapter.requestAdapterInfo(); } catch (e) { ai = null; } }
    info.webgpu.adapter = ai ? { vendor: ai.vendor || "", architecture: ai.architecture || "", device: ai.device || "",
      description: ai.description || "", fallback: !!(ai.isFallbackAdapter || adapter.isFallbackAdapter) } : {};
    info.webgpu.features = Array.from(adapter.features || []).sort();
    info.webgpu.limits = {};
    for (const k of LIMIT_KEYS) info.webgpu.limits[k] = adapter.limits[k];
  } catch (e) {
    info.webgpu.error = String(e);
  }
  return info;
}

const gb = (mb) => (mb / 1024).toFixed(1).replace(".", ",");

// Can this model run here? WebLLM (tvmjs detectGPUDevice) asks for 1 GiB buffers when the adapter allows, otherwise
// falls back to 256 MB buffers / 128 MB bindings, which no Qwen 3.5 embedding (243-485 MB) fits: a hard stop.
// onnxruntime-web asks for the adapter's own limits, so for ONNX a binding below the largest tensor is a hard stop.
export function checkFit(model, info) {
  const res = { ok: true, f16: true, dtype: null, id: null, memMB: model.memMB, heapMB: model.heapMB || 0, reasons: [],
    warnings: [] };
  const gpu = info.webgpu || {};
  if (!gpu.available) return { ...res, ok: false, reasons: ["Trình duyệt không có WebGPU."] };
  if (!gpu.adapter || !gpu.limits) return { ...res, ok: false, reasons: ["Không lấy được bộ điều hợp GPU (WebGPU adapter)."] };
  const L = gpu.limits;
  const bind = Math.min(L.maxBufferSize || 0, L.maxStorageBufferBindingSize || 0);
  res.f16 = (gpu.features || []).includes("shader-f16");
  if (model.runtime === "webllm") {
    res.id = res.f16 ? model.f16 : model.f32;
    if (!res.f16) res.memMB = model.memMBf32;
    if (bind < GIB) {
      res.ok = false;
      res.reasons.push("Giới hạn bộ đệm GPU chỉ " + Math.floor(bind / MB) + " MB; WebLLM cần 1024 MB vì tensor lớn nhất là "
        + model.largestMB + " MB (> 128 MB).");
    }
    if ((L.maxStorageBuffersPerShaderStage || 0) < 10) {
      res.ok = false;
      res.reasons.push("maxStorageBuffersPerShaderStage = " + L.maxStorageBuffersPerShaderStage + " (WebLLM cần 10).");
    }
  } else if (model.runtime === "litert") {
    // LiteRT-LM asks for the adapter's own limits (createDefaultWebGpuDevice), so a binding below its biggest buffer
    // is a hard stop; there is one build per model (no 32-bit variant).
    res.id = model.repo + "/" + model.file;
    res.dtype = "web (2/4/8-bit)";
    if (bind < model.largestMB * MB) {
      res.ok = false;
      res.reasons.push("Giới hạn bộ đệm GPU " + Math.floor(bind / MB) + " MB nhỏ hơn bộ đệm lớn nhất LiteRT-LM tạo (~"
        + model.largestMB + " MB).");
    }
  } else {
    res.id = model.repo;
    res.dtype = res.f16 ? model.dtype : model.dtypeNoF16;
    if (!res.dtype) {
      res.ok = false;
      res.reasons.push("Bản ONNX này chỉ có q4f16 mà GPU không hỗ trợ shader-f16.");
    }
    if (bind < model.largestMB * MB) {
      res.ok = false;
      res.reasons.push("Giới hạn bộ đệm GPU " + Math.floor(bind / MB) + " MB nhỏ hơn tensor lớn nhất (~" + model.largestMB + " MB).");
    }
  }
  if ((L.maxComputeWorkgroupStorageSize || 0) < 16384) {
    res.ok = false;
    res.reasons.push("maxComputeWorkgroupStorageSize = " + L.maxComputeWorkgroupStorageSize + ".");
  }
  if (!res.f16) {
    res.warnings.push(model.runtime === "litert" ? "Không có shader-f16: LiteRT-LM chưa được đo trên GPU loại này."
      : "Không có shader-f16: dùng bản số thực 32 bit (tốn bộ nhớ hơn, chậm hơn).");
  }
  if (gpu.adapter.fallback) res.warnings.push("GPU là bộ giả lập phần mềm: sẽ rất chậm.");
  const cls = info.device_class;
  if (model.runtime === "litert" && (cls === "iPhone" || cls === "iPad")) {
    // LiteRT-LM issue 2368 (2026-09-16, maintainer): E2B needs ~4 GB of free RAM in a browser and does not run on iOS;
    // the Safari fix (PR 3750) shipped in 0.18.0, after the pinned 0.17.1.
    res.warnings.push("LiteRT-LM trên Safari còn thử nghiệm: nhóm phát triển báo (9/2026) E2B cần ~4 GB RAM trống "
      + "và chưa chạy được trên iOS; bản sửa lỗi Safari nằm ở bản 0.18.0, mới hơn bản " + LITERT_VERSION + " đang dùng.");
  }
  if (model.bigOnly && (cls === "iPhone" || cls === "Android phone")) {
    res.ok = false;
    res.reasons.push("Mô hình cần ~" + gb(res.memMB) + " GB bộ nhớ GPU, vượt bộ nhớ một tab trên điện thoại.");
  }
  const need = res.memMB + res.heapMB;  // GPU + wasm heap (LiteRT-LM); GPU only for the other runtimes
  if (info.device_memory_gb && info.device_memory_gb * 1024 < need * 1.5) {
    res.warnings.push("Máy báo RAM ~" + info.device_memory_gb + " GB; mô hình cần ~" + gb(need) + " GB: có thể bị đóng tab.");
  }
  if (model.runtime === "onnx" && cls !== "desktop" && model.downloadGB > 1) {
    // measured on the PC (Chrome 155): the tab's RAM peaks at ~2x the model size while ONNX sessions are created
    res.warnings.push("ONNX nạp mô hình qua RAM của tab trước khi chuyển sang GPU: lúc nạp cần thêm ~"
      + gb(model.downloadGB * 2048) + " GB RAM (đo trên PC), dễ bị đóng tab trên điện thoại.");
  }
  if ((cls === "iPhone" || cls === "iPad") && need > 1200) {
    res.warnings.push("Safari không cho biết RAM. Mô hình cần ~" + gb(need)
      + " GB; iOS có thể đóng tab nếu vượt hạn mức bộ nhớ (dễ gặp ở máy RAM 6 GB trở xuống).");
  }
  return res;
}

// ---- pre-download memory probe ----
// iOS kills a tab that goes over its memory limit ("This webpage was reloaded because a problem occurred") instead of
// returning an error, so the probe saves a marker first, allocates and fills GPU buffers of the size the model needs,
// holds them ~1 s, frees them and clears the marker. A marker still there at the next page load means the tab was
// killed during the probe: the model is then remembered as unfit for this device and nothing is downloaded.

export const STATE_KEY = "vt-lab-state";  // page phase marker: probe / load / loaded / run / done
export const UNFIT_KEY = "vt-lab-unfit";  // { modelKey: record } of models whose probe failed on this device
export const PROBE_CHUNK_CAP = GIB;       // WebLLM (tvmjs) asks for 1 GiB buffers at most
export const PROBE_FILL_BYTES = 64 * MB;  // one writeBuffer call, then wait: keeps staging memory bounded
export const PROBE_HOLD_MS = 1000;

function getJSON(store, key) {
  try { return store ? JSON.parse(store.getItem(key) || "null") : null; } catch (e) { return null; }
}
function setJSON(store, key, value) {
  try { if (store) store.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode / blocked storage */ }
}
function removeKey(store, key) {
  try { if (store) store.removeItem(key); } catch (e) { /* blocked storage */ }
}

export function readUnfit(store) {
  const u = getJSON(store, UNFIT_KEY);
  return u && typeof u === "object" && !Array.isArray(u) ? u : {};
}
export function markUnfit(store, key, record) {
  const u = readUnfit(store);
  u[key] = record;
  setJSON(store, UNFIT_KEY, u);
}
// The failure that rules this model out: its own record, else the smallest failed probe that needed no more memory
// than this model does (a 2B that crashed the tab also rules out the 4B). Malformed records are ignored.
export function unfitFor(key, bytes, unfit) {
  if (unfit[key]) return unfit[key];
  let best = null;
  for (const rec of Object.values(unfit)) {
    if (!rec || typeof rec.bytes !== "number" || !(rec.bytes <= bytes)) continue;
    if (!best || rec.bytes < best.bytes) best = rec;
  }
  return best;
}
export function clearUnfit(store, key) {
  const u = readUnfit(store);
  delete u[key];
  setJSON(store, UNFIT_KEY, u);
}

// GPU memory plus, for LiteRT-LM, the wasm heap: phones have one RAM for both, so the probe commits the sum.
export function probeBytes(fit) {
  return Math.ceil((fit.memMB + (fit.heapMB || 0)) * MB);
}

// Buffer sizes that together cover `total` bytes, each a multiple of 4 and at most min(maxBufferSize, cap).
export function probeChunks(total, maxBufferSize, cap) {
  const lim = Math.floor(Math.min(maxBufferSize || 0, cap || PROBE_CHUNK_CAP) / 4) * 4;
  if (lim <= 0) throw new Error("no usable maxBufferSize");
  const out = [];
  let left = Math.ceil(total / 4) * 4;
  while (left > 0) {
    const n = Math.min(lim, left);
    out.push(n);
    left -= n;
  }
  return out;
}

// Runs the probe for `model` on the device described by `info` (probeDevice()).
// deps: { store (localStorage or null), allocate(chunkSizes) -> { ok, reason?, message? }, now?() }.
// Returns { ok, reason?, message?, bytes, chunks, ms }; never throws. A GPU out-of-memory or lost-device answer
// marks the model unfit; other errors (no adapter, bad limits) do not.
export async function memoryProbe(model, info, deps) {
  const fit = checkFit(model, info);
  const bytes = probeBytes(fit);
  const now = deps.now || (() => new Date().toISOString());
  const at = now();
  const t0 = Date.now();
  let res, chunks = [];
  setJSON(deps.store, STATE_KEY, { phase: "probe", model: model.key, name: model.name, id: fit.id, bytes, at });
  try {
    chunks = probeChunks(bytes, ((info.webgpu || {}).limits || {}).maxBufferSize);
    res = await deps.allocate(chunks);
  } catch (e) {
    res = { ok: false, reason: "error", message: String(e && e.message ? e.message : e) };
  }
  removeKey(deps.store, STATE_KEY);
  const out = { ok: !!res.ok, bytes, chunks: chunks.length, ms: Date.now() - t0 };
  if (!res.ok) {
    out.reason = res.reason || "error";
    out.message = res.message || "";
    if (out.reason === "oom" || out.reason === "lost") {
      markUnfit(deps.store, model.key, { model: model.key, name: model.name, id: fit.id, bytes, reason: out.reason,
        message: out.message, at: now() });
    }
  }
  return out;
}

// At page load: a "probe" marker left behind means the OS killed the tab during the probe. Remembers the model as
// unfit, clears the marker and returns { marker, record }; null when there is no probe marker (load / run markers
// are left for the existing recovery path).
export function takeKilledProbe(store, now) {
  const st = getJSON(store, STATE_KEY);
  if (!st || st.phase !== "probe" || !st.model) return null;
  const record = { model: st.model, name: st.name, id: st.id, bytes: st.bytes, reason: "killed", probe_at: st.at, at: now };
  markUnfit(store, st.model, record);
  removeKey(store, STATE_KEY);
  return { marker: st, record };
}

const BUF_STORAGE = 0x80, BUF_COPY_DST = 0x08;  // GPUBufferUsage.STORAGE / COPY_DST

// The real allocator: one WebGPU device, one buffer per chunk, every byte written with a non-zero pattern (so the
// memory is committed, not only reserved), held opts.holdMs, then everything destroyed.
// Returns { ok: true } or { ok: false, reason: "oom" | "lost" | "error", message }; never throws.
export async function gpuAllocate(gpu, chunks, opts) {
  const o = { holdMs: PROBE_HOLD_MS, fillBytes: PROBE_FILL_BYTES,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), ...(opts || {}) };
  const fail = (reason, message) => ({ ok: false, reason, message: String(message || "") });
  if (!gpu) return fail("error", "no WebGPU");
  let adapter, device;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return fail("error", "no WebGPU adapter");
    const biggest = Math.max(...chunks);
    if (biggest > adapter.limits.maxBufferSize) return fail("error", "chunk above maxBufferSize");
    device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: biggest } });
  } catch (e) {
    return fail("error", e && e.message ? e.message : e);
  }
  let lost = null;
  device.lost.then((i) => { lost = i || { message: "device lost" }; });
  const lostFail = () => fail("lost", lost.message || lost.reason || "device lost");
  const usage = (globalThis.GPUBufferUsage ? GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST : BUF_STORAGE | BUF_COPY_DST);
  const fill = new Uint8Array(Math.min(o.fillBytes, Math.max(...chunks))).fill(0xa5);
  const buffers = [];
  try {
    for (const size of chunks) {
      device.pushErrorScope("out-of-memory");
      device.pushErrorScope("validation");
      const buf = device.createBuffer({ size, usage });
      buffers.push(buf);
      for (let off = 0; off < size && !lost; off += fill.byteLength) {
        device.queue.writeBuffer(buf, off, fill, 0, Math.min(fill.byteLength, size - off));
        await device.queue.onSubmittedWorkDone();
      }
      const verr = await device.popErrorScope();
      const oerr = await device.popErrorScope();
      await Promise.resolve();
      if (lost) return lostFail();
      if (oerr) return fail("oom", oerr.message || "out of memory");
      if (verr) return fail("error", verr.message || "validation error");
    }
    await device.queue.onSubmittedWorkDone();
    await o.sleep(o.holdMs);
    await Promise.resolve();
    if (lost) return lostFail();
    return { ok: true };
  } catch (e) {
    await Promise.resolve();
    return lost ? lostFail() : fail("error", e && e.message ? e.message : e);
  } finally {
    for (const b of buffers) { try { b.destroy(); } catch (e) { /* already gone */ } }
    try { device.destroy(); } catch (e) { /* already gone */ }
  }
}

const libs = {};
function lib(url) {
  if (!libs[url]) libs[url] = import(url);
  return libs[url];
}

// ---- loading ----

// Returns a session: { id, runtime, dtype, timings, generate(system, user, maxTokens, src), unload() }.
// onProgress(fraction 0..1, text). Timings: total, download / GPU phases where the runtime tells them apart,
// and a warm-up call (first-run shader compilation) kept out of the per-item numbers.
export async function loadModel(model, info, onProgress, opts) {
  const fit = checkFit(model, info);
  const o = opts || {};
  const t0 = performance.now();
  // LiteRT-LM keeps the lab's measured context of 4096 tokens per call (the page uses the runtime's default)
  const sess = model.runtime === "webllm" ? await loadWebLLM(model, fit, onProgress, o)
    : model.runtime === "litert" ? await loadLiteRTRuntime(model, onProgress, { ctx: o.ctx || 4096, litertWasm: o.litertWasm })
      : await loadOnnx(model, fit, onProgress);
  const loadS = (performance.now() - t0) / 1000;
  if (onProgress) onProgress(1, "Chạy khởi động (biên dịch shader)…");
  const w0 = performance.now();
  await sess.generate("You are a translator.", "Translate:\nHello", 4, "Hello");
  sess.timings.load_s = round(loadS, 2);
  sess.timings.warmup_s = round((performance.now() - w0) / 1000, 2);
  return sess;
}

async function loadWebLLM(model, fit, onProgress, opts) {
  const webllm = await lib(WEBLLM_URL);
  const t0 = performance.now();
  const marks = {};
  const phaseOf = (text) => {
    if (/^Fetching|^Start to fetch/i.test(text)) return "download_start";
    if (/^Loading model from cache/i.test(text)) return "gpu_upload_start";
    if (/shader/i.test(text)) return "shaders_start";
    return null;
  };
  const engine = await webllm.CreateMLCEngine(fit.id, {
    appConfig: webllm.prebuiltAppConfig,
    logLevel: "WARN",
    initProgressCallback: (r) => {
      const ph = phaseOf(r.text || "");
      if (ph && marks[ph] === undefined) marks[ph] = round((performance.now() - t0) / 1000, 2);
      if (onProgress) onProgress(r.progress || 0, r.text || "");
    },
  }, { context_window_size: opts.ctx || 4096 });
  return {
    id: fit.id, runtime: "webllm", dtype: fit.f16 ? "q4f16_1" : "q4f32_1", timings: { marks_s: marks },
    async generate(system, user, maxTokens) {
      await engine.resetChat();
      const s0 = performance.now();
      const r = await engine.chat.completions.create({
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0, top_p: 1, seed: 0, stream: false, max_tokens: maxTokens,
        extra_body: { enable_thinking: false },
      });
      const u = r.usage || {};
      const x = u.extra || {};
      const c = r.choices && r.choices[0];
      return {
        text: (c && c.message && c.message.content) || "", finish: c ? c.finish_reason : null,
        ms: Math.round(performance.now() - s0), prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0,
        ttft_s: x.time_to_first_token_s != null ? round(x.time_to_first_token_s, 3) : null,
        prefill_tps: x.prefill_tokens_per_s != null ? round(x.prefill_tokens_per_s, 1) : null,
        decode_tps: x.decode_tokens_per_s != null ? round(x.decode_tokens_per_s, 1) : null,
      };
    },
    async unload() { await engine.unload(); },
    async clearCache() { await webllm.deleteModelAllInfoInCache(fit.id, webllm.prebuiltAppConfig); },
  };
}

async function loadOnnx(model, fit, onProgress) {
  const T = await lib(TJS_URL);
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  // Otherwise transformers.js re-wraps the onnxruntime-web .mjs as a blob: script, which the lab CSP does not allow;
  // ORT then imports the .mjs from cdn.jsdelivr.net directly (the browser HTTP cache keeps the 27 MB wasm).
  T.env.useWasmCache = false;
  const t0 = performance.now();
  const marks = {};
  let lastDone = 0;
  const progress = (p) => {
    if (p.status === "initiate" && marks.download_start === undefined) marks.download_start = round((performance.now() - t0) / 1000, 2);
    if (p.status === "progress_total") {
      if (onProgress) onProgress((p.progress || 0) / 100, "Đang tải " + Math.round((p.loaded || 0) / MB) + " / " + Math.round((p.total || 0) / MB) + " MB");
      if (p.loaded >= p.total) lastDone = performance.now();
    }
  };
  const opts = { device: "webgpu", dtype: fit.dtype, revision: model.rev, progress_callback: progress };
  let tok, lm, pipe;
  if (model.kind === "mt") {
    pipe = await T.pipeline("translation", model.repo, opts);
    tok = pipe.tokenizer;
  } else {
    tok = await T.AutoTokenizer.from_pretrained(model.repo, { revision: model.rev, progress_callback: progress });
    lm = await T.AutoModelForCausalLM.from_pretrained(model.repo, opts);
  }
  if (lastDone) marks.download_end = round((lastDone - t0) / 1000, 2);
  const timings = { marks_s: marks };
  if (model.kind === "mt") {
    return {
      id: model.repo, runtime: "onnx", dtype: fit.dtype, timings, tagsSupported: false,
      async generate(system, user, maxTokens, src) {
        const plain = stripTags(src || user).trim();
        const s0 = performance.now();
        const out = await pipe(plain, { max_new_tokens: maxTokens });
        const ms = performance.now() - s0;
        const text = (out && out[0] && out[0].translation_text) || "";
        const n = tok(text).input_ids.dims[1];
        return { text, finish: "stop", ms: Math.round(ms), prompt_tokens: tok(plain).input_ids.dims[1], completion_tokens: n,
          ttft_s: null, prefill_tps: null, decode_tps: round(n / (ms / 1000), 1) };
      },
      async unload() { await pipe.dispose(); },
      async clearCache() { await clearOnnxCache(model.repo); },
    };
  }
  return {
    id: model.repo, runtime: "onnx", dtype: fit.dtype, timings,
    async generate(system, user, maxTokens) {
      const messages = [{ role: "system", content: system }, { role: "user", content: user }];
      const prompt = tok.apply_chat_template(messages, { add_generation_prompt: true, tokenize: false, enable_thinking: false });
      const inputs = tok(prompt, { add_special_tokens: false });
      const promptLen = inputs.input_ids.dims[1];
      let first = null, last = null, n = 0;
      const streamer = new T.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true, callback_function: () => {},
        token_callback_function: () => { n += 1; last = performance.now(); if (first === null) first = last; } });
      const s0 = performance.now();
      const out = await lm.generate({ ...inputs, max_new_tokens: maxTokens, do_sample: false, streamer });
      const s1 = performance.now();
      const total = out.dims[1] - promptLen;
      const text = tok.batch_decode(out.slice(null, [promptLen, null]), { skip_special_tokens: true })[0] || "";
      const ttft = first !== null ? (first - s0) / 1000 : null;
      const dec = first !== null && n > 1 ? (n - 1) / ((last - first) / 1000) : null;
      return { text, finish: total >= maxTokens ? "length" : "stop", ms: Math.round(s1 - s0), prompt_tokens: promptLen,
        completion_tokens: total, ttft_s: ttft !== null ? round(ttft, 3) : null,
        prefill_tps: ttft ? round(promptLen / ttft, 1) : null, decode_tps: dec ? round(dec, 1) : null };
    },
    async unload() { await lm.dispose(); },
    async clearCache() { await clearOnnxCache(model.repo); },
  };
}

async function clearOnnxCache(repo) {
  const cache = await caches.open("transformers-cache");
  for (const req of await cache.keys()) {
    if (req.url.includes("/" + repo + "/")) await cache.delete(req);
  }
}

// ---- GPU buffer watch: what each runtime really allocates (biggest single buffer, peak of the live sum) ----

export function bufferTracker() {
  let count = 0, live = 0, peak = 0, largest = 0;
  return {
    add(size) { count += 1; live += size; if (live > peak) peak = live; if (size > largest) largest = size; },
    remove(size) { live -= size; },
    reset() { count = 0; peak = live; largest = 0; },
    stats() { return { count, live, peak, largest }; },
  };
}

// Wraps deviceProto[method] and objProto.destroy to feed `tracker` with sizeOf(descriptor); false when there is no
// WebGPU or the wrap is already in place.
function watchGpu(deviceProto, method, objProto, tracker, sizeOf) {
  const mark = Symbol.for("vt-lab-gpu-watch-" + method);
  if (!deviceProto || !objProto || deviceProto[mark]) return false;
  const sizes = new WeakMap();
  const create = deviceProto[method], destroy = objProto.destroy;
  deviceProto[method] = function (desc) {
    const obj = create.call(this, desc);
    const size = sizeOf(desc);
    sizes.set(obj, size);
    tracker.add(size);
    return obj;
  };
  objProto.destroy = function () {
    const size = sizes.get(this);
    if (size !== undefined) { sizes.delete(this); tracker.remove(size); }
    return destroy.call(this);
  };
  deviceProto[mark] = true;
  return true;
}

// GPUDevice.prototype.createBuffer / GPUBuffer.prototype.destroy
export function watchGpuBuffers(deviceProto, bufferProto, tracker) {
  return watchGpu(deviceProto, "createBuffer", bufferProto, tracker, (d) => Number(d && d.size) || 0);
}

// Bytes per texel by format prefix (longest prefix wins); unknown or compressed formats count 4.
const TEXEL_BYTES = { r8: 1, rg8: 2, rgba8: 4, bgra8: 4, r16: 2, rg16: 4, rgba16: 8, r32: 4, rg32: 8, rgba32: 16,
  rgb10a2: 4, rg11b10: 4, rgb9e5: 4, depth16: 2, depth24: 4, depth32: 4, stencil8: 1 };
const TEXEL_KEYS = Object.keys(TEXEL_BYTES).sort((a, b) => b.length - a.length);

export function textureBytes(desc) {
  if (!desc || !desc.size) return 0;
  const s = desc.size;
  const dims = Array.isArray(s) ? s : [s.width, s.height, s.depthOrArrayLayers];
  const w = dims[0] || 1, h = dims[1] || 1, d = dims[2] || 1;
  const fmt = String(desc.format || "");
  const key = TEXEL_KEYS.find((k) => fmt.startsWith(k));
  const texel = key ? TEXEL_BYTES[key] : 4;
  let total = 0;
  for (let i = 0; i < (desc.mipLevelCount || 1); i++) total += Math.max(1, w >> i) * Math.max(1, h >> i) * d * texel;
  return total;
}

// GPUDevice.prototype.createTexture / GPUTexture.prototype.destroy
export function watchGpuTextures(deviceProto, textureProto, tracker) {
  return watchGpu(deviceProto, "createTexture", textureProto, tracker, textureBytes);
}

// Delete a model's files from the browser cache without loading it.
export async function deleteCached(model, info) {
  const fit = checkFit(model, info);
  if (model.runtime === "onnx") return clearOnnxCache(model.repo);
  if (model.runtime === "litert") return deleteLiteRT(model);
  const webllm = await lib(WEBLLM_URL);
  await webllm.deleteModelAllInfoInCache(fit.id, webllm.prebuiltAppConfig);
}

// Aggregate speed over calls: prefill = sum prompt tokens / sum time-to-first-token;
// decode = sum completion tokens / sum (completion tokens / per-call decode rate).
export function speedSummary(rows) {
  let pt = 0, pts = 0, ct = 0, cts = 0;
  for (const r of rows) {
    if (r.ttft_s) { pt += r.prompt_tokens; pts += r.ttft_s; }
    if (r.decode_tps) { ct += r.completion_tokens; cts += r.completion_tokens / r.decode_tps; }
  }
  return { prefill_tps: pts ? round(pt / pts, 1) : null, decode_tps: cts ? round(ct / cts, 1) : null,
    prompt_tokens: pt, completion_tokens: ct };
}

// ---- tag check: port of the essential parts of helper/vitranslate/tags.py check() ----

const TOKEN_SRC = "<(\\/?)g(\\d+)>|<x(\\d+)\\/>";
const STRAY_SRC = "(?<complete><\\s*\\/?\\s*[gx]\\s*\\d+\\s*\\/?\\s*>"
  + "|<\\/?(?:b|i|u|s|em|strong|sup|sub|span|font|br|small|mark|a|p)"
  + "(?:\\s+[A-Za-z_:][\\w:.-]*\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s\"'<>=]+))*\\s*\\/?>"
  + "|&lt;\\/?[gx]\\d+\\/?&gt;)"
  + "|(?<frag><\\/?\\s*[gx]\\s*\\d)";

function tokens(text) {
  return Array.from(text.matchAll(new RegExp(TOKEN_SRC, "g")));
}

export function stripTags(text) {
  return text.replace(new RegExp(TOKEN_SRC, "g"), (m, a, b, x) => (x ? " " : ""));
}

export function tagIds(text) {
  const g = [], x = [];
  for (const m of tokens(text)) {
    if (m[3]) x.push(Number(m[3]));
    else if (!m[1]) g.push(Number(m[2]));
  }
  return { g, x };
}

const squash = (t) => t.replace(/\s+/g, "");

function strayMarkup(src, out) {
  const plainSrc = squash(src.replace(new RegExp(TOKEN_SRC, "g"), ""));
  const whole = new RegExp("^(?:" + TOKEN_SRC + ")$");
  const res = [];
  for (const m of out.matchAll(new RegExp(STRAY_SRC, "gi"))) {
    const piece = m[0];
    if (whole.test(piece) || plainSrc.includes(squash(piece))) continue;
    res.push(piece);
  }
  return res;
}

const sortNum = (a) => a.slice().sort((p, q) => p - q);

// List of problems of `out` against the tags of `src`; empty list = tag-exact.
export function tagCheck(src, out) {
  const want = tagIds(src);
  const errors = [], stack = [], opened = [], xs = [], openAt = {};
  for (const m of tokens(out)) {
    if (m[3]) { xs.push(Number(m[3])); continue; }
    const n = Number(m[2]);
    if (m[1]) {
      if (stack.length && stack[stack.length - 1] === n) {
        stack.pop();
        if (!out.slice(openAt[n], m.index).replace(new RegExp(TOKEN_SRC, "g"), "").trim()) errors.push("empty <g" + n + ">");
      } else {
        errors.push("crossed or unopened </g" + n + ">");
        const k = stack.indexOf(n);
        if (k >= 0) stack.splice(k, 1);
      }
    } else {
      opened.push(n);
      stack.push(n);
      openAt[n] = m.index + m[0].length;
    }
  }
  for (const n of stack) errors.push("unclosed <g" + n + ">");
  const srcG = new Set(want.g), got = new Set(opened);
  const missing = sortNum([...srcG].filter((n) => !got.has(n)));
  const extra = sortNum([...got].filter((n) => !srcG.has(n)));
  const dup = sortNum([...got].filter((n) => opened.filter((v) => v === n).length > 1));
  const fmt = (a) => a.map((n) => "<g" + n + ">").join(", ");
  if (missing.length) errors.push("missing " + fmt(missing));
  if (extra.length) errors.push("invented " + fmt(extra));
  if (dup.length) errors.push("duplicated " + fmt(dup));
  const a = sortNum(xs), b = sortNum(want.x);
  if (a.join(",") !== b.join(",")) errors.push("placeholders differ: want [" + b.join(", ") + "] got [" + a.join(", ") + "]");
  for (const p of strayMarkup(src, out)) errors.push("stray markup: " + p);
  return errors;
}

// Light version of qa.strip_leaks: drop think blocks, surrounding quotes and an answer label.
export function cleanAnswer(src, out) {
  let t = out;
  if (t.includes("</think>")) t = t.slice(t.lastIndexOf("</think>") + 8);
  t = t.replace(/<think>[\s\S]*$/, "").trim();
  t = t.replace(/^(?:Vietnamese|Bản dịch|Tiếng Việt)\s*:\s*/i, "").trim();
  const q = { "\"": "\"", "\u201c": "\u201d", "'": "'" };
  if (t.length >= 2 && q[t[0]] === t[t.length - 1] && !q[src.trim()[0]]) t = t.slice(1, -1).trim();
  return t;
}
