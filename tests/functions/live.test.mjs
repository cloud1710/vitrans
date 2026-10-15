// The live-captions profile of POST /api/v1/translate (profile "live", the /live/ page): a short fixed system prompt
// per job (prefix cache), the glossary hits of THIS sentence and the previous 1-2 sentences in the user message, no
// read-back, at most one retry (a failed call or the QA gate), a per-request deadline, x-session-affinity = the live
// job id, at most LIVE_BUDGET_SHARE of the day and LIVE_MINUTES_PER_DAY of one live job per day. The file and photo
// profiles stay byte-identical to the core. Synthetic text only; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionApi, classifyApi, translateApi } from "../../functions/_lib/api.js";
import { packSetOf } from "../../functions/_lib/engine.js";
import { LIVE_SYSTEM_MARK, buildLiveSystem, buildLiveUser } from "../../functions/_lib/live.js";
import { REPAIR_MARK } from "../../functions/_lib/repair.js";
import { prepareTranslation, buildUser } from "../../web/engine/core.js";
import { makeEnv, makeCtx, readJson, fakeAI, chatAnswer, sourceOf, fakeSiteverify, TEST_PASS, syntheticBundle,
  withConsoleSpy, MODEL } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 15, 8, 0, 0);
const DAY = "2026-10-15";
const JOB = "live-AbCdEfGhIjKlMnOpQrStUv";
const noSleep = async () => {};

const S1 = "Okay so today we look at the biopsy from the left breast.";
const S2 = "The lymph node was clear of any deposit.";
const S3 = "Next slide please.";
const VI = {
  [S1]: "Hôm nay chúng ta xem mẫu sinh thiết từ vú trái.",
  [S2]: "Hạch bạch huyết không có ổ di căn nào.",
  [S3]: "Mời chuyển trang tiếp theo.",
};

function liveAI(over = {}) {
  return fakeAI((inputs) => chatAnswer(VI[sourceOf(inputs)] || "Câu khác.", { prompt: 300, completion: 20, cached: 200,
    ...over }));
}

function setupEnv(over = {}) {
  return makeEnv({ AI: liveAI(), ALLOW_TEST_TURNSTILE: "1", ...over });
}

function depsFor(now = NOW) {
  const sv = fakeSiteverify(TEST_PASS);
  return { bundle: syntheticBundle(), fetch: sv.fetch, now: () => now, sleep: noSleep };
}

async function call(api, deps, opts) {
  const ctx = makeCtx(opts);
  const res = await api(ctx, deps);
  return { res, ctx, status: res.status, body: await readJson(res) };
}

async function openLive(env, deps, text = S1 + " " + S2 + " tumour biopsy") {
  const s = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, env });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const c = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session: s.body.session, text }, env });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return { session: s.body.session, setup: c.body.setup };
}

function liveBody(o, segments, extra = {}) {
  return { session: o.session, job_id: JOB, profile: "live", setup: o.setup, segments, ...extra };
}

const send = (env, deps, body) => call(translateApi, deps, { path: "/api/v1/translate", env, body });

test("live: a short fixed system prompt per job; the user message has only this sentence's glossary and prev", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const o = await openLive(env, deps);
  assert.ok(o.setup.hits.length >= 2, "the classify setup carries whole-text hits");
  const r1 = await send(env, deps, liveBody(o, [{ id: 1, tagged: S1 }]));
  const r2 = await send(env, deps, liveBody(o, [{ id: 2, tagged: S2, prev: S1 }]));
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const calls = env.AI.calls;
  assert.equal(calls.length, 2, "one model call per clean sentence (no read-back)");
  const [sys1, sys2] = calls.map((c) => c.inputs.messages[0].content);
  assert.equal(sys1, sys2, "the same system prompt for the whole live job (prefix cache)");
  assert.ok(sys1.includes(LIVE_SYSTEM_MARK));
  assert.ok(!sys1.includes("sinh thiết") && !sys1.includes("Glossary"), "no whole-text glossary in the system prompt");
  assert.ok(sys1.length < 1500, "short: " + sys1.length);
  assert.match(sys1, /filler/i);
  const u1 = calls[0].inputs.messages[1].content;
  const u2 = calls[1].inputs.messages[1].content;
  assert.ok(u1.includes("biopsy = sinh thiết") && !u1.includes("lymph node ="), u1);
  assert.ok(u2.includes("lymph node = hạch bạch huyết") && !u2.includes("biopsy ="), u2);
  assert.ok(u2.includes("Previous paragraph (context only, do not translate): " + S1), u2);
  assert.ok(u1.endsWith("Translate:\n" + S1) && u2.endsWith("Translate:\n" + S2));
  assert.equal(u2, buildLiveUser(S2, S1, [["lymph node", "hạch bạch huyết"]]));
  assert.equal(sys1, buildLiveSystem("Alpha y khoa"));
  for (const c of calls) {
    assert.deepEqual(c.options, { extraHeaders: { "x-session-affinity": JOB } });
    assert.deepEqual(c.inputs.chat_template_kwargs, { enable_thinking: false });
    assert.equal(c.model, MODEL);
  }
  assert.equal(r1.body.results[0].text, VI[S1]);
  assert.deepEqual(r1.body.results[0].flags, []);
  assert.equal(r2.body.results[0].id, 2);
  assert.ok(Number.isFinite(r1.body.results[0].ms));
  assert.equal(r1.body.live.minutes_left_today, 239, "the first minute of the job is counted");
});

// a mis-heard glossary term ("lymph node" of the synthetic pack, heard as one word: a merged word passes the lexicon gate)
const MIS = "The lymphnode was clear of any deposit.";
const FIXED = "The lymph node was clear of any deposit.";
const VI_FIXED = "Hạch bạch huyết không có ổ di căn nào.";

test("live term repair: numbered candidates in the user message, USE picks the repairs (en_fixed, repairs)", async () => {
  const env = setupEnv({ AI: fakeAI((inputs) => chatAnswer(sourceOf(inputs) === MIS ? "USE: 1\nVI: " +
    VI_FIXED : VI[sourceOf(inputs)])) });
  const deps = depsFor();
  const o = await openLive(env, deps);
  const r = await send(env, deps, liveBody(o, [{ id: 1, tagged: MIS, prev: S1 }, { id: 2, tagged: S2 }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const byId = new Map(r.body.results.map((x) => [x.id, x]));
  assert.equal(env.AI.calls.length, 2, "one call per sentence");
  const users = env.AI.calls.map((c) => c.inputs.messages[1].content);
  const user = users.find((u) => u.endsWith("Translate:\n" + MIS));
  assert.ok(user.includes(REPAIR_MARK), user);
  assert.ok(user.includes("\n1. \"lymphnode\" -> lymph node = hạch bạch huyết"), user);
  assert.ok(user.includes("Previous paragraph (context only, do not translate): " + S1), user);
  assert.equal(env.AI.calls[0].inputs.messages[0].content, buildLiveSystem("Alpha y khoa"), "the same system prompt");
  assert.deepEqual([byId.get(1).text, byId.get(1).en_fixed, byId.get(1).repairs, byId.get(1).flags],
    [VI_FIXED, FIXED, [{ from: "lymphnode", to: "lymph node" }], []]);
  // a sentence without candidates: the plain live prompt, the source as en_fixed
  assert.equal(users.find((u) => u.endsWith("Translate:\n" + S2)), buildLiveUser(S2, "", [["lymph node",
    "hạch bạch huyết"]]));
  assert.deepEqual([byId.get(2).en_fixed, byId.get(2).repairs], [S2, []]);
});

test("live term repair: the checks run against the repaired English", async () => {
  const env = setupEnv({ AI: fakeAI(() => chatAnswer("USE: 1\nVI: Không có ổ di căn nào.")) });
  const deps = depsFor();
  const o = await openLive(env, deps);
  const r = await send(env, deps, liveBody(o, [{ id: 1, tagged: MIS }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.results[0].en_fixed, FIXED);
  assert.ok(r.body.results[0].flags.includes("glossary_miss:lymph node"), JSON.stringify(r.body.results[0].flags));
});

test("live term repair: none used, an answer without the lines or an unknown number -> en_fixed is the source", async () => {
  for (const answer of ["USE: none\nVI: " + VI_FIXED, VI_FIXED, "USE: 7\nVI: " + VI_FIXED]) {
    const env = setupEnv({ AI: fakeAI(() => chatAnswer(answer)) });
    const deps = depsFor();
    const o = await openLive(env, deps);
    const r = await send(env, deps, liveBody(o, [{ id: 1, tagged: MIS }]));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.results[0].text, r.body.results[0].en_fixed, r.body.results[0].repairs],
      [VI_FIXED, MIS, []], answer);
  }
});

test("live term repair: the one retry translates the repaired English with the plain live prompt", async () => {
  const env = setupEnv({ AI: fakeAI((inputs, o, k) => chatAnswer(k === 1 ? "USE: 1\nVI: " + FIXED :
    VI_FIXED)) });
  const deps = depsFor();
  const o = await openLive(env, deps);
  const r = await send(env, deps, liveBody(o, [{ id: 1, tagged: MIS, prev: S1 }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(env.AI.calls.length, 2);
  const retry = env.AI.calls[1].inputs.messages[1].content;
  assert.ok(retry.endsWith("Translate:\n" + FIXED) && !retry.includes(REPAIR_MARK) && !retry.includes("Previous"),
    retry);
  assert.ok(retry.includes("lymph node = hạch bạch huyết"), "the glossary hits of the repaired English");
  const res = r.body.results[0];
  assert.deepEqual([res.text, res.en_fixed, res.level], [VI_FIXED, FIXED, 2]);
  assert.ok(res.flags.includes("retried:english"), JSON.stringify(res.flags));
});

test("live: the term-lock still applies (term fixes of the job's packs)", async () => {
  const src = "The tumour is small.";
  const env = setupEnv({ AI: fakeAI(() => chatAnswer("Khối bướu nhỏ.")) });
  const deps = depsFor();
  const o = await openLive(env, deps);
  const r = await send(env, deps, liveBody(o, [{ id: "a", tagged: src }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.results[0].text, "U nhỏ.");
  assert.ok(r.body.results[0].flags.includes("term_fix:tumour"));
});

test("live: at most one retry -- an answer left in English is retried once without context, then flagged", async () => {
  const env = setupEnv({ AI: fakeAI((inputs) => chatAnswer(sourceOf(inputs))) });
  const deps = depsFor();
  const o = await openLive(env, deps);
  const r = await send(env, deps, liveBody(o, [{ id: 1, tagged: S2, prev: S1 }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(env.AI.calls.length, 2);
  assert.ok(!env.AI.calls[1].inputs.messages[1].content.includes("Previous paragraph"), "the retry runs without prev");
  const f = r.body.results[0].flags;
  assert.ok(f.includes("retried:english") && f.includes("unchanged"), JSON.stringify(f));
});

test("live: a failed call is tried once more; two failures are 502 model_error; 3036 is budget_exhausted", async () => {
  let n = 0;
  const flaky = setupEnv({ AI: fakeAI((inputs) => {
    n += 1;
    if (n === 1) throw new Error("3040: Capacity temporarily exceeded");
    return chatAnswer(VI[sourceOf(inputs)]);
  }) });
  const deps = depsFor();
  const o = await openLive(flaky, deps);
  const ok = await send(flaky, deps, liveBody(o, [{ id: 1, tagged: S1 }]));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(flaky.AI.calls.length, 2);
  assert.equal(ok.body.results[0].text, VI[S1]);
  const down = setupEnv({ AI: fakeAI(() => { throw new Error("3040: Capacity temporarily exceeded"); }) });
  const o2 = await openLive(down, deps);
  const bad = await send(down, deps, liveBody(o2, [{ id: 1, tagged: S1 }]));
  assert.deepEqual([bad.status, bad.body.code], [502, "model_error"]);
  assert.equal(down.AI.calls.length, 2, "never more than two calls for a sentence");
  const broke = setupEnv({ AI: fakeAI(() => { throw new Error("3036: daily free allocation exceeded"); }) });
  const o3 = await openLive(broke, deps);
  const spent = await send(broke, deps, liveBody(o3, [{ id: 1, tagged: S1 }]));
  assert.deepEqual([spent.status, spent.body.code], [429, "budget_exhausted"]);
  assert.equal(broke.AI.calls.length, 1);
});

test("live: the request deadline -- no answer in time is an empty text flagged deadline; a late retry keeps the first", async () => {
  const slow = setupEnv({ LIVE_DEADLINE_MS: "60", AI: fakeAI(() => new Promise((res) => setTimeout(() =>
    res(chatAnswer("Muộn.")), 400))) });
  const deps = depsFor();
  const o = await openLive(slow, deps);
  const t0 = Date.now();
  const r = await send(slow, deps, liveBody(o, [{ id: 1, tagged: S1 }, { id: 2, tagged: S3 }]));
  const took = Date.now() - t0;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(took < 300, "answered at the deadline, not after the model: " + took + " ms");
  for (const res of r.body.results) {
    assert.equal(res.text, "");
    assert.deepEqual(res.flags, ["deadline"]);
  }
  await Promise.all(r.ctx.waits);  // the late calls' neurons are still counted after the answer
  assert.ok(Number(await slow.COUNTERS.get("v1:l:" + DAY)) > 0, "late neurons reach the live counter");
  let k = 0;
  const lateRetry = setupEnv({ LIVE_DEADLINE_MS: "120", AI: fakeAI((inputs) => {
    k += 1;
    if (k === 1) return chatAnswer(sourceOf(inputs));  // English: the gate asks for a retry
    return new Promise((res) => setTimeout(() => res(chatAnswer("Quá muộn.")), 400));
  }) });
  const o2 = await openLive(lateRetry, deps);
  const r2 = await send(lateRetry, deps, liveBody(o2, [{ id: 1, tagged: S2 }]));
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.results[0].text, S2, "the first answer is kept");
  assert.ok(r2.body.results[0].flags.includes("deadline"), JSON.stringify(r2.body.results[0].flags));
});

test("live: requests are small (<= 3 sentences, short text, no tags needed) and segments of the file shape pass", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const o = await openLive(env, deps);
  const four = [1, 2, 3, 4].map((id) => ({ id, tagged: S3 }));
  const many = await send(env, deps, liveBody(o, four));
  assert.deepEqual([many.status, many.body.code], [400, "bad_request"]);
  const long = await send(env, deps, liveBody(o, [{ id: 1, tagged: "word ".repeat(400) }]));
  assert.deepEqual([long.status, long.body.code], [413, "too_large"]);
  const three = await send(env, deps, liveBody(o, [1, 2, 3].map((id) => ({ id, tagged: [S1, S2, S3][id - 1],
    prev: "", nxt: "", where: "00:00:0" + id, essential: [] }))));
  assert.equal(three.status, 200, JSON.stringify(three.body));
  assert.deepEqual(three.body.results.map((r) => r.text), [VI[S1], VI[S2], VI[S3]]);
});

test("live: a live job has 4 hours a day (counted per active minute); its neurons count on the live share", async () => {
  const env = setupEnv();
  const deps = depsFor();
  const o = await openLive(env, deps);
  const body = liveBody(o, [{ id: 1, tagged: S3 }]);
  assert.equal((await send(env, deps, body)).body.live.minutes_left_today, 239);
  assert.equal((await send(env, deps, body)).body.live.minutes_left_today, 239, "the same minute counts once");
  const later = depsFor(NOW + 61 * 1000);
  assert.equal((await send(env, later, body)).body.live.minutes_left_today, 238);
  await env.COUNTERS.put("v1:t:" + DAY + ":" + JOB, "240");
  const over = await send(env, depsFor(NOW + 5 * 60 * 1000), body);
  assert.deepEqual([over.status, over.body.code], [429, "live_time_exceeded"]);
  const other = await send(env, deps, { ...body, job_id: "live-ZyXwVuTsRqPoNmLkJiHgFe" });
  assert.equal(other.status, 200, "another live job has its own hours");
  const next = await send(env, depsFor(NOW + 86400 * 1000), body);
  assert.notEqual(next.body.code, "live_time_exceeded", "a new UTC day starts again");
  assert.ok(Number(await env.COUNTERS.get("v1:l:" + DAY)) > 0);
  const capped = setupEnv({ LIVE_MINUTES_PER_DAY: "1" });
  const o2 = await openLive(capped, deps);
  assert.equal((await send(capped, deps, liveBody(o2, [{ id: 1, tagged: S3 }]))).status, 200);
  const r = await send(capped, later, liveBody(o2, [{ id: 1, tagged: S3 }]));
  assert.deepEqual([r.status, r.body.code], [429, "live_time_exceeded"]);
});

test("file and photo profiles are unchanged: the core's whole-document prompt and user message, byte for byte", async () => {
  const doc = [S1, S2, MIS];
  for (const profile of [undefined, "file", "photo"]) {
    const env = setupEnv();
    const deps = depsFor();
    const o = await openLive(env, deps, doc.join("\n"));
    const segments = doc.map((t, i) => ({ id: i, tagged: t, essential: [], prev: i ? doc[i - 1] : "",
      nxt: i ? "" : doc[1], where: "Doan " + (i + 1) }));
    const r = await send(env, deps, { session: o.session, job_id: "job-1", setup: o.setup, segments,
      ...(profile ? { profile } : {}) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const set = await packSetOf(deps.bundle);
    const ref = await prepareTranslation(doc.join("\n"), { packs: set });
    const users = env.AI.calls.map((c) => c.inputs.messages[1].content).sort();
    assert.deepEqual(users, segments.map((s) => buildUser(s.tagged, s.prev, s.nxt)).sort(), String(profile));
    for (const c of env.AI.calls) {
      assert.equal(c.inputs.messages[0].content, ref.system);
      assert.ok(!c.inputs.messages[0].content.includes(LIVE_SYSTEM_MARK));
      assert.ok(!c.inputs.messages[1].content.includes(REPAIR_MARK), "no term repair outside live");
    }
    assert.equal(r.body.live, undefined);
    for (const res of r.body.results) assert.ok(!("en_fixed" in res) && !("repairs" in res), JSON.stringify(res));
  }
});

test("live privacy: nothing of the sentence is logged; KV holds numbers under counter keys only", async () => {
  const MARK = "ZQXLIVEMARK";
  const env = setupEnv({ LIVE_DEADLINE_MS: "60", AI: fakeAI((inputs, o, k) => {
    if (k === 2) throw new Error("5007: No such model " + MARK);
    if (k === 3) return new Promise((res) => setTimeout(() => res(chatAnswer(MARK)), 200));
    return chatAnswer(MARK + " " + sourceOf(inputs), { reasoning: MARK });
  }) });
  const deps = depsFor();
  const [, lines] = await withConsoleSpy(async () => {
    const o = await openLive(env, deps);
    const waits = [];
    for (let i = 0; i < 3; i++) {
      const r = await send(env, deps, liveBody(o, [{ id: i, tagged: S1 + " " + MARK, prev: MARK }]));
      waits.push(...r.ctx.waits);
    }
    await Promise.all(waits);
  });
  for (const l of lines) assert.ok(!l.includes(MARK) && !l.includes("biopsy") && !l.includes(JOB), l);
  for (const [key, { value }] of env.COUNTERS.map) {
    assert.match(key, /^v1:(?:[bsil]:\d{4}-\d{2}-\d{2}(?::[A-Za-z0-9_-]{22})?|[tu]:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_-]{1,64}|m:\d{4}-\d{2})$/);
    assert.match(value, /^\d+(\.\d+)?$/);
  }
});
