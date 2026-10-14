// The page's LiteRT-LM runtime (web/engine/runtime.js): pinned library and model files shared with /lab/, the model
// function of the engine contract (thinking off, greedy, output cap, abort), the model file cache and load errors.
// A fake LiteRT-LM library, a fake Cache Storage and a fake fetch: no network, no GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as runtime from "../runtime.js";
import * as lab from "../../lab/core.js";

const { LITERT_VERSION, LITERT_URL, LITERT_WASM_BASE, LITERT_CACHE, LITERT_MODELS, litertModel, litertModelUrl,
  createModel, isModelCached, deleteModel, RuntimeError } = runtime;
const MB = 1024 * 1024;
const E2B = litertModel("litert-e2b");
const E4B = litertModel("litert-e4b");

// ---- fakes ----

function fakeCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) {
      const m = new Map();
      stores.set(name, {
        raw: m,
        async match(url) { return m.has(url) ? new Response(m.get(url)) : undefined; },
        async put(url, resp) { m.set(url, new Uint8Array(await resp.arrayBuffer())); },
        async delete(url) { return m.delete(url); },
      });
    }
    return stores.get(name);
  };
  return { open, stores };
}

function fakeFetch(body, status) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (status && status !== 200) return new Response("no", { status });
    return new Response(body, { headers: { "content-length": String(body.byteLength) } });
  };
  fn.calls = calls;
  return fn;
}

// A conversation answers through opts.reply(config, text) -> { text, tokens, thought? }; opts.hang leaves
// sendMessage pending until cancel().
function fakeLib(opts) {
  const o = opts || {};
  const log = { loads: [], engines: [], convs: [] };
  const lib = {
    async loadLiteRtLm(path) {
      log.loads.push(path);
      if (o.loadFails) throw new Error("wasm failed to load");
    },
    Engine: {
      async create(settings) {
        if (o.createHangs) return new Promise(() => {});
        const reader = settings.model.getReader();
        let n = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          n += value.byteLength;
        }
        const engine = {
          settings, streamed: n, deleted: false, wasm: { HEAPU8: { byteLength: 1350 * MB } },
          async createConversation(config) {
            let release = null;
            const conv = {
              config, sent: null, cancelled: false, deleted: false,
              async sendMessage(text) {
                conv.sent = text;
                if (o.hang) {
                  await new Promise((r) => { release = r; });
                  return { role: "assistant", content: [{ type: "text", text: "partial" }] };
                }
                const r = (o.reply || (() => ({ text: "Xin chào", tokens: 3 })))(config, text);
                conv.tokens = r.tokens;
                const msg = { role: "assistant", content: [{ type: "text", text: r.text }] };
                if (r.thought) msg.channels = { thought: r.thought };
                return msg;
              },
              async getBenchmarkInfo() {
                return { lastDecodeTokenCount: conv.tokens || 0, lastPrefillTokenCount: 12,
                  lastDecodeTokensPerSecond: 60, lastPrefillTokensPerSecond: 900, timeToFirstTokenInSecond: 0.1 };
              },
              cancel() { conv.cancelled = true; if (release) release(); },
              async delete() { conv.deleted = true; },
            };
            log.convs.push(conv);
            return conv;
          },
          async delete() { engine.deleted = true; },
        };
        log.engines.push(engine);
        return engine;
      },
    },
  };
  return { lib, log };
}

const FEATURES = { relaxedSimd: true, jspi: true };
const SYS = "You translate English documents into Vietnamese.";
const msgs = (user) => [{ role: "system", content: SYS }, { role: "user", content: user }];

function deps(over) {
  const { lib, log } = fakeLib(over && over.lib);
  const d = Object.assign({ lib, caches: fakeCaches(), fetch: fakeFetch(new Uint8Array(4096)), features: FEATURES },
    over && over.deps);
  return { d, log };
}

// ---- constants shared with /lab/ ----

test("the runtime pins LiteRT-LM 0.17.1 on jsDelivr and the Gemma 4 E2B / E4B web builds", () => {
  assert.equal(LITERT_VERSION, "0.17.1");
  assert.equal(LITERT_URL, "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.1/+esm");
  assert.equal(LITERT_WASM_BASE, "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.1/wasm/");
  assert.equal(LITERT_CACHE, "vt-lab-litert");  // the lab's cache: a model the lab downloaded is not fetched again
  assert.deepEqual(LITERT_MODELS.map((m) => m.key), ["litert-e2b", "litert-e4b"]);
  assert.equal(E2B.id, "gemma4:e2b-web");
  assert.equal(E4B.id, "gemma4:e4b-web");
  assert.equal(E2B.label, "Gemma 4 E2B");
  assert.equal(E2B.bytes, 2008432640);
  assert.equal(E4B.bytes, 2969059328);
  assert.match(E2B.rev, /^[0-9a-f]{40}$/);
  assert.equal(litertModelUrl(E2B), "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/"
    + E2B.rev + "/gemma-4-E2B-it-web.litertlm");
  assert.equal(litertModel("nope"), null);
});

test("/lab/ imports the shared runtime instead of its own copy", () => {
  for (const name of ["LITERT_VERSION", "LITERT_URL", "LITERT_WASM_BASE", "LITERT_CACHE", "litertModelUrl",
    "litertWasmFile", "litertConversationConfig", "litertResult", "wasmFeatures"]) {
    assert.equal(lab[name], runtime[name], name);
  }
  assert.equal(lab.MODELS.find((m) => m.key === "litert-e2b"), E2B);
  assert.equal(lab.MODELS.find((m) => m.key === "litert-e4b"), E4B);
});

// ---- loading ----

test("the first model loads the library's wasm build once and streams the file from Hugging Face into the cache", async () => {
  const { d, log } = deps();
  const seen = [];
  const model = await createModel({ key: "litert-e2b", deps: d, onProgress: (p) => seen.push(p) });
  assert.deepEqual(log.loads, [LITERT_WASM_BASE + "litertlm_wasm_internal.js"]);
  assert.equal(d.fetch.calls.length, 1);
  assert.equal(d.fetch.calls[0].url, litertModelUrl(E2B));
  assert.equal(log.engines[0].streamed, 4096);
  assert.equal(log.engines[0].settings.benchmarkEnabled, true);
  assert.equal(log.engines[0].settings.mainExecutorSettings.maxNumTokens, runtime.CTX_TOKENS);
  const stored = (await d.caches.open(LITERT_CACHE)).raw.get(litertModelUrl(E2B));
  assert.equal(stored.byteLength, 4096);
  assert.equal(model.key, "litert-e2b");
  assert.equal(model.id, "gemma4:e2b-web");
  assert.equal(model.info.cache, "stored");
  // progress: the download in bytes, then the warm-up; fractions never go back
  const dl = seen.filter((p) => p.phase === "download");
  assert.ok(dl.length >= 1 && dl[dl.length - 1].loaded === 4096 && dl[dl.length - 1].total === 4096);
  assert.ok(seen.some((p) => p.phase === "warmup"));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].fraction >= seen[i - 1].fraction, "monotonic");
  // the warm-up call compiled the shaders with a tiny translation and its conversation is gone
  assert.equal(log.convs.length, 1);
  assert.ok(log.convs[0].deleted);
  // a second load in the same page reads the cache: no new download, no second wasm load
  const again = await createModel({ key: "litert-e2b", deps: Object.assign({}, d, { fetch: fakeFetch(new Uint8Array(1), 500) }) });
  assert.equal(log.loads.length, 1);
  assert.equal(again.info.cache, "hit");
});

test("isModelCached / deleteModel look at the shared Cache Storage entry", async () => {
  const { d } = deps();
  assert.equal(await isModelCached(E2B, d), false);
  await createModel({ key: "litert-e2b", deps: d });
  assert.equal(await isModelCached(E2B, d), true);
  assert.equal(await isModelCached(E4B, d), false);
  await deleteModel(E2B, d);
  assert.equal(await isModelCached(E2B, d), false);
  // no Cache Storage (private mode): never throws
  assert.equal(await isModelCached(E2B, Object.assign({}, d, { caches: null })), false);
});

test("load failures carry a code: unknown model, wasm build, model download, stalled engine", async () => {
  await assert.rejects(createModel({ key: "nope", deps: deps().d }), (e) => e instanceof RuntimeError && e.code === "unknown_model");
  await assert.rejects(createModel({ key: "litert-e2b", deps: deps({ lib: { loadFails: true } }).d }),
    (e) => e instanceof RuntimeError && e.code === "runtime_load_failed" && /wasm failed/.test(e.message));
  await assert.rejects(createModel({ key: "litert-e2b", deps: deps({ deps: { fetch: fakeFetch(new Uint8Array(1), 404) } }).d }),
    (e) => e instanceof RuntimeError && e.code === "model_download_failed" && /404/.test(e.message));
  // Safari with LiteRT-LM 0.17.1 can hang instead of failing: no progress for stallMs -> a clear error
  await assert.rejects(createModel({ key: "litert-e2b", stallMs: 30, deps: deps({ lib: { createHangs: true } }).d }),
    (e) => e instanceof RuntimeError && e.code === "runtime_stalled");
});

test("an abort while loading stops the download and rejects with AbortError", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(createModel({ key: "litert-e2b", signal: ctrl.signal, deps: deps().d }),
    (e) => e.name === "AbortError");
});

// ---- the model function (engine contract) ----

test("a call sends the system prompt as preface, turns thinking off, decodes greedily and caps the output", async () => {
  const { d, log } = deps({ lib: { reply: () => ({ text: "Khối u gồm tế bào hình thoi.", tokens: 9, thought: "" }) } });
  const model = await createModel({ key: "litert-e2b", deps: d });
  const out = await model(msgs("Translate:\nThe tumour is composed of spindle cells."), { temperature: 0, maxTokens: 300, think: false });
  assert.equal(out, "Khối u gồm tế bào hình thoi.");
  const conv = log.convs[log.convs.length - 1];
  assert.equal(conv.sent, "Translate:\nThe tumour is composed of spindle cells.");
  assert.deepEqual(conv.config.preface.messages, [{ role: "system", content: SYS }]);
  assert.equal(conv.config.preface.extra_context.enable_thinking, false);
  assert.equal(conv.config.sessionConfig.maxOutputTokens, 300);
  assert.deepEqual(conv.config.sessionConfig.samplerParams, { type: 1, k: 1, p: 1, temperature: 1, seed: 0 });
  assert.ok(conv.deleted, "one conversation per call, deleted after it");
});

test("an answer cut at maxTokens is unusable and comes back empty (as the helper's Ollama client does)", async () => {
  const { d } = deps({ lib: { reply: (c) => ({ text: "Khối u gồm tế bào", tokens: c.sessionConfig.maxOutputTokens }) } });
  const model = await createModel({ key: "litert-e2b", deps: d });
  assert.equal(await model(msgs("Translate:\nx"), { maxTokens: 20 }), "");
});

test("a temperature above 0 samples (top-p) at that temperature; the thought channel never reaches the answer", async () => {
  const { d, log } = deps({ lib: { reply: () => ({ text: "Câu trả lời", tokens: 2, thought: "thinking..." }) } });
  const model = await createModel({ key: "litert-e2b", deps: d });
  assert.equal(await model(msgs("hi"), { temperature: 0.7, maxTokens: 50 }), "Câu trả lời");
  const conv = log.convs[log.convs.length - 1];
  assert.equal(conv.config.sessionConfig.samplerParams.type, 2);
  assert.equal(conv.config.sessionConfig.samplerParams.temperature, 0.7);
});

test("earlier messages other than the last user turn go into the preface", async () => {
  const { d, log } = deps();
  const model = await createModel({ key: "litert-e2b", deps: d });
  const m = [{ role: "system", content: "S" }, { role: "user", content: "u1" }, { role: "assistant", content: "a1" },
    { role: "user", content: "u2" }];
  await model(m, { maxTokens: 10 });
  const conv = log.convs[log.convs.length - 1];
  assert.deepEqual(conv.config.preface.messages, m.slice(0, 3));
  assert.equal(conv.sent, "u2");
});

test("abort: before a call nothing is sent; during a call the generation is cancelled and the conversation freed", async () => {
  // this fake's calls hang until cancelled, so the model is loaded without the warm-up call
  const { d, log } = deps({ lib: { hang: true } });
  const model = await createModel({ key: "litert-e2b", deps: d, warmup: false });
  const before = new AbortController();
  before.abort();
  await assert.rejects(model(msgs("x"), { maxTokens: 10, signal: before.signal }), (e) => e.name === "AbortError");
  assert.equal(log.convs.length, 0);
  const during = new AbortController();
  const p = model(msgs("x"), { maxTokens: 10, signal: during.signal });
  await new Promise((r) => setTimeout(r, 5));
  during.abort();
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.equal(log.convs[0].cancelled, true);
  assert.equal(log.convs[0].deleted, true);
});

test("unload frees the engine", async () => {
  const { d, log } = deps();
  const model = await createModel({ key: "litert-e2b", deps: d });
  await model.unload();
  assert.equal(log.engines[0].deleted, true);
});
