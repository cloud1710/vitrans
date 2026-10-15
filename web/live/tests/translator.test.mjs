// The live page's translation side (web/live/translator.js): the /api/v1/translate live call (profile "live", the
// session, one renewal on 401, one retry after a network / server failure) and the queue of committed sentences
// (batches of <= 3 sentences that commit together, <= 2 requests in flight, newest first when it falls behind, a
// memory of sentences already translated, quota errors stop it). Mocked fetch only; synthetic text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveApi, createLiveQueue, prevContext, newJobId, WAIT_KEEP } from "../translator.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return handler(body, calls.length);
  };
  f.calls = calls;
  return f;
}

const okAnswer = (body) => jsonRes(200, { results: body.segments.map((s) => ({ id: s.id, text: "VI " + s.tagged,
  level: 0, flags: [] })), usage: { calls: 1 }, quota: { segments_left_today: 10 }, live: { minutes_left_today: 200 } });

function apiWith(fetch, extra = {}) {
  let token = "tok-1";
  const renewals = [];
  const api = createLiveApi({ fetch, jobId: "live-ABCDEFGHIJKLMNOPQRSTUV", setup: () => ({ packs: [{ id: "p",
    version: "1.0.0" }], hits: [] }), session: async () => token, renew: async () => { renewals.push(1); token = "tok-2"; },
    sleep: async () => {}, ...extra });
  return { api, renewals };
}

test("newJobId: live- + 22 url-safe characters, fresh each time", () => {
  const a = newJobId();
  assert.match(a, /^live-[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, newJobId());
});

test("prevContext: the previous 1-2 sentences, at most 300 characters, nearest kept", () => {
  assert.equal(prevContext([]), "");
  assert.equal(prevContext(["A one.", "B two.", "C three."]), "B two. C three.");
  const long = "x".repeat(295) + ".";
  assert.equal(prevContext(["Short one.", long]), long);
});

test("the live call: profile live, the job id, the setup's packs with no hits, {id, tagged, prev} only", async () => {
  const fetch = fakeFetch(okAnswer);
  const { api } = apiWith(fetch);
  const out = await api.translate([{ id: 4, en: "The margin is clear.", prev: "We start." }]);
  assert.deepEqual(out.results.map((r) => r.text), ["VI The margin is clear."]);
  assert.equal(fetch.calls[0].url, "/api/v1/translate");
  assert.deepEqual(fetch.calls[0].body, { session: "tok-1", job_id: "live-ABCDEFGHIJKLMNOPQRSTUV", profile: "live",
    setup: { packs: [{ id: "p", version: "1.0.0" }], hits: [] }, segments: [{ id: 4, tagged: "The margin is clear.",
      prev: "We start." }] });
});

test("401 renews the session once and sends again; a network failure is tried once more; 429 is final", async () => {
  const f401 = fakeFetch((b, n) => (n === 1 ? jsonRes(401, { code: "session_expired" }) : okAnswer(b)));
  const a = apiWith(f401);
  await a.api.translate([{ id: 1, en: "One.", prev: "" }]);
  assert.equal(a.renewals.length, 1);
  assert.deepEqual(f401.calls.map((c) => c.body.session), ["tok-1", "tok-2"]);
  let n = 0;
  const flaky = async (url, init) => { n += 1; if (n === 1) throw new TypeError("fetch failed"); return okAnswer(JSON.parse(init.body)); };
  const b = apiWith(flaky);
  assert.equal((await b.api.translate([{ id: 1, en: "One.", prev: "" }])).results.length, 1);
  assert.equal(n, 2);
  const f429 = fakeFetch(() => jsonRes(429, { code: "live_time_exceeded", message: "x" }));
  const c = apiWith(f429);
  await assert.rejects(c.api.translate([{ id: 1, en: "One.", prev: "" }]), (e) => e.code === "live_time_exceeded");
  assert.equal(f429.calls.length, 1);
  const f502 = fakeFetch(() => jsonRes(502, { code: "model_error" }));
  const d = apiWith(f502);
  await assert.rejects(d.api.translate([{ id: 1, en: "One.", prev: "" }]), (e) => e.code === "model_error");
  assert.equal(f502.calls.length, 2, "one retry, no more");
});

function queueWith(translate, opts = {}) {
  const shown = [];
  const states = [];
  const q = createLiveQueue({ translate, onResult: (id, r) => shown.push([id, r]), onState: (s) => states.push(s), ...opts });
  return { q, shown, states };
}

test("sentences committed together go in one request (<= 3); at most 2 requests in flight", async () => {
  const sent = [];
  const gates = [];
  const translate = (items) => new Promise((resolve) => {
    sent.push(items.map((i) => i.id));
    gates.push(() => resolve({ results: items.map((i) => ({ id: i.id, text: "VI " + i.en, flags: [] })) }));
  });
  const { q, shown } = queueWith(translate);
  for (const id of [1, 2, 3, 4]) q.add({ id, en: "Sentence " + id + "." , prev: "" });
  await tick();
  assert.deepEqual(sent, [[1, 2, 3], [4]]);
  q.add({ id: 5, en: "Sentence 5.", prev: "" });
  await tick();
  assert.equal(sent.length, 2, "two in flight: the fifth waits");
  gates[0]();
  await tick();
  await tick();
  assert.deepEqual(sent[2], [5]);
  assert.deepEqual(shown.map(([id]) => id), [1, 2, 3]);
  gates[1](); gates[2]();
  await tick(); await tick();
  assert.deepEqual(shown.map(([id]) => id).sort(), [1, 2, 3, 4, 5]);
});

test("falling behind: with more than 2 waiting the newest goes first, the older ones still follow", async () => {
  const sent = [];
  const gates = [];
  const translate = (items) => new Promise((resolve) => {
    sent.push(items.map((i) => i.id));
    gates.push(() => resolve({ results: items.map((i) => ({ id: i.id, text: "VI", flags: [] })) }));
  });
  const { q, shown } = queueWith(translate, { maxBatch: 1 });
  q.add({ id: 1, en: "a.", prev: "" });
  q.add({ id: 2, en: "b.", prev: "" });
  await tick();
  for (const id of [3, 4, 5, 6]) q.add({ id, en: id + ".", prev: "" });
  await tick();
  gates[0]();
  await tick(); await tick();
  assert.deepEqual(sent[2], [6], "newest first");
  gates[1](); await tick(); await tick();
  gates[2](); await tick(); await tick();
  gates[3](); await tick(); await tick();
  gates[4](); await tick(); await tick();
  gates[5] && gates[5](); await tick(); await tick();
  assert.deepEqual(shown.map(([id]) => id).sort(), [1, 2, 3, 4, 5, 6], "nothing is lost");
});

test("a sentence said again is answered from memory without a request; a revision is translated again", async () => {
  let n = 0;
  const translate = async (items) => { n += 1; return { results: items.map((i) => ({ id: i.id, text: "VI " + i.en, flags: [] })) }; };
  const { q, shown } = queueWith(translate);
  q.add({ id: 1, en: "Next slide please.", prev: "" });
  await tick(); await tick();
  q.add({ id: 7, en: "Next slide please.", prev: "x" });
  await tick(); await tick();
  assert.equal(n, 1);
  assert.deepEqual(shown[1], [7, { id: 7, text: "VI Next slide please.", flags: [], cached: true }]);
  q.add({ id: 1, en: "Next slides, please.", prev: "", revision: true });
  await tick(); await tick();
  assert.equal(n, 2);
  assert.equal(shown[2][1].text, "VI Next slides, please.");
  assert.equal(shown[2][1].revision, true);
});

test("a quota error stops the queue: the sentences waiting and later ones come back with the error at once", async () => {
  const translate = async () => { throw Object.assign(new Error("x"), { code: "budget_exhausted" }); };
  const { q, shown, states } = queueWith(translate);
  q.add({ id: 1, en: "One.", prev: "" });
  await tick(); await tick();
  assert.deepEqual(states, ["budget_exhausted"]);
  assert.equal(shown[0][1].error, "budget_exhausted");
  q.add({ id: 2, en: "Two.", prev: "" });
  await tick();
  assert.equal(shown[1][1].error, "budget_exhausted");
  const t2 = async () => { throw Object.assign(new Error("x"), { code: "model_error" }); };
  const other = queueWith(t2);
  other.q.add({ id: 1, en: "One.", prev: "" });
  await tick(); await tick();
  assert.equal(other.shown[0][1].error, "model_error");
  assert.deepEqual(other.states, [], "a model error is per sentence, the queue goes on");
});

test("deadline answers (empty text) are not remembered", async () => {
  let n = 0;
  const translate = async (items) => { n += 1; return { results: items.map((i) => ({ id: i.id, text: "", flags: ["deadline"] })) }; };
  const { q } = queueWith(translate);
  q.add({ id: 1, en: "Same.", prev: "" });
  await tick(); await tick();
  q.add({ id: 2, en: "Same.", prev: "" });
  await tick(); await tick();
  assert.equal(n, 2);
});

test("no session yet: sentences wait (no request, no answer); when it comes the last 5 go, the older ones are skipped", async () => {
  let ready = false;
  const sent = [];
  const translate = async (items) => { sent.push(items.map((i) => i.id)); return { results: items.map((i) => ({ id: i.id,
    text: "VI " + i.en, flags: [] })) }; };
  const { q, shown } = queueWith(translate, { ready: () => ready });
  for (let i = 1; i <= 8; i++) q.add({ id: i, en: "Sentence " + i + ".", prev: "" });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(sent, [], "nothing sent before the session");
  assert.deepEqual(shown, [], "nothing marked meanwhile");
  assert.equal(WAIT_KEEP, 5);
  ready = true;
  q.release();
  await tick(); await tick(); await tick();
  assert.deepEqual(shown.filter(([, r]) => r.error).map(([id, r]) => [id, r.error]), [[1, "skipped"], [2, "skipped"],
    [3, "skipped"]]);
  assert.deepEqual(sent.flat().sort((x, y) => x - y), [4, 5, 6, 7, 8]);
  q.add({ id: 9, en: "Sentence 9.", prev: "" });
  await tick(); await tick();
  assert.ok(sent.flat().includes(9), "with the session the queue runs as before");
  // stopped before any session: what waits is skipped, nothing sent
  const other = queueWith(translate, { ready: () => false });
  other.q.add({ id: 1, en: "Late one.", prev: "" });
  other.q.release(0);
  await tick();
  assert.deepEqual(other.shown.map(([id, r]) => [id, r.error]), [[1, "skipped"]]);
});

test("a 401 renews with the token that failed (a session another tool renewed meanwhile is kept)", async () => {
  let token = "tok-1";
  const got = [];
  const fetch = fakeFetch((body, n) => (n === 1 ? jsonRes(401, { code: "session_expired" }) : okAnswer(body)));
  const api = createLiveApi({ fetch, jobId: "live-ABCDEFGHIJKLMNOPQRSTUV", setup: () => ({ packs: [], hits: [] }),
    session: async () => token, renew: async (used) => { got.push(used); token = "tok-2"; }, sleep: async () => {} });
  await api.translate([{ id: 1, en: "One.", prev: "" }]);
  assert.deepEqual(got, ["tok-1"]);
  assert.deepEqual(fetch.calls.map((c) => c.body.session), ["tok-1", "tok-2"]);
});

test("a sentence answered from memory keeps its term repair (en_fixed, repairs)", async () => {
  const translate = async (items) => ({ results: items.map((i) => ({ id: i.id, text: "VI", flags: [],
    en_fixed: "The cell block.", repairs: [{ from: "sell block", to: "cell block" }] })) });
  const { q, shown } = queueWith(translate);
  q.add({ id: 1, en: "The sell block.", prev: "" });
  await tick(); await tick();
  q.add({ id: 2, en: "The sell block.", prev: "" });
  await tick(); await tick();
  assert.deepEqual(shown[1], [2, { id: 2, text: "VI", flags: [], cached: true, en_fixed: "The cell block.",
    repairs: [{ from: "sell block", to: "cell block" }] }]);
});
