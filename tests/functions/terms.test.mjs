// POST /api/v1/terms (spec Amendment G): after a job the page sends the document's segments as {id, src (English
// plain text), vi (its translation)}; one or a few model calls list the medical / technical terms with the Vietnamese
// the translation used (strict JSON; an answer wrapped in a fence or a preface is repaired); the server keeps a term
// only when its English is in a segment, its Vietnamese is in the same segment's translation and it is not a glossary
// key of the job's packs, and answers {terms: [{en, vi, count, ids}], usage}. Synthetic text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { termsApi, sessionApi, classifyApi } from "../../functions/_lib/api.js";
import { parseTermsAnswer, checkTermItems, termChunks, findTerms, MAX_TERM_ITEMS, MAX_TERM_CHARS, CHUNK_CHARS }
  from "../../functions/_lib/terms.js";
import { termSpans, packKeyFlags, packSetOf } from "../../functions/_lib/engine.js";
import { ModelCallError, createModel, newUsage } from "../../functions/_lib/model.js";
import { ApiError } from "../../functions/_lib/http.js";
import { verifySession } from "../../functions/_lib/session.js";
import { makeEnv, makeCtx, readJson, fakeAI, chatAnswer, fakeSiteverify, TEST_PASS, syntheticBundle, withConsoleSpy,
  MODEL, TEST_SESSION_SECRET } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const noSleep = async () => {};
const ALPHA = [{ id: "alpha", version: "1.0.0" }];

// a synthetic document: English segments and their Vietnamese translation
const ITEMS = [
  { id: 0, src: "The biopsy showed hepatocellular carcinoma with focal necrosis.",
    vi: "Sinh thiết cho thấy carcinom tế bào gan với hoại tử khu trú." },
  { id: 1, src: "Hepatocellular carcinomas often arise in cirrhosis; a second hepatocellular carcinoma may follow.",
    vi: "Carcinom tế bào gan thường phát sinh trên nền xơ gan; carcinom tế bào gan thứ hai có thể xuất hiện sau đó." },
  { id: 2, src: "A tumour was seen in one lymph node.", vi: "Thấy một u trong một hạch bạch huyết." },
  { id: "p4", src: "Focal necrosis was absent.", vi: "Không có hoại tử ổ." },
];

// what the model answers for that document: new terms, pack keys, an English term that is not in the text, a
// Vietnamese the translation does not hold, a pair split over two segments, a repeat, malformed entries
const ANSWER = JSON.stringify({ terms: [
  { en: "hepatocellular carcinoma", vi: "carcinom tế bào gan" },
  { en: "focal necrosis", vi: "hoại tử khu trú" },
  { en: "Focal necrosis", vi: "hoại tử ổ" },
  { en: "cirrhosis", vi: "xơ gan" },
  { en: "biopsy", vi: "sinh thiết" },
  { en: "tumour", vi: "u" },
  { en: "lymph node", vi: "hạch bạch huyết" },
  { en: "tumours", vi: "u" },
  { en: "portal hypertension", vi: "tăng áp lực tĩnh mạch cửa" },
  { en: "necrosis", vi: "thoái hóa" },
  { en: "cirrhosis", vi: "hoại tử khu trú" },
  { en: "Hepatocellular carcinoma", vi: "Carcinom tế bào gan" },
  { en: "", vi: "x" },
  { en: 5, vi: "y" },
  "z",
] });

const EXPECTED = [
  { en: "hepatocellular carcinoma", vi: "carcinom tế bào gan", count: 3, ids: [0, 1] },
  { en: "cirrhosis", vi: "xơ gan", count: 1, ids: [1] },
  { en: "focal necrosis", vi: "hoại tử khu trú", count: 1, ids: [0] },
  { en: "Focal necrosis", vi: "hoại tử ổ", count: 1, ids: ["p4"] },
];

function apiCode(fn) {
  try {
    fn();
    return "ok";
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e && e.stack));
    return e.status + " " + e.code;
  }
}

// ------------------------------------------------------------------ the model's JSON

test("the model's JSON: {terms: [...]} or a bare list, also in a code fence, after a preface or with a trailing comma", () => {
  const want = [{ en: "focal necrosis", vi: "hoại tử khu trú" }];
  for (const text of [
    "{\"terms\": [{\"en\": \"focal necrosis\", \"vi\": \"hoại tử khu trú\"}]}",
    "[{\"en\": \"focal necrosis\", \"vi\": \"hoại tử khu trú\"}]",
    "```json\n{\"terms\": [{\"en\": \"focal necrosis\", \"vi\": \"hoại tử khu trú\"}]}\n```",
    "Here are the terms:\n{\"terms\": [{\"en\": \"focal necrosis\", \"vi\": \"hoại tử khu trú\"},]}",
    "{\"terms\": [{\"en\": \" focal necrosis \", \"vi\": \"hoại tử khu trú\", \"note\": \"x\"}, {\"en\": 5, \"vi\": \"y\"}, " +
      "\"z\", {\"en\": \"q\"}, {\"en\": \"r\", \"vi\": \"  \"}]}",
  ]) {
    assert.deepEqual(parseTermsAnswer(text), want, text);
  }
  assert.deepEqual(parseTermsAnswer("{\"terms\": []}"), []);
});

test("an answer that is not the JSON asked for is a model error of kind json that never quotes the answer", () => {
  for (const text of ["", "Sorry, I cannot help with that.", "{\"terms\": \"none\"}", "{\"result\": []}",
    "{\"terms\": [{\"en\": \"a\", \"vi\": \"b\"}", "null"]) {
    assert.throws(() => parseTermsAnswer(text),
      (e) => e instanceof ModelCallError && e.kind === "json" && !e.message.includes("Sorry"), JSON.stringify(text));
  }
});

// ------------------------------------------------------------------ the core's matcher

test("an English term is found in lower-case text as the glossary matcher finds it: plurals, US / UK spelling, - or space", () => {
  const text = "tumours and a tumor; lymph-node, lymph nodes; not a lymphnode, tumourous or pre-tumour";
  const found = (term) => termSpans(term, text).map(([a, b]) => text.slice(a, b));
  assert.deepEqual(found("tumour"), ["tumours", "tumor"]);
  assert.deepEqual(found("Lymph Node"), ["lymph-node", "lymph nodes"]);
  assert.deepEqual(found("necrosis"), []);
});

test("glossary keys of the job's packs: the whole term must be a key as the matcher reads it", async () => {
  const set = await packSetOf(syntheticBundle());
  const terms = ["Biopsies", "tumor", "lymph-nodes", "lymph node metastasis", "core needle", "focal necrosis"];
  assert.deepEqual(await packKeyFlags(set, ALPHA, terms), [true, true, true, false, false, false]);
  const kids = [{ id: "alpha-kid", version: "0.2.0" }, { id: "alpha", version: "1.0.0" }];
  assert.deepEqual(await packKeyFlags(set, kids, terms), [true, true, true, false, true, false]);
  assert.deepEqual(await packKeyFlags(set, [], terms), terms.map(() => false));
  assert.deepEqual(await packKeyFlags(set, ALPHA, []), []);
});

// ------------------------------------------------------------------ items and calls

test("items: 1 to 200 segments {id, src, vi} with their own ids, at most 60,000 characters in all", () => {
  assert.equal(MAX_TERM_ITEMS, 200);
  assert.equal(MAX_TERM_CHARS, 60000);
  assert.deepEqual(checkTermItems([{ id: 0, src: "A", vi: "B" }, { id: "s-1", src: "", vi: "" }]),
    [{ id: 0, src: "A", vi: "B" }, { id: "s-1", src: "", vi: "" }]);
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: i, src: "a", vi: "b" }));
  assert.equal(apiCode(() => checkTermItems(many(200))), "ok");
  for (const list of [undefined, "items", [], many(201), [{ id: 1, src: "a", vi: "b" }, { id: "1", src: "a", vi: "b" }],
    [{ id: 1, src: "a" }], [{ id: 1, src: "a", vi: 2 }], [{ id: 1, src: "a", vi: "b", tagged: "<g1>a</g1>" }],
    [{ id: { x: 1 }, src: "a", vi: "b" }], [{ id: "", src: "a", vi: "b" }], [{ id: "i".repeat(65), src: "a", vi: "b" }],
    ["a"]]) {
    assert.equal(apiCode(() => checkTermItems(list)), "400 bad_request", String(JSON.stringify(list)).slice(0, 80));
  }
  assert.equal(apiCode(() => checkTermItems([{ id: 1, src: "a".repeat(30000), vi: "ă".repeat(30000) }])), "ok");
  assert.equal(apiCode(() => checkTermItems([{ id: 1, src: "a".repeat(30000), vi: "ă".repeat(30001) }])),
    "413 too_large");
});

test("a large request is split into a few model calls of at most 20,000 characters, never inside a segment", () => {
  assert.equal(CHUNK_CHARS, 20000);
  const items = [5000, 9000, 7000, 25000, 100].map((n, i) => ({ id: i, src: "a".repeat(n), vi: "" }));
  assert.deepEqual(termChunks(items, 20000).map((c) => c.map((s) => s.id)), [[0, 1], [2], [3], [4]]);
  const halves = [{ id: 0, src: "a".repeat(6000), vi: "b".repeat(6000) }, { id: 1, src: "a".repeat(4000), vi: "b".repeat(4000) }];
  assert.deepEqual(termChunks(halves, 20000).map((c) => c.length), [2]);
  assert.deepEqual(termChunks(halves, 19999).map((c) => c.length), [1, 1]);
});

// ------------------------------------------------------------------ findTerms

function termModel(answer = () => ANSWER, extra = {}) {
  const ai = fakeAI((inputs, options, n) => chatAnswer(answer(inputs, n), { prompt: 800, completion: 120, ...extra }));
  const usage = newUsage();
  const model = createModel(ai, { model: MODEL, rates: { input: 9091, cached: 9091, output: 27273 }, affinity: "job-1",
    usage, sleep: noSleep });
  return { ai, usage, model };
}

test("findTerms: new terms with the Vietnamese the translation used, the segments that hold the pair, most frequent first", async () => {
  const set = await packSetOf(syntheticBundle());
  const { ai, model } = termModel();
  const terms = await findTerms(set, { packs: ALPHA, hits: ["biopsy", "tumour", "lymph node"] }, ITEMS, { model });
  assert.deepEqual(terms, EXPECTED);
  assert.equal(ai.calls.length, 1);
  const { messages, max_completion_tokens: maxTokens, chat_template_kwargs: kwargs, temperature } = ai.calls[0].inputs;
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /JSON/);
  assert.match(messages[0].content, /biopsy; tumour; lymph node/, "the job's glossary hits are named as known");
  for (const it of ITEMS) {
    assert.ok(messages[1].content.includes("EN: " + it.src), it.id);
    assert.ok(messages[1].content.includes("VI: " + it.vi), it.id);
  }
  assert.deepEqual([maxTokens, kwargs, temperature], [4096, { enable_thinking: false }, 0]);
});

test("findTerms: segments without text are not sent; nothing to ask means no model call", async () => {
  const set = await packSetOf(syntheticBundle());
  const { ai, model } = termModel();
  assert.deepEqual(await findTerms(set, { packs: ALPHA, hits: [] }, [{ id: 0, src: " ", vi: "" }], { model }), []);
  assert.equal(ai.calls.length, 0);
  const terms = await findTerms(set, { packs: [], hits: [] }, [...ITEMS, { id: 9, src: "", vi: "" }], { model });
  assert.equal(ai.calls.length, 1);
  assert.ok(!ai.calls[0].inputs.messages[1].content.includes("EN: \n"), "the empty segment is left out");
  assert.ok(!/glossary terms/i.test(ai.calls[0].inputs.messages[0].content), "no glossary hits: no list");
  // no packs: the glossary terms stay (they are new to this job); "tumours" is not written so in the text
  assert.deepEqual(terms.map((t) => t.en).sort(), ["Focal necrosis", "biopsy", "cirrhosis", "focal necrosis",
    "hepatocellular carcinoma", "lymph node", "tumour"]);
  assert.deepEqual(terms.find((t) => t.en === "tumour"), { en: "tumour", vi: "u", count: 1, ids: [2] });
});

test("findTerms: a large request makes one call per chunk and merges their terms", async () => {
  const set = await packSetOf(syntheticBundle());
  const filler = " Filler words only.".repeat(600); // about 11,400 characters per segment
  const items = ITEMS.map((it) => ({ ...it, src: it.src + filler }));
  const { ai, model } = termModel((inputs, n) => (n === 1
    ? JSON.stringify({ terms: [{ en: "hepatocellular carcinoma", vi: "carcinom tế bào gan" }] })
    : JSON.stringify([{ en: "cirrhosis", vi: "xơ gan" }, { en: "Hepatocellular carcinoma", vi: "carcinom tế bào gan" }])));
  const terms = await findTerms(set, { packs: ALPHA, hits: [] }, items, { model });
  assert.ok(ai.calls.length >= 2 && ai.calls.length <= 4, String(ai.calls.length));
  assert.deepEqual(terms, [EXPECTED[0], EXPECTED[1]]);
});

// ------------------------------------------------------------------ POST /api/v1/terms

function depsFor(bundle = syntheticBundle()) {
  return { bundle, fetch: fakeSiteverify(TEST_PASS).fetch, now: () => NOW, sleep: noSleep };
}

async function call(api, deps, opts) {
  const res = await api(makeCtx(opts), deps);
  return { res, status: res.status, body: await readJson(res) };
}

async function prepared(env, deps) {
  const s = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, env });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const text = ITEMS.map((it) => it.src).join("\n");
  const c = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session: s.body.session, text }, env });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.deepEqual(c.body.setup.packs, ALPHA);
  return { session: s.body.session, setup: c.body.setup, setupId: c.body.setup_id };
}

function termsEnv(over = {}) {
  return makeEnv({ AI: fakeAI(() => chatAnswer(ANSWER, { prompt: 800, completion: 120 })), ALLOW_TEST_TURNSTILE: "1",
    ...over });
}

test("terms API: the page's request -> {terms, usage}; counted on the session, the IP and the day's budget", async () => {
  const env = termsEnv();
  const deps = depsFor();
  const { session, setup, setupId } = await prepared(env, deps);
  const r = await call(termsApi, deps, { path: "/api/v1/terms", env, body: { session, job_id: "job-7f3a", setup,
    setup_id: setupId, items: ITEMS } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ["terms", "usage"]);
  assert.deepEqual(r.body.terms, EXPECTED);
  const u = r.body.usage;
  assert.deepEqual([u.calls, u.prompt_tokens, u.completion_tokens], [1, 800, 120]);
  assert.ok(Math.abs(u.neurons - (800 * 9091 + 120 * 27273) / 1e6) < 0.001, String(u.neurons));
  const c = env.AI.calls[0];
  assert.equal(c.model, MODEL);
  assert.deepEqual(c.options, { extraHeaders: { "x-session-affinity": "job-7f3a" } });
  assert.deepEqual(c.inputs.chat_template_kwargs, { enable_thinking: false });
  assert.equal(r.res.headers.get("cache-control"), "no-store");
  const v = await verifySession(TEST_SESSION_SECRET, session, NOW);
  assert.equal(await env.COUNTERS.get("v1:s:2026-10-14:" + v.sid), "2", "1 classify unit + 1 terms unit (2,000 chars)");
  assert.equal(await env.COUNTERS.get("v1:i:2026-10-14:" + v.iph), "2");
  assert.ok(Math.abs(Number(await env.COUNTERS.get("v1:b:2026-10-14")) - u.neurons) < 0.001);
  assert.equal(await env.COUNTERS.get("v1:l:2026-10-14"), null, "profile file: not live captions");
});

test("terms API: one unit per started TERMS_CHARS_PER_UNIT characters of src + vi", async () => {
  const env = termsEnv({ TERMS_CHARS_PER_UNIT: "100" });
  const deps = depsFor();
  const { session, setup } = await prepared(env, deps);
  const chars = ITEMS.reduce((n, it) => n + [...it.src].length + [...it.vi].length, 0);
  const r = await call(termsApi, deps, { path: "/api/v1/terms", env, body: { session, job_id: "j", setup, items: ITEMS } });
  assert.equal(r.status, 200);
  const v = await verifySession(TEST_SESSION_SECRET, session, NOW);
  assert.equal(Number(await env.COUNTERS.get("v1:s:2026-10-14:" + v.sid)), 1 + Math.ceil(chars / 100));
});

test("terms API: the request is validated before the session, the limits and the model", async () => {
  const env = termsEnv();
  const deps = depsFor();
  const { session, setup, setupId } = await prepared(env, deps);
  const base = { session, job_id: "job-1", setup, setup_id: setupId, items: ITEMS };
  const cases = [
    [{ ...base, items: [] }, 400, "bad_request"],
    [{ ...base, items: undefined }, 400, "bad_request"],
    [{ ...base, items: [{ ...ITEMS[0], src: "a".repeat(60001) }] }, 413, "too_large"],
    [{ ...base, job_id: "job id" }, 400, "bad_request"],
    [{ ...base, job_id: undefined }, 400, "bad_request"],
    [{ ...base, setup: undefined }, 400, "bad_request"],
    [{ ...base, setup_id: "0".repeat(64) }, 400, "bad_request"],
    [{ ...base, setup: { ...setup, packs: [{ id: "alpha", version: "0.0.1" }] }, setup_id: undefined }, 409,
      "packs_changed"],
    [{ ...base, file: "report.docx" }, 400, "bad_request"],
    [{ ...base, session: undefined }, 400, "bad_request"],
    [{ ...base, session: "forged.token" }, 401, "session_expired"],
  ];
  for (const [body, status, code] of cases) {
    const r = await call(termsApi, deps, { path: "/api/v1/terms", env, body });
    assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(body).slice(0, 120));
  }
  const get = await call(termsApi, deps, { method: "GET", path: "/api/v1/terms", env });
  assert.equal(get.status, 405);
  assert.equal(env.AI.calls.length, 0, "nothing reached the model");
  const noAI = await call(termsApi, deps, { path: "/api/v1/terms", env: { ...env, AI: undefined }, body: base });
  assert.deepEqual([noAI.status, noAI.body.code], [500, "server_misconfigured"]);
});

test("terms API: the session's quota and the day's budget stop a request before the model is called", async () => {
  const env = termsEnv({ SESSION_SEGMENTS_PER_DAY: "1" });
  const deps = depsFor();
  const { session, setup } = await prepared(env, deps); // classify used the session's one unit
  const capped = await call(termsApi, deps, { path: "/api/v1/terms", env, body: { session, job_id: "j", setup,
    items: ITEMS } });
  assert.deepEqual([capped.status, capped.body.code], [429, "quota_exceeded"]);
  const env2 = termsEnv({ DAILY_NEURON_BUDGET: "10" });
  const p2 = await prepared(env2, deps);
  await env2.COUNTERS.put("v1:b:2026-10-14", "10");
  const spent = await call(termsApi, deps, { path: "/api/v1/terms", env: env2, body: { session: p2.session, job_id: "j",
    setup: p2.setup, items: ITEMS } });
  assert.deepEqual([spent.status, spent.body.code], [429, "budget_exhausted"]);
  assert.equal(env.AI.calls.length + env2.AI.calls.length, 0);
});

test("terms API: an answer that is not the JSON asked for is 502 model_error; its neurons count, no unit does", async () => {
  const MARK = "ZQXSECRETMARK";
  const env = termsEnv({ AI: fakeAI(() => chatAnswer("I could not find terms in " + MARK, { prompt: 700, completion: 30 })) });
  const deps = depsFor();
  const { session, setup } = await prepared(env, deps);
  const items = ITEMS.map((it) => ({ ...it, src: it.src + " " + MARK }));
  const [r, lines] = await withConsoleSpy(() => call(termsApi, deps, { path: "/api/v1/terms", env,
    body: { session, job_id: "j", setup, items } }));
  assert.deepEqual([r.status, r.body.code], [502, "model_error"]);
  assert.ok(!JSON.stringify(r.body).includes(MARK));
  for (const l of lines) assert.ok(!l.includes(MARK) && !l.includes("carcinom") && !l.includes("biopsy"), l);
  assert.ok(lines.some((l) => l.includes("model_error") && l.includes("json")), lines.join("\n"));
  const v = await verifySession(TEST_SESSION_SECRET, session, NOW);
  assert.equal(await env.COUNTERS.get("v1:s:2026-10-14:" + v.sid), "1", "only the classify unit");
  assert.ok(Number(await env.COUNTERS.get("v1:b:2026-10-14")) > 0, "the spent neurons count");
  const env3 = termsEnv({ AI: fakeAI(() => { throw new Error("3036: You have used up your daily free allocation"); }) });
  const p3 = await prepared(env3, deps);
  const r3 = await call(termsApi, deps, { path: "/api/v1/terms", env: env3, body: { session: p3.session, job_id: "j",
    setup: p3.setup, items: ITEMS } });
  assert.deepEqual([r3.status, r3.body.code], [429, "budget_exhausted"]);
});
