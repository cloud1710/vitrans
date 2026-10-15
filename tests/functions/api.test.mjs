// The four endpoints with mocked context {request, env} and a scripted Workers AI binding:
//   POST /api/v1/session   {turnstile}                                   -> {session, expires_s, quota}
//   POST /api/v1/classify  {session, text (whole document), domain?}     -> classify event + {setup, setup_id}
//   POST /api/v1/translate {session, job_id, setup, setup_id?, segments} -> {results, usage, quota}
//   GET  /api/v1/status                                                  -> {ok, model, budget_left_today}
// Synthetic text only. Every AI call of a document must carry the helper's whole-document system prompt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionApi, classifyApi, translateApi, statusApi } from "../../functions/_lib/api.js";
import { verifySession } from "../../functions/_lib/session.js";
import { packSetOf } from "../../functions/_lib/engine.js";
import { prepareTranslation, TaggedSegment } from "../../web/engine/core.js";
import { makeEnv, makeCtx, readJson, fakeAI, chatAnswer, sourceOf, fakeSiteverify, FakeKV, PASS, TEST_PASS, FAIL,
  syntheticBundle, withConsoleSpy, MODEL, TEST_SESSION_SECRET } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const noSleep = async () => {};

// a synthetic four-paragraph document, as the page's pipeline would send it
const DOC = [
  "The biopsy showed a <g1>tumour</g1> with clear margins in every section.",
  "One lymph node held a small deposit of the same <g1>tumour</g1>.",
  "<g1>Biopsy</g1> number two was taken from the second lymph node in the axilla.",
  "Follow-up imaging after six months showed no new lesion anywhere.",
];
const VI = {
  [DOC[0]]: "Sinh thiết cho thấy một <g1>u</g1> với diện cắt sạch ở mọi lát cắt.",
  [DOC[1]]: "Một hạch bạch huyết chứa một ổ nhỏ của cùng loại <g1>u</g1> đó.",
  [DOC[2]]: "<g1>Sinh thiết</g1> thứ hai được lấy từ hạch bạch huyết thứ hai ở hố nách.",
  [DOC[3]]: "Chụp hình ảnh theo dõi sau sáu tháng không thấy tổn thương mới nào.",
};
const plainOf = (tagged) => new TaggedSegment(tagged, []).plain;
const FULL_TEXT = DOC.map(plainOf).join("\n");

function segmentsOf(ids) {
  return ids.map((n) => ({ id: n, tagged: DOC[n], essential: [1], prev: n > 0 ? plainOf(DOC[n - 1]) : "",
    nxt: n + 1 < DOC.length ? plainOf(DOC[n + 1]) : "", where: "Body " + (n + 1) }));
}

/** An AI binding that answers the synthetic document's paragraphs (anything else: a fixed Vietnamese line). */
function docAI(extra = {}) {
  return fakeAI((inputs) => chatAnswer(VI[sourceOf(inputs)] || "Văn bản khác.", { prompt: 1000, completion: 40,
    cached: 512, ...extra }));
}

function setupEnv(over = {}) {
  return makeEnv({ AI: docAI(), ALLOW_TEST_TURNSTILE: "1", ...over });
}

function depsFor(sv = fakeSiteverify(TEST_PASS), bundle = syntheticBundle()) {
  return { bundle, fetch: sv.fetch, now: () => NOW, sleep: noSleep, sv };
}

async function call(api, deps, opts) {
  const ctx = makeCtx(opts);
  const res = await api(ctx, deps);
  return { res, status: res.status, body: await readJson(res) };
}

async function openSession(env, deps, ip = "203.0.113.7") {
  const r = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, env, ip });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.session;
}

// ------------------------------------------------------------------ session

test("session: a passing Turnstile gives a signed session, its lifetime and the segments left today", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const r = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, env });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ["expires_s", "quota", "session"]);
  assert.equal(r.body.expires_s, 43200);
  assert.deepEqual(r.body.quota, { segments_left_today: 1500 });
  const v = await verifySession(TEST_SESSION_SECRET, r.body.session, NOW);
  assert.equal(v.exp, NOW / 1000 + 43200);
  assert.deepEqual(deps.sv.calls[0].body, { secret: env.TURNSTILE_SECRET, response: "XXXX.DUMMY.TOKEN.XXXX",
    remoteip: "203.0.113.7" });
  assert.equal(r.res.headers.get("cache-control"), "no-store");
});

test("session: failed or test-key Turnstile is 403; an IP at its cap or a spent budget is 429", async () => {
  const fail = await call(sessionApi, depsFor(fakeSiteverify(FAIL)), { path: "/api/v1/session",
    body: { turnstile: "t" }, env: setupEnv() });
  assert.deepEqual([fail.status, fail.body.code], [403, "bad_turnstile"]);
  const prodEnv = makeEnv({ TURNSTILE_HOSTNAMES: "vitrans.pages.dev" });
  const testKey = await call(sessionApi, depsFor(fakeSiteverify(TEST_PASS)), { path: "/api/v1/session",
    body: { turnstile: "t" }, env: prodEnv });
  assert.deepEqual([testKey.status, testKey.body.code], [403, "bad_turnstile"], "test keys are refused in production");
  const real = await call(sessionApi, depsFor(fakeSiteverify(PASS)), { path: "/api/v1/session", body: { turnstile: "t" },
    env: prodEnv });
  assert.equal(real.status, 200);
  const env = setupEnv({ IP_SEGMENTS_PER_DAY: "10", DAILY_NEURON_BUDGET: "100" });
  const deps = depsFor();
  const token = await openSession(env, deps);
  // spend: 10 segments on this IP via the counters
  await env.COUNTERS.put("v1:i:2026-10-14:" + (await verifySession(TEST_SESSION_SECRET, token, NOW)).iph, "10");
  const capped = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "t" }, env });
  assert.deepEqual([capped.status, capped.body.code], [429, "quota_exceeded"]);
  const other = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "t" }, env, ip: "198.51.100.9" });
  assert.equal(other.status, 200, "another IP is not affected");
  await env.COUNTERS.put("v1:b:2026-10-14", "100");
  const spent = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "t" }, env, ip: "198.51.100.9" });
  assert.deepEqual([spent.status, spent.body.code], [429, "budget_exhausted"]);
});

test("session: misconfiguration is 500 server_misconfigured; non-JSON, oversized or unknown fields are refused", async () => {
  for (const over of [{ SESSION_SECRET: "short" }, { TURNSTILE_SECRET: "" }, { COUNTERS: undefined }]) {
    const r = await call(sessionApi, depsFor(), { path: "/api/v1/session", body: { turnstile: "t" }, env: setupEnv(over) });
    assert.deepEqual([r.status, r.body.code], [500, "server_misconfigured"], JSON.stringify(Object.keys(over)));
  }
  const jpeg = await call(sessionApi, depsFor(), { path: "/api/v1/session", raw: new Uint8Array([0xff, 0xd8, 0xff]),
    headers: { "Content-Type": "image/jpeg" }, env: setupEnv() });
  assert.deepEqual([jpeg.status, jpeg.body.code], [415, "unsupported_media_type"]);
  const big = await call(sessionApi, depsFor(), { path: "/api/v1/session", body: { turnstile: "t".repeat(20000) },
    env: setupEnv() });
  assert.deepEqual([big.status, big.body.code], [413, "too_large"]);
  const extra = await call(sessionApi, depsFor(), { path: "/api/v1/session", body: { turnstile: "t", image: "AAAA" },
    env: setupEnv() });
  assert.deepEqual([extra.status, extra.body.code], [400, "bad_request"]);
  const get = await call(sessionApi, depsFor(), { method: "GET", path: "/api/v1/session", env: setupEnv() });
  assert.equal(get.status, 405);
});

// ------------------------------------------------------------------ classify

test("classify: the whole document -> the helper's classify event (with versions) + setup + setup_id", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const session = await openSession(env, deps);
  const r = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: FULL_TEXT }, env });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const set = await packSetOf(deps.bundle);
  const ref = await prepareTranslation(FULL_TEXT, { packs: set });
  const { setup, setup_id: setupId, ...event } = r.body;
  assert.deepEqual(event, { ...ref.classify, packs: ref.classify.packs.map((p) => ({ ...p, version: "1.0.0" })) });
  assert.deepEqual(setup, { packs: [{ id: "alpha", version: "1.0.0" }], hits: ref.hits.map((h) => h[0]) });
  assert.match(setupId, /^[0-9a-f]{64}$/);
  const dom = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: FULL_TEXT,
    domain: ["alpha-kid"] }, env });
  assert.deepEqual(dom.body.setup.packs.map((p) => p.id), ["alpha-kid", "alpha"]);
  // profile photo (the image tool): a short text gets the pack it names; file (the default) keeps the thresholds
  const SHORT = "TUMOUR BOARD 2026";
  const file = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: SHORT, profile: "file" }, env });
  assert.deepEqual([file.status, file.body.packs], [200, []]);
  const photo = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: SHORT, profile: "photo" },
    env });
  assert.deepEqual(photo.body.packs.map((p) => [p.id, p.reason]), [["alpha", "detect"]]);
  assert.deepEqual(photo.body.setup, { packs: [{ id: "alpha", version: "1.0.0" }], hits: ["tumour"] });
});

test("classify: sessions are required; text and domain are validated; a long text counts against the quota", async () => {
  const env = setupEnv({ SESSION_SEGMENTS_PER_DAY: "5" });
  const deps = depsFor();
  for (const session of [undefined, "", "forged.token", 42]) {
    const r = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: "x" }, env });
    if (session === undefined) assert.deepEqual([r.status, r.body.code], [400, "bad_request"]);
    else assert.deepEqual([r.status, r.body.code], [401, "session_expired"], String(session));
  }
  const session = await openSession(env, deps);
  const late = await call(classifyApi, { ...deps, now: () => NOW + 43201 * 1000 }, { path: "/api/v1/classify",
    body: { session, text: "x" }, env });
  assert.deepEqual([late.status, late.body.code], [401, "session_expired"]);
  for (const body of [{ session, text: 5 }, { session }, { session, text: "x", domain: "alpha" },
    { session, text: "x", domain: ["Alpha!"] }, { session, text: "x", domain: Array(7).fill("alpha") },
    { session, text: "x", other: 1 }, { session, text: "x", profile: "live" }, { session, text: "x", profile: 1 }]) {
    const r = await call(classifyApi, deps, { path: "/api/v1/classify", body, env });
    assert.deepEqual([r.status, r.body.code], [400, "bad_request"], JSON.stringify(body).slice(0, 80));
  }
  const huge = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: "a ".repeat(1_100_000) },
    env });
  assert.deepEqual([huge.status, huge.body.code], [413, "too_large"]);
  // 25,000 characters = 3 units of 10,000 (session cap 5): the second such call reaches the cap
  const long = "biopsy tumour ".repeat(1786);
  assert.equal((await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: long }, env })).status, 200);
  assert.equal((await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: long }, env })).status, 200);
  const capped = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: "x" }, env });
  assert.deepEqual([capped.status, capped.body.code], [429, "quota_exceeded"]);
});

// ------------------------------------------------------------------ translate

async function classified(env, deps) {
  const session = await openSession(env, deps);
  const c = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: FULL_TEXT }, env });
  assert.equal(c.status, 200);
  return { session, setup: c.body.setup, setupId: c.body.setup_id };
}

test("translate: two batches of one document both use the helper's whole-document system prompt", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const { session, setup, setupId } = await classified(env, deps);
  const out = [];
  for (const ids of [[0, 1], [2, 3]]) {
    const r = await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "job-7f3a",
      setup, setup_id: setupId, segments: segmentsOf(ids) } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    out.push(r.body);
  }
  const set = await packSetOf(deps.bundle);
  const ref = await prepareTranslation(FULL_TEXT, { packs: set });
  const calls = env.AI.calls;
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    assert.equal(c.inputs.messages[0].content, ref.system, "same system prompt for every batch");
    assert.deepEqual(c.options, { extraHeaders: { "x-session-affinity": "job-7f3a" } });
    assert.deepEqual(c.inputs.chat_template_kwargs, { enable_thinking: false });
    assert.equal(c.model, MODEL);
  }
  const results = out.flatMap((b) => b.results);
  assert.deepEqual(results.map((r) => r.id), [0, 1, 2, 3]);
  for (const r of results) {
    assert.deepEqual(Object.keys(r).sort(), ["cached", "fixes", "flags", "id", "level", "reduced", "spans", "text"]);
    assert.equal(r.text, VI[DOC[r.id]]);
    assert.deepEqual(r.fixes, []);
  }
  const u = out[0].usage;
  assert.deepEqual(Object.keys(u).sort(), ["cached_tokens", "calls", "completion_tokens", "neurons", "prompt_tokens"]);
  assert.equal(u.prompt_tokens, 1000 * u.calls);
  assert.equal(u.cached_tokens, 512 * u.calls);
  assert.ok(Math.abs(u.neurons - u.calls * (488 * 9091 + 512 * 9091 + 40 * 27273) / 1e6) < 0.01, String(u.neurons));
  assert.equal(out[1].quota.segments_left_today, 1500 - 5, "4 segments + 1 classify unit");
  const kv = env.COUNTERS;
  const sid = (await verifySession(TEST_SESSION_SECRET, session, NOW)).sid;
  assert.equal(await kv.get("v1:s:2026-10-14:" + sid), "5", "4 segments + 1 classify unit");
  const spent = Number(await kv.get("v1:b:2026-10-14"));
  assert.ok(Math.abs(spent - (out[0].usage.neurons + out[1].usage.neurons)) < 0.01, String(spent));
});

test("translate: the fixes the core wrote come back per segment as {en, from, to} (the page's list of fixes)", async () => {
  const src = "The tumour was reviewed by Jane Doe, MD, PhD.";
  const env = setupEnv({ AI: fakeAI((inputs) => chatAnswer(sourceOf(inputs) === src
    ? "Khối bướu được BS TS Jane Doe xem lại." : "Văn bản khác.")) });
  const deps = depsFor();
  const { session, setup, setupId } = await classified(env, deps);
  const r = await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "job-fix",
    setup, setup_id: setupId, segments: [{ id: "s1", tagged: src, essential: [], prev: "", nxt: "", where: "Doan 1" }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const [res] = r.body.results;
  assert.equal(res.text, "U được TS. BS. Jane Doe xem lại.");
  assert.deepEqual(res.fixes, [{ en: "tumour", from: "Khối bướu", to: "U" }, { en: "title-order", from: "BS TS", to: "TS. BS." }]);
  assert.deepEqual(res.flags.filter((f) => f.startsWith("term_fix:")), ["term_fix:tumour", "term_fix:title-order"]);
});

test("translate: the request is validated (segments, ids, fields, sizes, job id, setup)", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const { session, setup, setupId } = await classified(env, deps);
  const base = { session, job_id: "job-1", setup, setup_id: setupId, segments: segmentsOf([0]) };
  const seg = segmentsOf([0])[0];
  const cases = [
    [{ ...base, segments: [] }, 400, "bad_request"],
    [{ ...base, segments: Array.from({ length: 21 }, (_, i) => ({ ...seg, id: i })) }, 400, "bad_request"],
    [{ ...base, segments: [seg, { ...seg }] }, 400, "bad_request"],
    [{ ...base, segments: [{ ...seg, image: "AAAA" }] }, 400, "bad_request"],
    [{ ...base, segments: [{ ...seg, tagged: 5 }] }, 400, "bad_request"],
    [{ ...base, segments: [{ ...seg, essential: ["1"] }] }, 400, "bad_request"],
    [{ ...base, segments: [{ ...seg, id: { a: 1 } }] }, 400, "bad_request"],
    [{ ...base, segments: [{ ...seg, tagged: "x".repeat(10001) }] }, 413, "too_large"],
    [{ ...base, segments: [{ ...seg, prev: "x".repeat(10001) }] }, 413, "too_large"],
    [{ ...base, job_id: "" }, 400, "bad_request"],
    [{ ...base, job_id: "job id with spaces" }, 400, "bad_request"],
    [{ ...base, job_id: "j".repeat(65) }, 400, "bad_request"],
    [{ ...base, setup: undefined }, 400, "bad_request"],
    [{ ...base, setup_id: "0".repeat(64) }, 400, "bad_request"],
    [{ ...base, setup: { ...setup, packs: [{ id: "alpha", version: "0.0.1" }] }, setup_id: undefined }, 409,
      "packs_changed"],
    [{ ...base, extra: true }, 400, "bad_request"],
  ];
  for (const [body, status, code] of cases) {
    const r = await call(translateApi, deps, { path: "/api/v1/translate", env, body });
    assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(body).slice(0, 160));
  }
  assert.equal(env.AI.calls.length, 0, "nothing reached the model");
  const ok = await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "j_2",
    setup, segments: [{ id: "a", tagged: DOC[3] }] } });
  assert.equal(ok.status, 200, "essential / prev / nxt / where / setup_id are optional");
});

test("translate: quota and budget stop a request before the model is called", async () => {
  const env = setupEnv({ SESSION_SEGMENTS_PER_DAY: "3" });
  const deps = depsFor();
  const { session, setup } = await classified(env, deps); // 1 unit
  const body = { session, job_id: "j", setup, segments: segmentsOf([0, 1]) };
  assert.equal((await call(translateApi, deps, { path: "/api/v1/translate", env, body })).status, 200);
  const calls = env.AI.calls.length;
  const capped = await call(translateApi, deps, { path: "/api/v1/translate", env, body });
  assert.deepEqual([capped.status, capped.body.code], [429, "quota_exceeded"]);
  const env2 = setupEnv({ DAILY_NEURON_BUDGET: "10" });
  const c2 = await classified(env2, deps);
  await env2.COUNTERS.put("v1:b:2026-10-14", "10");
  const spent = await call(translateApi, deps, { path: "/api/v1/translate", env: env2, body: { session: c2.session,
    job_id: "j", setup: c2.setup, segments: segmentsOf([0]) } });
  assert.deepEqual([spent.status, spent.body.code], [429, "budget_exhausted"]);
  assert.equal(env.AI.calls.length, calls);
  assert.equal(env2.AI.calls.length, 0);
});

test("translate: model failures are 502 model_error (spent neurons still counted); 3036 is budget_exhausted", async () => {
  let n = 0;
  const env = setupEnv({ AI: fakeAI((inputs) => {
    n += 1;
    if (n === 1) return chatAnswer(VI[sourceOf(inputs)], { prompt: 1000, completion: 40 });
    throw new Error("5035: This model requires a Workers Paid plan.");
  }) });
  const deps = depsFor();
  const { session, setup } = await classified(env, deps);
  const r = await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "j", setup,
    segments: segmentsOf([0, 1]) } });
  assert.deepEqual([r.status, r.body.code], [502, "model_error"]);
  assert.ok(!JSON.stringify(r.body).includes("Paid"), "the answer does not pass the provider's message on");
  assert.ok(Number(await env.COUNTERS.get("v1:b:2026-10-14")) > 0, "the first call's neurons are counted");
  const sid = (await verifySession(TEST_SESSION_SECRET, session, NOW)).sid;
  assert.equal(await env.COUNTERS.get("v1:s:2026-10-14:" + sid), "1", "only the classify unit: no segment counted");
  const env3 = setupEnv({ AI: fakeAI(() => { throw new Error("3036: You have used up your daily free allocation"); }) });
  const c3 = await classified(env3, deps);
  const r3 = await call(translateApi, deps, { path: "/api/v1/translate", env: env3, body: { session: c3.session,
    job_id: "j", setup: c3.setup, segments: segmentsOf([0]) } });
  assert.deepEqual([r3.status, r3.body.code], [429, "budget_exhausted"]);
});

// ------------------------------------------------------------------ status

test("translate: profile file | photo | live; live stops at its share of the day; the month's billed cap stops all", async () => {
  const env = setupEnv({ DAILY_NEURON_BUDGET: "1000" });
  const deps = depsFor();
  const { session, setup } = await classified(env, deps);
  const body = (profile) => ({ session, job_id: "j", setup, segments: segmentsOf([3]), ...(profile ? { profile } : {}) });
  await env.COUNTERS.put("v1:b:2026-10-14", "500");
  await env.COUNTERS.put("v1:l:2026-10-14", "500");
  const live = await call(translateApi, deps, { path: "/api/v1/translate", env, body: body("live") });
  assert.deepEqual([live.status, live.body.code], [429, "budget_exhausted"], "live used its 50 %");
  for (const p of [undefined, "file", "photo"]) {
    assert.equal((await call(translateApi, deps, { path: "/api/v1/translate", env, body: body(p) })).status, 200, String(p));
  }
  const bad = await call(translateApi, deps, { path: "/api/v1/translate", env, body: body("video") });
  assert.deepEqual([bad.status, bad.body.code], [400, "bad_request"]);
  await env.COUNTERS.put("v1:l:2026-10-14", "100");
  const before = Number(await env.COUNTERS.get("v1:l:2026-10-14"));
  assert.equal((await call(translateApi, deps, { path: "/api/v1/translate", env, body: body("live") })).status, 200);
  assert.ok(Number(await env.COUNTERS.get("v1:l:2026-10-14")) > before, "live neurons are counted apart");
  await env.COUNTERS.put("v1:m:2026-10", "1363000");
  const month = await call(translateApi, deps, { path: "/api/v1/translate", env, body: body("file") });
  assert.deepEqual([month.status, month.body.code], [429, "budget_exhausted"], "the month's $15 are used up");
  const st = await call(statusApi, deps, { method: "GET", path: "/api/v1/status", env });
  assert.deepEqual([st.body.budget_left_today, st.body.month_spent_usd], [0, 14.99]);
});

test("status: GET only; model, configured or not, the fraction of today's budget left and the month's spend", async () => {
  const env = setupEnv({ DAILY_NEURON_BUDGET: "200" });
  const deps = depsFor();
  const r = await call(statusApi, deps, { method: "GET", path: "/api/v1/status", env });
  assert.deepEqual(r.body, { ok: true, model: MODEL, budget_left_today: 1, month_spent_usd: 0 });
  await env.COUNTERS.put("v1:b:2026-10-14", "50");
  assert.equal((await call(statusApi, deps, { method: "GET", path: "/api/v1/status", env })).body.budget_left_today, 0.75);
  await env.COUNTERS.put("v1:m:2026-10", "50000");
  assert.equal((await call(statusApi, deps, { method: "GET", path: "/api/v1/status", env })).body.month_spent_usd, 0.55);
  const bad = await call(statusApi, deps, { method: "GET", path: "/api/v1/status", env: setupEnv({ AI: undefined }) });
  assert.equal(bad.body.ok, false);
  const post = await call(statusApi, deps, { path: "/api/v1/status", body: {}, env });
  assert.equal(post.status, 405);
});

// ------------------------------------------------------------------ privacy

test("privacy: no request text, segment, model answer or secret is ever logged, and KV holds numbers only", async () => {
  const MARK = "ZQXSECRETMARK";
  const env = setupEnv({ AI: fakeAI((inputs, o, k) => {
    if (k === 3) throw new Error("3040: Capacity temporarily exceeded " + MARK);
    return chatAnswer(VI[sourceOf(inputs)] ? VI[sourceOf(inputs)] + " " + MARK : MARK, { prompt: 900, completion: 30,
      reasoning: MARK });
  }) });
  const deps = depsFor();
  const [, lines] = await withConsoleSpy(async () => {
    const session = await openSession(env, deps);
    const text = FULL_TEXT + "\n" + MARK;
    const c = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text }, env });
    const segs = segmentsOf([0, 1, 2]).map((s) => ({ ...s, prev: s.prev + " " + MARK, where: MARK }));
    await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "j", setup: c.body.setup,
      segments: segs } });
    await call(classifyApi, deps, { path: "/api/v1/classify", raw: "{\"session\": \"" + MARK, env,
      headers: { "Content-Type": "application/json" } });
    const failing = setupEnv({ AI: fakeAI(() => { throw new Error("5007: No such model " + MARK); }) });
    const c2 = await classified(failing, deps);
    await call(translateApi, deps, { path: "/api/v1/translate", env: failing, body: { session: c2.session, job_id: "j",
      setup: c2.setup, segments: segs } });
    env.COUNTERS.failPuts = true;
    await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "j", setup: c.body.setup,
      segments: segmentsOf([3]) } });
  });
  for (const l of lines) {
    assert.ok(!l.includes(MARK) && !l.includes(TEST_SESSION_SECRET) && !l.includes("biopsy") && !l.includes("Sinh"), l);
  }
  for (const [key, { value }] of env.COUNTERS.map) {
    assert.match(key, /^v1:(?:[bsil]:\d{4}-\d{2}-\d{2}(?::[A-Za-z0-9_-]{22})?|m:\d{4}-\d{2})$/);
    assert.match(value, /^\d+(\.\d+)?$/);
  }
});

test("a fresh KV and a fresh isolate: the deps' clock and bundle are used, nothing else is global", async () => {
  const env = setupEnv({ COUNTERS: new FakeKV() });
  const deps = depsFor();
  const session = await openSession(env, deps);
  const r = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: "Plain words only." }, env });
  assert.deepEqual([r.status, r.body.packs, r.body.setup], [200, [], { packs: [], hits: [] }]);
});
