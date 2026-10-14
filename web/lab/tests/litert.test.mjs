// Third runtime: Google LiteRT-LM (JavaScript API) with Gemma 4 E2B / E4B web builds. Pure parts only: model list
// entries, pinned URLs, wasm build choice, conversation config (thinking off, greedy), result rows, fit checks and the
// GPU buffer tracker. No network, no GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS, checkFit, probeBytes, unfitFor, LITERT_VERSION, LITERT_URL, LITERT_WASM_BASE, litertModelUrl,
  litertWasmFile, litertConversationConfig, litertResult, bufferTracker, watchGpuBuffers, textureBytes,
  watchGpuTextures } from "../core.js";

const MB = 1024 * 1024;
const GIB = 1024 * MB;
const E2B = MODELS.find((m) => m.key === "litert-e2b");
const E4B = MODELS.find((m) => m.key === "litert-e4b");

function info(cls, bind, features) {
  return {
    device_class: cls || "iPhone",
    webgpu: { available: true, adapter: {}, features: features || ["shader-f16"],
      limits: { maxBufferSize: bind || GIB, maxStorageBufferBindingSize: bind || GIB,
        maxStorageBuffersPerShaderStage: 10, maxComputeWorkgroupStorageSize: 32768 } },
  };
}

test("Gemma 4 E2B and E4B are listed on the litert runtime with pinned web builds", () => {
  for (const m of [E2B, E4B]) {
    assert.ok(m, "model listed");
    assert.equal(m.runtime, "litert");
    assert.match(m.repo, /^litert-community\/gemma-4-E[24]B-it-litert-lm$/);
    assert.match(m.rev, /^[0-9a-f]{40}$/);
    assert.match(m.file, /^gemma-4-E[24]B-it-web\.litertlm$/);
    assert.ok(Number.isInteger(m.bytes) && m.bytes > 1e9);
    assert.ok(Math.abs(m.downloadGB - m.bytes / 1e9) < 0.01, "downloadGB matches the file size");
    assert.ok(m.memMB > 0 && m.largestMB > 0 && m.largestMB < m.memMB);
    assert.ok(m.heapMB > 0, "wasm heap measured");
  }
  assert.ok(E2B.memMB < E4B.memMB && E2B.bytes < E4B.bytes);
});

test("library, wasm and model URLs name exact versions and commits", () => {
  assert.match(LITERT_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(LITERT_URL, "https://cdn.jsdelivr.net/npm/@litert-lm/core@" + LITERT_VERSION + "/+esm");
  assert.equal(LITERT_WASM_BASE, "https://cdn.jsdelivr.net/npm/@litert-lm/core@" + LITERT_VERSION + "/wasm/");
  assert.equal(litertModelUrl(E2B),
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/" + E2B.rev + "/gemma-4-E2B-it-web.litertlm");
});

test("the wasm build follows the library's own choice (relaxed SIMD x JSPI) unless a variant is forced", () => {
  assert.equal(litertWasmFile({ relaxedSimd: true, jspi: true }), "litertlm_wasm_internal.js");
  assert.equal(litertWasmFile({ relaxedSimd: true, jspi: false }), "litertlm_wasm_asyncify_internal.js");
  assert.equal(litertWasmFile({ relaxedSimd: false, jspi: true }), "litertlm_wasm_compat_internal.js");
  assert.equal(litertWasmFile({ relaxedSimd: false, jspi: false }), "litertlm_wasm_compat_asyncify_internal.js");
  // forcing the Safari path on Chrome (no JSPI, no relaxed SIMD)
  assert.equal(litertWasmFile({ relaxedSimd: true, jspi: true }, "compat-asyncify"), "litertlm_wasm_compat_asyncify_internal.js");
  assert.equal(litertWasmFile({ relaxedSimd: true, jspi: true }, "asyncify"), "litertlm_wasm_asyncify_internal.js");
  assert.equal(litertWasmFile({ relaxedSimd: true, jspi: true }, "bogus"), "litertlm_wasm_internal.js");
});

test("the conversation config turns thinking off, decodes greedily and caps the output", () => {
  const c = litertConversationConfig("SYS", 300);
  assert.equal(c.preface.extra_context.enable_thinking, false);
  assert.deepEqual(c.preface.messages, [{ role: "system", content: "SYS" }]);
  assert.equal(c.sessionConfig.maxOutputTokens, 300);
  assert.equal(c.sessionConfig.samplerParams.k, 1);
  assert.equal(c.sessionConfig.samplerParams.type, 1);  // SamplerType.TOP_K
  assert.ok(!c.enableConstrainedDecoding);
});

test("a response becomes a lab row: text parts joined, thought channel measured, speeds from the benchmark", () => {
  const bench = { lastPrefillTokensPerSecond: 812.44, lastPrefillTokenCount: 640, lastDecodeTokensPerSecond: 61.27,
    lastDecodeTokenCount: 22, timeToFirstTokenInSecond: 0.7891 };
  const r = litertResult({ role: "assistant", content: [{ type: "text", text: "Khối u " }, { type: "text", text: "gồm" }] },
    bench, 1234.6, 100);
  assert.equal(r.text, "Khối u gồm");
  assert.equal(r.finish, "stop");
  assert.equal(r.ms, 1235);
  assert.equal(r.prompt_tokens, 640);
  assert.equal(r.completion_tokens, 22);
  assert.equal(r.ttft_s, 0.789);
  assert.equal(r.prefill_tps, 812.4);
  assert.equal(r.decode_tps, 61.3);
  assert.equal(r.thought_chars, 0);
  // a string content, a thought channel, and the cap reached
  const t = litertResult({ content: "x", channels: { thought: "abc" } }, { ...bench, lastDecodeTokenCount: 100 }, 10, 100);
  assert.equal(t.text, "x");
  assert.equal(t.thought_chars, 3);
  assert.equal(t.finish, "length");
  // no benchmark info: nulls, never NaN
  const n = litertResult({ content: [] }, null, 5, 10);
  assert.equal(n.text, "");
  assert.equal(n.prefill_tps, null);
  assert.equal(n.decode_tps, null);
  assert.equal(n.prompt_tokens, 0);
});

test("checkFit: a buffer limit below the largest tensor stops LiteRT, a normal phone gets the iOS warnings", () => {
  const small = checkFit(E2B, info("desktop", (E2B.largestMB - 1) * MB));
  assert.equal(small.ok, false);
  assert.ok(small.reasons.some((t) => t.includes(String(E2B.largestMB))));
  // WebLLM's 128 MB fallback binding (no 1 GiB buffers) is enough for LiteRT-LM's measured buffers
  assert.equal(checkFit(E2B, info("iPhone", 128 * MB)).ok, E2B.largestMB <= 128);
  const phone = checkFit(E2B, info("iPhone", GIB));
  assert.equal(phone.ok, true);
  assert.equal(phone.memMB, E2B.memMB);
  assert.equal(phone.id, E2B.repo + "/" + E2B.file);
  assert.ok(phone.warnings.some((t) => /iOS|Safari/.test(t)));
  const pc = checkFit(E2B, info("desktop", 4 * GIB));
  assert.equal(pc.ok, true);
  assert.ok(!pc.warnings.some((t) => /32 bit/.test(t)));
  // no shader-f16: still allowed, but the warning must not promise a 32-bit build that does not exist
  const noF16 = checkFit(E2B, info("desktop", 4 * GIB, []));
  assert.equal(noF16.ok, true);
  assert.ok(!noF16.warnings.some((t) => /32 bit/.test(t)));
  assert.ok(noF16.warnings.some((t) => /shader-f16/.test(t)));
});

test("the memory probe covers LiteRT's GPU memory plus its wasm heap (one RAM on phones)", () => {
  const fit = checkFit(E2B, info());
  assert.equal(fit.heapMB, E2B.heapMB);
  assert.equal(probeBytes(fit), (E2B.memMB + E2B.heapMB) * MB);
  // the other runtimes keep a GPU-only probe
  const mlc2b = MODELS.find((m) => m.key === "mlc-2b");
  assert.equal(checkFit(mlc2b, info()).heapMB, 0);
  assert.equal(probeBytes(checkFit(mlc2b, info())), mlc2b.memMB * MB);
  // a failed 2B WebLLM probe rules out whatever needs as much in total or more
  const failed = { "mlc-2b": { model: "mlc-2b", bytes: mlc2b.memMB * MB, reason: "killed" } };
  const e2b = unfitFor(E2B.key, probeBytes(fit), failed);
  assert.equal(e2b === null, E2B.memMB + E2B.heapMB < mlc2b.memMB);
  assert.equal(unfitFor(E4B.key, probeBytes(checkFit(E4B, info())), failed), failed["mlc-2b"]);
});

// ---- GPU buffer watch ----

test("bufferTracker keeps live, peak and largest sizes", () => {
  const t = bufferTracker();
  t.add(100); t.add(300); t.remove(100); t.add(50);
  assert.deepEqual(t.stats(), { count: 3, live: 350, peak: 400, largest: 300 });
  t.reset();
  assert.deepEqual(t.stats(), { count: 0, live: 350, peak: 350, largest: 0 });
});

test("watchGpuBuffers counts createBuffer and destroy once per buffer on the given prototypes", () => {
  class Buf { constructor(size) { this.size = size; } destroy() { this.gone = true; } }
  class Dev { createBuffer(d) { return new Buf(d.size); } }
  const t = bufferTracker();
  assert.equal(watchGpuBuffers(Dev.prototype, Buf.prototype, t), true);
  assert.equal(watchGpuBuffers(Dev.prototype, Buf.prototype, t), false);  // installed once
  const d = new Dev();
  const a = d.createBuffer({ size: 64 }), b = d.createBuffer({ size: 256 });
  a.destroy(); a.destroy();
  assert.equal(b.size, 256);
  assert.deepEqual(t.stats(), { count: 2, live: 256, peak: 320, largest: 256 });
  assert.equal(watchGpuBuffers(null, null, t), false);  // no WebGPU
});

// LiteRT-LM logs "prefer_texture_weights: true": weights may sit in textures, which createBuffer does not see.
test("textureBytes sizes a texture from its descriptor (dict or array size, texel format, mip levels)", () => {
  assert.equal(textureBytes({ size: { width: 1024, height: 512 }, format: "rgba16float" }), 1024 * 512 * 8);
  assert.equal(textureBytes({ size: [256, 256, 4], format: "rgba32float" }), 256 * 256 * 4 * 16);
  assert.equal(textureBytes({ size: [8, 8], format: "r8unorm" }), 64);
  assert.equal(textureBytes({ size: [8, 8], format: "rg8unorm" }), 128);
  assert.equal(textureBytes({ size: [8, 8], format: "rgba8unorm", mipLevelCount: 2 }), 8 * 8 * 4 + 4 * 4 * 4);
  assert.equal(textureBytes({ size: [8, 8], format: "depth24plus" }), 256);
  assert.equal(textureBytes({ size: [8, 8], format: "something-new" }), 256);  // unknown format: 4 bytes per texel
  assert.equal(textureBytes(null), 0);
});

test("watchGpuTextures counts createTexture / destroy with its own tracker", () => {
  class Tex { destroy() {} }
  class Dev { createTexture() { return new Tex(); } }
  const t = bufferTracker();
  assert.equal(watchGpuTextures(Dev.prototype, Tex.prototype, t), true);
  assert.equal(watchGpuTextures(Dev.prototype, Tex.prototype, t), false);
  const d = new Dev();
  const a = d.createTexture({ size: [16, 16], format: "rgba32float" });
  d.createTexture({ size: [4, 4], format: "r32float" });
  a.destroy();
  assert.deepEqual(t.stats(), { count: 2, live: 64, peak: 16 * 16 * 16 + 64, largest: 16 * 16 * 16 });
});
