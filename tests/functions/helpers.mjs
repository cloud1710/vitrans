// Test doubles for the Pages Functions (functions/): an in-memory KV namespace, a scripted Workers AI binding, a
// Turnstile siteverify fake, a request-context builder and a synthetic pack bundle (raw pack files, the shape
// tools/bundle_packs.py writes). Synthetic text only; no network.

export const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
export const TEST_SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789";
export const ORIGIN = "https://vitrans.pages.dev";
export const MODEL = "@cf/google/gemma-4-26b-a4b-it";

/** In-memory KV with the binding's get / put shape; records puts; failPuts makes put throw (KV 429). */
export class FakeKV {
  constructor() {
    this.map = new Map();
    this.puts = [];
    this.failPuts = false;
  }

  async get(key) {
    return this.map.has(key) ? this.map.get(key).value : null;
  }

  async put(key, value, opts = {}) {
    if (this.failPuts) throw new Error("KV PUT failed: 429 Too Many Requests");
    this.puts.push({ key, value: String(value), opts });
    this.map.set(key, { value: String(value), opts });
  }
}

/** A Workers AI chat answer in the binding's OpenAI-compatible shape. */
export function chatAnswer(text, { prompt = 100, completion = 20, cached = 0, finish = "stop", reasoning = null } = {}) {
  const message = { role: "assistant", content: text, refusal: null };
  if (reasoning !== null) message.reasoning_content = reasoning;
  return { id: "chatcmpl-test", object: "chat.completion", created: 1, model: MODEL,
    choices: [{ index: 0, message, finish_reason: finish, logprobs: null }],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion,
      prompt_tokens_details: { cached_tokens: cached } } };
}

/** A scripted env.AI: reply(inputs, options, n) -> answer object (or throws); records every call. */
export function fakeAI(reply) {
  const calls = [];
  return {
    calls,
    async run(model, inputs, options) {
      calls.push({ model, inputs, options });
      return reply(inputs, options, calls.length);
    },
  };
}

/** The user message's text to translate ("Translate:\n<tagged>" is the core's last line). */
export function sourceOf(inputs) {
  const user = inputs.messages[inputs.messages.length - 1].content;
  const i = user.lastIndexOf("Translate:\n");
  return i >= 0 ? user.slice(i + "Translate:\n".length) : user;
}

/** An AI binding that "translates" by prefixing every word run: keeps tags, numbers and spacing. */
export function echoAI(opts = {}) {
  return fakeAI((inputs) => chatAnswer(opts.answer ? opts.answer(sourceOf(inputs), inputs) : "Bản dịch: " +
    sourceOf(inputs), opts.usage || {}));
}

/** fetch double for siteverify: result object or function(body) -> result; records the posted bodies. */
export function fakeSiteverify(result) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    const r = typeof result === "function" ? result(body) : result;
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

export const PASS = { success: true, challenge_ts: "2026-10-14T00:00:00Z", hostname: "vitrans.pages.dev",
  "error-codes": [], metadata: {} };
export const TEST_PASS = { success: true, challenge_ts: "2026-10-14T00:00:00Z", hostname: "example.com",
  "error-codes": [], metadata: { result_with_testing_key: true } };
export const FAIL = { success: false, "error-codes": ["invalid-input-response"] };

/** env of the Pages project: bindings, secrets and (string) vars; overrides win. */
export function makeEnv(overrides = {}) {
  return { AI: echoAI(), COUNTERS: new FakeKV(), TURNSTILE_SECRET: TEST_TURNSTILE_SECRET,
    SESSION_SECRET: TEST_SESSION_SECRET, MODEL, ...overrides };
}

/** A Pages Functions context {request, env, params, data, waitUntil, next} for one request. */
export function makeCtx({ method = "POST", path = "/api/v1/translate", body = undefined, raw = undefined,
  headers = {}, env = makeEnv(), ip = "203.0.113.7", origin = ORIGIN } = {}) {
  const h = new Headers(headers);
  if (ip !== null && !h.has("CF-Connecting-IP")) h.set("CF-Connecting-IP", ip);
  if (origin !== null && !h.has("Origin") && method !== "GET") h.set("Origin", origin);
  let payload = raw;
  if (payload === undefined && body !== undefined) {
    payload = JSON.stringify(body);
    if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
  }
  const request = new Request(ORIGIN + path, { method, headers: h, body: payload });
  const waits = [];
  return { request, env, params: {}, data: {}, waitUntil: (p) => waits.push(p), next: async () => new Response(null,
    { status: 404 }), waits };
}

export async function readJson(res) {
  return JSON.parse(await res.text());
}

// ---------------------------------------------------------------- synthetic pack bundle

const PACK_JSON = JSON.stringify({ id: "alpha", version: "1.0.0", name: "Alpha y khoa", detect: ["biopsy", "tumour"] });
const CHILD_JSON = JSON.stringify({ id: "alpha-kid", version: "0.2.0", name: "Alpha con", parent: "alpha",
  detect: ["ductal", "lobular"] });

export const BUNDLE_TEXTS = {
  "_style/pack.json": JSON.stringify({ id: "_style", version: "0.1.2", name: "Văn phong chung", detect: [] }) + "\n",
  "_style/prompt.md": "Quy tắc hành văn (synthetic).\n",
  "alpha@1.0.0/pack.json": PACK_JSON + "\n",
  "alpha@1.0.0/prompt.md": "Văn phong giải phẫu bệnh (synthetic).\n",
  // a BOM, as Excel writes it: kept by decodeText, dropped by the CSV reader
  "alpha@1.0.0/glossary.csv": "﻿en,vi,note\nbiopsy,sinh thiết,\ntumour,u,\nlymph node,hạch bạch huyết,\n",
  "alpha@1.0.0/rules.json": JSON.stringify({ term_fixes: [{ en: "tumour", vi: "u", wrong: ["khối bướu"] }] }),
  "alpha-kid@0.2.0/pack.json": CHILD_JSON + "\n",
  "alpha-kid@0.2.0/glossary.csv": "en,vi,note\nductal,ống tuyến,\nlobular,tiểu thùy,\ncore needle,kim lõi,\n",
};

export const MANIFEST = {
  format: 1,
  idf: { biopsy: 1.4, tumour: 1.4, "lymph node": 1.4, ductal: 1.4, lobular: 1.4, "core needle": 1.4 },
  packs: [
    { id: "alpha", name: "Alpha y khoa", version: "1.0.0", parent: null, file: "alpha-1.0.0.zip",
      sha256: "a".repeat(64), size: 10, detect: ["biopsy", "tumour"],
      profile: { biopsy: 2.8, tumour: 2.8, "lymph node": 1.4 } },
    { id: "alpha-kid", name: "Alpha con", version: "0.2.0", parent: "alpha", file: "alpha-kid-0.2.0.zip",
      sha256: "b".repeat(64), size: 10, detect: ["ductal", "lobular"],
      profile: { ductal: 2.8, lobular: 2.8, "core needle": 1.4 } },
  ],
};

/** The bundle tools/bundle_packs.py writes: {format, source, manifest, files: {"<id>@<version>/<file>" |
 * "_style/<file>": base64 of the file's bytes}}; two packs (a parent and its child) plus the style pack, synthetic
 * terms only. */
export function syntheticBundle(texts = BUNDLE_TEXTS, manifest = MANIFEST) {
  const files = {};
  for (const [k, v] of Object.entries(texts)) files[k] = Buffer.from(v, "utf8").toString("base64");
  return { format: 1, source: "tests", manifest: JSON.parse(JSON.stringify(manifest)), files };
}

/** Run fn with console.* replaced by recorders; returns [result, lines] (every argument stringified). */
export async function withConsoleSpy(fn) {
  const names = ["log", "info", "warn", "error", "debug", "trace"];
  const saved = Object.fromEntries(names.map((n) => [n, console[n]]));
  const lines = [];
  for (const n of names) {
    console[n] = (...args) => lines.push(n + ": " + args.map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a) + " " + String(a && a.stack ? a.stack : "");
      } catch (err) {
        return String(a);
      }
    }).join(" "));
  }
  try {
    return [await fn(), lines];
  } finally {
    Object.assign(console, saved);
  }
}
