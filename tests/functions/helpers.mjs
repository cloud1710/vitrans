// Test doubles for the Pages Functions (functions/): an in-memory KV namespace, a scripted Workers AI binding, a
// Turnstile siteverify fake, a request-context builder, a synthetic pack bundle (raw pack files, the shape
// tools/bundle_packs.py writes) and an in-memory D1 database with the repo's migrations. Synthetic text only; no
// network.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

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

// ---------------------------------------------------------------- Cloudflare Access

const enc = new TextEncoder();
export const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
export const ACCESS_AUD = "4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2";
export const ADMIN_EMAIL = "reviewer@example.org";

export function rsaKey() {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

/** The public key as Access serves it in its certs: {kid, kty, alg, use, e, n}. */
export async function publicJwk(pair, kid) {
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kid, kty: jwk.kty, alg: "RS256", use: "sig", e: jwk.e, n: jwk.n };
}

export async function signJwt(privateKey, header, claims) {
  const head = b64url(enc.encode(JSON.stringify(header)));
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(head + "." + body)));
  return head + "." + body + "." + b64url(sig);
}

let accessTeams = 0;

/** A Cloudflare Access team of its own (the certs cache is per isolate and per team): its signing key, its certs
 * endpoint as a fetch double (records the URLs; certsDown: every fetch fails) and token(claims over, {privateKey,
 * kid, alg}) -> a JWT as Access writes it into Cf-Access-Jwt-Assertion, valid for an hour after nowMs. */
export async function accessTeam({ certsDown = false, nowMs = Date.UTC(2026, 9, 14, 12, 0, 0) } = {}) {
  accessTeams += 1;
  const team = "vt-test-" + accessTeams;
  const origin = "https://" + team + ".cloudflareaccess.com";
  const key = await rsaKey();
  const certs = { keys: [await publicJwk(key, "k1")] };
  const fetches = [];
  const fetch = async (url) => {
    fetches.push(String(url));
    if (certsDown) throw new TypeError("fetch failed");
    if (String(url) !== origin + "/cdn-cgi/access/certs") return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ keys: certs.keys, public_cert: { kid: "k1", cert: "PEM" },
      public_certs: [{ kid: "k1", cert: "PEM" }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const t = Math.floor(nowMs / 1000);
  const claims = (over = {}) => ({ aud: [ACCESS_AUD], email: ADMIN_EMAIL, exp: t + 3600, iat: t - 10, nbf: t - 10,
    iss: origin, type: "app", identity_nonce: "nonce", sub: "0b5a2c1e-user", country: "VN", ...over });
  const token = (over = {}, { privateKey = key.privateKey, kid = "k1", alg = "RS256" } = {}) =>
    signJwt(privateKey, { alg, kid, typ: "JWT" }, claims(over));
  return { team, origin, key, certs, fetch, fetches, token };
}

// ---------------------------------------------------------------- D1

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

function sqlValue(v) {
  if (v === undefined) throw new TypeError("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

const READS = /^\s*(select|with|pragma)\b/i;

class FakeStatement {
  constructor(d1, sql, params = []) {
    this.d1 = d1;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) {
    return new FakeStatement(this.d1, this.sql, values.map(sqlValue));
  }

  exec() {
    this.d1.statements.push({ sql: this.sql, params: this.params });
    if (this.d1.failWrites && !READS.test(this.sql)) throw new Error("D1_ERROR: database is overloaded");
    const st = this.d1.db.prepare(this.sql);
    if (READS.test(this.sql)) {
      const results = st.all(...this.params).map((r) => ({ ...r }));
      return { success: true, results, meta: { changes: 0, rows_read: results.length } };
    }
    const r = st.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }

  async run() {
    return this.exec();
  }

  async all() {
    return this.exec();
  }

  async first(column) {
    const row = this.exec().results[0];
    if (!row) return null;
    return column === undefined ? row : row[column];
  }

  async raw() {
    return this.exec().results.map((r) => Object.values(r));
  }
}

/** An in-memory D1 database (the binding's prepare / bind / first / all / run / raw, batch in one transaction, exec)
 * over Node's built-in SQLite, with migrations/*.sql applied in name order; records every statement it runs. */
export class FakeD1 {
  constructor({ migrate = true } = {}) {
    this.db = new DatabaseSync(":memory:");
    this.statements = [];
    this.failWrites = false;
    if (migrate) {
      for (const name of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
        this.db.exec(readFileSync(new URL(name, MIGRATIONS), "utf8"));
      }
    }
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const out = statements.map((s) => s.exec());
      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async exec(sql) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }

  /** {table: rows} of every table: what the database holds. */
  dump() {
    const out = {};
    for (const { name } of this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE " +
      "'sqlite_%' ORDER BY name").all()) {
      out[name] = this.db.prepare("SELECT * FROM \"" + name + "\"").all().map((r) => ({ ...r }));
    }
    return out;
  }
}
