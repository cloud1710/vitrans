// The live page's caption sources (web/live/sources.js) with fakes: the browser speech recognizer (continuous,
// interim results, en-US, restarted when it ends, its final + interim text as one snapshot) and the helper's caption
// stream (POST /api/live/start {source} on the first port that answers, SSE /api/live/stream {t, source, text, seq},
// POST /api/live/stop). Synthetic text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecognizerSource, createHelperSource, recognizerText, HELPER_PORTS, autoStartOk, bilingual,
  HELPER_RETRY_MS, HELPER_RETRY_FOR_MS, helperOk, agreeAndStart, startInOrder } from "../sources.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

class FakeRecognition {
  static last = null;
  static count = 0;
  constructor() {
    FakeRecognition.last = this;
    FakeRecognition.count += 1;
    this.started = 0;
    this.stopped = 0;
  }
  start() { this.started += 1; }
  stop() { this.stopped += 1; if (this.onend) this.onend(); }
  abort() { this.stop(); }
  emit(results) {
    const list = results.map(([text, isFinal]) => Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal }));
    this.onresult({ resultIndex: 0, results: list });
  }
}

test("recognizerText: the final results then the interim ones, spaces normalised, the last words kept", () => {
  const r = (t, f) => Object.assign([{ transcript: t }], { isFinal: f });
  assert.equal(recognizerText([r("Hello everyone.", true), r(" today we", false)]), "Hello everyone. today we");
  const many = Array.from({ length: 500 }, (_, i) => r("w" + i, true));
  const text = recognizerText(many);
  assert.equal(text.split(" ").length, 400);
  assert.ok(text.endsWith("w499"));
});

test("recognizer: continuous, interim, en-US; text per result; restarted with an empty snapshot when it ends", async () => {
  const texts = [];
  const states = [];
  const src = createRecognizerSource({ Recognition: FakeRecognition, onText: (t) => texts.push(t),
    onState: (s) => states.push(s), restartMs: 0 });
  src.start();
  const rec = FakeRecognition.last;
  assert.deepEqual([rec.continuous, rec.interimResults, rec.lang, rec.started], [true, true, "en-US", 1]);
  rec.emit([["Good morning", false]]);
  rec.emit([["Good morning everyone.", true], [" Today", false]]);
  assert.deepEqual(texts, ["Good morning", "Good morning everyone. Today"]);
  rec.onend();
  await tick();
  assert.equal(texts[texts.length - 1], "", "an end flushes the segmenter");
  assert.equal(rec.started, 2, "started again");
  rec.onerror({ error: "no-speech" });
  rec.onend();
  await tick();
  assert.equal(rec.started, 3);
  src.stop();
  assert.equal(rec.stopped, 1);
  await tick();
  assert.equal(rec.started, 3, "stopped: no restart");
  assert.ok(states.includes("listening"));
});

test("recognizer: a refused microphone stops it with mic_denied; no recognizer at all is unsupported", async () => {
  const states = [];
  const src = createRecognizerSource({ Recognition: FakeRecognition, onText: () => {}, onState: (s) => states.push(s),
    restartMs: 0 });
  src.start();
  const rec = FakeRecognition.last;
  rec.onerror({ error: "not-allowed" });
  rec.onend();
  await tick();
  assert.equal(rec.started, 1);
  assert.ok(states.includes("mic_denied"));
  const none = createRecognizerSource({ Recognition: null, onText: () => {}, onState: (s) => states.push(s) });
  assert.equal(none.supported, false);
  none.start();
  assert.equal(states[states.length - 1], "unsupported");
});

class FakeES {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    this.listeners = {};
    FakeES.all.push(this);
  }
  addEventListener(name, f) { (this.listeners[name] = this.listeners[name] || []).push(f); }
  close() { this.closed = true; this.readyState = 2; }
  send(name, data) { for (const f of this.listeners[name] || []) f({ data: JSON.stringify(data) }); }
}

test("helper: start on the first port that answers, captions from the stream, stop", async () => {
  const posts = [];
  const fetch = async (url, init) => {
    posts.push([url, init.method, init.body ? JSON.parse(init.body) : null]);
    if (url.startsWith("http://127.0.0.1:47831")) throw new TypeError("refused");
    return new Response("{\"ok\":true}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const texts = [];
  const states = [];
  const src = createHelperSource({ fetch, EventSource: FakeES, onText: (t) => texts.push(t),
    onState: (s) => states.push(s) });
  assert.deepEqual(HELPER_PORTS, [47831, 47832, 47833, 47834, 47835]);
  const ok = await src.start("windows");
  assert.equal(ok, true);
  assert.deepEqual(posts.slice(0, 2), [["http://127.0.0.1:47831/api/live/start", "POST", { source: "windows", hide: true }],
    ["http://127.0.0.1:47832/api/live/start", "POST", { source: "windows", hide: true }]]);
  const es = FakeES.all[FakeES.all.length - 1];
  assert.equal(es.url, "http://127.0.0.1:47832/api/live/stream");
  es.send("message", { t: 1, source: "windows", text: "Hello every", seq: 1 });
  es.send("caption", { t: 2, source: "windows", text: "Hello everyone.", seq: 2 });
  es.send("message", { t: 3, source: "windows", text: "Hello everyone.", seq: 2 });
  assert.deepEqual(texts, ["Hello every", "Hello everyone."], "a repeated seq is ignored");
  es.send("status", { state: "waiting", source: "auto", active: null, code: "not_running", message: "x", seq: 3 });
  assert.equal(states[states.length - 1], "waiting", "the helper's status events: no caption window yet");
  es.send("status", { state: "error", source: "auto", active: null, code: "uia_changed", message: "x", seq: 3 });
  assert.equal(states[states.length - 1], "uia_changed");
  es.send("status", { state: "listening", source: "auto", active: "windows", code: null, message: null, seq: 3 });
  assert.equal(states[states.length - 1], "listening");
  assert.deepEqual(texts, ["Hello every", "Hello everyone."], "status events carry no caption");
  es.readyState = 2;
  for (const f of es.listeners.error || []) f({});
  assert.equal(states[states.length - 1], "lost");
  await src.stop();
  assert.equal(es.closed, true);
  assert.deepEqual(posts[posts.length - 1], ["http://127.0.0.1:47832/api/live/stop", "POST", {}]);
});

test("helper: no port answers -> no_helper, nothing opened", async () => {
  const before = FakeES.all.length;
  const states = [];
  const src = createHelperSource({ fetch: async () => { throw new TypeError("refused"); }, EventSource: FakeES,
    onText: () => {}, onState: (s) => states.push(s) });
  assert.equal(await src.start("chrome"), false);
  assert.deepEqual(states, ["no_helper"]);
  assert.equal(FakeES.all.length, before);
});

test("auto-start: only on Windows with the helper source chosen and the consent given, never twice", () => {
  const ok = { helperOk: true, source: "helper", consent: "yes", running: false };
  assert.equal(autoStartOk(ok), true);
  assert.equal(autoStartOk({ ...ok, helperOk: false }), false, "not Windows desktop");
  assert.equal(autoStartOk({ ...ok, source: "mic" }), false, "the microphone needs a click");
  assert.equal(autoStartOk({ ...ok, consent: null }), false, "the consent first");
  assert.equal(autoStartOk({ ...ok, running: true }), false, "already running");
});

test("bilingual: Vietnamese only unless the stored choice says on", () => {
  assert.equal(bilingual(null), false);
  assert.equal(bilingual("off"), false);
  assert.equal(bilingual("on"), true);
});

const okFetch = (posts, answerFrom) => async (url, init) => {
  posts.push([url, init.body ? JSON.parse(init.body) : null]);
  if (posts.length < answerFrom || url.startsWith("http://127.0.0.1:47831")) throw new TypeError("refused");
  return new Response("{}", { status: 200 });
};

test("helper retry: no helper yet -> no_helper_retry, tried again every 2 s, started when it answers", async () => {
  assert.equal(HELPER_RETRY_MS, 2000);
  assert.equal(HELPER_RETRY_FOR_MS, 60000);
  const posts = [];
  const waits = [];
  let now = 0;
  const states = [];
  const src = createHelperSource({ fetch: okFetch(posts, 12), EventSource: FakeES, onText: () => {},
    onState: (s) => states.push(s), now: () => now, wait: async (ms) => { waits.push(ms); now += ms; } });
  const before = FakeES.all.length;
  assert.equal(await src.start("auto", { retry: true }), true);
  assert.deepEqual(waits, [2000, 2000], "two rounds of 5 ports refused, the third answers");
  assert.equal(states.filter((s) => s === "no_helper_retry").length, 1, "said once");
  assert.equal(states[states.length - 1], "listening");
  assert.equal(FakeES.all.length, before + 1);
  assert.deepEqual(posts[posts.length - 1], ["http://127.0.0.1:47832/api/live/start", { source: "auto", hide: true }]);
});

test("helper retry: gives up after 60 s with no_helper", async () => {
  let now = 0;
  const states = [];
  let tries = 0;
  const src = createHelperSource({ fetch: async () => { tries += 1; throw new TypeError("refused"); },
    EventSource: FakeES, onText: () => {}, onState: (s) => states.push(s), now: () => now,
    wait: async (ms) => { now += ms; } });
  assert.equal(await src.start("auto", { retry: true }), false);
  assert.equal(states[states.length - 1], "no_helper");
  assert.equal(tries, 5 * 31, "every 2 s for 60 s: 31 rounds");
});

test("helper retry: a stop while it waits ends it; a helper answering after the stop is told to stop", async () => {
  const posts = [];
  let release;
  const states = [];
  let src;
  const fetch = async (url, init) => {
    posts.push([url, init.body ? JSON.parse(init.body) : null]);
    if (posts.length <= 5) throw new TypeError("refused");
    if (url.endsWith("/api/live/start")) await src.stop();  // the page left while this start was on its way
    return new Response("{}", { status: 200 });
  };
  src = createHelperSource({ fetch, EventSource: FakeES, onText: () => {}, onState: (s) => states.push(s),
    now: () => 0, wait: () => new Promise((r) => { release = r; }) });
  const before = FakeES.all.length;
  const started = src.start("auto", { retry: true });
  await tick();
  release();
  assert.equal(await started, false);
  assert.equal(FakeES.all.length, before, "no stream opened");
  assert.deepEqual(posts[posts.length - 1], ["http://127.0.0.1:47831/api/live/stop", {}]);
  assert.ok(!states.includes("listening"));
});

test("helper: a docked Live Captions is its own state", async () => {
  const states = [];
  const src = createHelperSource({ fetch: async () => new Response("{}", { status: 200 }), EventSource: FakeES,
    onText: () => {}, onState: (s) => states.push(s) });
  await src.start("auto");
  const es = FakeES.all[FakeES.all.length - 1];
  es.send("status", { state: "listening", code: "docked", message: "x", source: "auto", active: "windows", seq: 1 });
  assert.equal(states[states.length - 1], "docked");
  await src.stop();
});

const UA = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 " +
    "Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile " +
    "Safari/537.36",
  winTablet: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Touch) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36",
};

test("helper source only on a Windows desktop: never on iPhone, Android or iPadOS (a Mac user agent with touch)", () => {
  assert.equal(helperOk(UA.windows, 0), true);
  assert.equal(helperOk(UA.winTablet, 10), true, "a Windows touch laptop is still Windows");
  assert.equal(helperOk(UA.iphone, 5), false);
  assert.equal(helperOk(UA.android, 5), false);
  assert.equal(helperOk(UA.mac, 5), false, "iPadOS reports a Mac");
  assert.equal(helperOk(UA.mac, 0), false, "a Mac: no helper source either");
});

test("consent: agreeing starts the session inside the same click, before anything async", () => {
  const order = [];
  const done = agreeAndStart({ agreed: true, save: () => order.push("save"), begin: () => order.push("begin") });
  assert.equal(done, true);
  assert.deepEqual(order, ["save", "begin"], "synchronous: the recognizer starts within the gesture (iOS Safari)");
  const none = [];
  assert.equal(agreeAndStart({ agreed: false, save: () => none.push(1), begin: () => none.push(2) }), false);
  assert.deepEqual(none, []);
});

test("start order: the helper source starts only once the session exists (a failed check never launches it)", async () => {
  const order = [];
  let pass;
  const run = startInOrder({ mic: false, startSource: () => { order.push("source"); return Promise.resolve(true); },
    session: () => new Promise((r) => { pass = r; }), onSession: () => order.push("session"), alive: () => true });
  await tick();
  assert.deepEqual(order, [], "the helper waits for the browser check");
  pass("tok");
  await run;
  assert.deepEqual(order, ["session", "source"]);
  const failed = [];
  await assert.rejects(startInOrder({ mic: false, startSource: () => failed.push("source"),
    session: async () => { throw Object.assign(new Error("x"), { code: "bad_turnstile" }); },
    onSession: () => failed.push("session"), alive: () => true }), (e) => e.code === "bad_turnstile");
  assert.deepEqual(failed, [], "Live Captions never launched");
  const stopped = [];
  await startInOrder({ mic: false, startSource: () => stopped.push("source"), session: async () => "tok",
    onSession: () => stopped.push("session"), alive: () => false });
  assert.deepEqual(stopped, [], "stopped while the check ran");
});

test("start order: the microphone starts at once, inside the tap, before the session", async () => {
  const order = [];
  let pass;
  const run = startInOrder({ mic: true, startSource: () => { order.push("source"); return true; },
    session: () => new Promise((r) => { pass = r; }), onSession: () => order.push("session"), alive: () => true });
  assert.deepEqual(order, ["source"], "synchronous: nothing awaited before the recognizer starts");
  pass("tok");
  await run;
  assert.deepEqual(order, ["source", "session"]);
});
