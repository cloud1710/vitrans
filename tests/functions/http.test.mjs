// HTTP layer of the Pages Functions: JSON answers that are never cached, strict JSON-text bodies (anything else --
// images, binary, forms -- is refused before it is read), same-origin POSTs, method checks, configuration parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, json, fail, readJsonBody, checkOrigin, handle } from "../../functions/_lib/http.js";
import { loadConfig, DEFAULTS } from "../../functions/_lib/config.js";
import { makeCtx, readJson, ORIGIN } from "./helpers.mjs";

const req = (init = {}, path = "/api/v1/classify") => new Request(ORIGIN + path, { method: "POST", ...init });

async function rejects(promise, status, code) {
  await assert.rejects(promise, (e) => e instanceof ApiError && e.status === status && e.code === code,
    "expected " + status + " " + code);
}

test("json answers are JSON, no-store and nosniff", async () => {
  const res = json(200, { ok: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/json; charset=utf-8$/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("access-control-allow-origin"), null, "same origin only: no CORS header");
  assert.deepEqual(await readJson(res), { ok: true });
  const err = fail(429, "quota_exceeded", "Daily limit reached.");
  assert.equal(err.status, 429);
  assert.deepEqual(await readJson(err), { code: "quota_exceeded", message: "Daily limit reached." });
});

test("a JSON object body is read", async () => {
  const body = await readJsonBody(req({ headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text: "Tumour biopsy." }) }), 1000);
  assert.deepEqual(body, { text: "Tumour biopsy." });
});

test("only application/json is accepted: images, binary, forms and text are refused with 415", async () => {
  for (const type of ["image/jpeg", "application/octet-stream", "multipart/form-data; boundary=x",
    "application/x-www-form-urlencoded", "text/plain", null]) {
    const headers = type ? { "Content-Type": type } : {};
    await rejects(readJsonBody(req({ headers, body: "{}" }), 1000), 415, "unsupported_media_type");
  }
});

test("bodies over the cap are refused with 413, by Content-Length and by the bytes read", async () => {
  await rejects(readJsonBody(req({ headers: { "Content-Type": "application/json", "Content-Length": "5000" },
    body: JSON.stringify({ text: "x".repeat(4980) }) }), 1000), 413, "too_large");
  const stream = new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(JSON.stringify({ text: "y".repeat(3000) })));
    c.close();
  } });
  await rejects(readJsonBody(req({ headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" }),
    1000), 413, "too_large");
});

test("binary bytes, malformed JSON and non-objects are 400 bad_request, and the message never echoes the body", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xc3, 0x28]);
  await rejects(readJsonBody(req({ headers: { "Content-Type": "application/json" }, body: jpeg }), 1000), 400,
    "bad_request");
  for (const body of ["{\"text\": SECRETMARKER", "[1, 2]", "\"SECRETMARKER\"", "null", ""]) {
    await assert.rejects(readJsonBody(req({ headers: { "Content-Type": "application/json" }, body }), 1000),
      (e) => e instanceof ApiError && e.status === 400 && e.code === "bad_request" && !e.message.includes("SECRET"));
  }
});

test("a POST from another origin is refused (403 bad_origin); same origin or no Origin (server-side caller) pass", () => {
  assert.doesNotThrow(() => checkOrigin(req({ headers: { Origin: ORIGIN } })));
  assert.doesNotThrow(() => checkOrigin(req({})));
  for (const other of ["https://evil.example", "http://vitrans.pages.dev", "https://x.vitrans.pages.dev", "null"]) {
    assert.throws(() => checkOrigin(req({ headers: { Origin: other } })),
      (e) => e instanceof ApiError && e.status === 403 && e.code === "bad_origin");
  }
});

test("handle(): wrong method -> 405 with Allow; ApiError -> its JSON; any other error -> 500 server_error", async () => {
  const ok = async () => json(200, { ok: true });
  const get = await handle(makeCtx({ method: "GET" }), ["POST"], ok);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal((await readJson(get)).code, "method_not_allowed");
  const opt = await handle(makeCtx({ method: "OPTIONS" }), ["POST"], ok);
  assert.equal(opt.status, 405, "no CORS preflight answer");
  const thrown = await handle(makeCtx({ body: {} }), ["POST"], async () => {
    throw new ApiError(429, "budget_exhausted", "Budget used up.");
  });
  assert.equal(thrown.status, 429);
  assert.equal((await readJson(thrown)).code, "budget_exhausted");
  const saved = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try {
    const boom = await handle(makeCtx({ body: {} }), ["POST"], async () => {
      throw new TypeError("SECRETMARKER leaked");
    });
    assert.equal(boom.status, 500);
    const text = await boom.text();
    assert.equal(JSON.parse(text).code, "server_error");
    assert.ok(!text.includes("SECRET"));
  } finally {
    console.error = saved;
  }
  assert.ok(logged.length >= 1 && logged.every((l) => !l.includes("SECRETMARKER")), JSON.stringify(logged));
});

test("POST handlers refuse a cross-origin request before running", async () => {
  let ran = false;
  const res = await handle(makeCtx({ body: {}, origin: "https://evil.example" }), ["POST"], async () => {
    ran = true;
    return json(200, {});
  });
  assert.equal(res.status, 403);
  assert.equal(ran, false);
});

test("configuration: defaults, string vars parsed, invalid numbers refused as server_misconfigured", () => {
  const c = loadConfig({});
  assert.equal(c.model, "@cf/google/gemma-4-26b-a4b-it");
  assert.deepEqual(c.rates, { input: 9091, cached: 9091, output: 27273 });
  assert.equal(c.maxSegments, 20);
  assert.equal(c.maxSegmentChars, 10000);
  assert.equal(c.maxClassifyBytes, 2 * 1024 * 1024, "the whole document's text");
  assert.equal(c.maxTranslateBytes, 1024 * 1024);
  assert.equal(c.classifyCharsPerUnit, 10000);
  assert.equal(c.sessionSegments, 1500);
  assert.equal(c.ipSegments, 3000);
  // the user's cap (2026-10-14 20:15): $20 a month incl. the $5 Workers Paid base -> $15 of Workers AI overage
  assert.equal(c.dailyBudget, 55000, "10,000 free + 45,000 billed = $0.50 a day");
  assert.equal(c.freeNeurons, 10000);
  assert.equal(c.monthlyBilledCap, 1363000, "$15 at $0.011 per 1,000 neurons");
  assert.equal(c.usdPer1000, 0.011);
  assert.equal(c.liveShare, 0.5);
  assert.throws(() => loadConfig({ LIVE_BUDGET_SHARE: "1.5" }), (e) => e.code === "server_misconfigured");
  assert.equal(c.sessionTtl, 3600);
  assert.equal(c.dailyBudget, DEFAULTS.DAILY_NEURON_BUDGET);
  assert.deepEqual(c.turnstileHostnames, []);
  assert.equal(c.allowTestTurnstile, false);
  const d = loadConfig({ DAILY_NEURON_BUDGET: "1234.5", SESSION_SEGMENTS_PER_DAY: "7", NEURONS_PER_M_CACHED: "100",
    TURNSTILE_HOSTNAMES: " vitrans.pages.dev, *.vitrans.pages.dev ,", ALLOW_TEST_TURNSTILE: "1", MODEL: "@cf/x/y" });
  assert.equal(d.dailyBudget, 1234.5);
  assert.equal(d.sessionSegments, 7);
  assert.equal(d.rates.cached, 100);
  assert.deepEqual(d.turnstileHostnames, ["vitrans.pages.dev", "*.vitrans.pages.dev"]);
  assert.equal(d.allowTestTurnstile, true);
  assert.equal(d.model, "@cf/x/y");
  for (const bad of [{ DAILY_NEURON_BUDGET: "lots" }, { MAX_SEGMENTS_PER_REQUEST: "-1" },
    { SESSION_TTL_S: "0" }, { MAX_SEGMENTS_PER_REQUEST: "21" }]) {
    assert.throws(() => loadConfig(bad), (e) => e instanceof ApiError && e.status === 500 &&
      e.code === "server_misconfigured", JSON.stringify(bad));
  }
});
