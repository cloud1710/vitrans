// The browser check -> session flow shared by the tool pages (web/turnstile.js): Cloudflare Turnstile renders once
// (explicit, interaction-only) and is reset for every new session; the single-use token opens a session through
// web/cloud.js; a valid session is reused; the site's key everywhere but on 127.0.0.1 / localhost (test key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionFlow, createCheckHub, turnstileSiteKey, TURNSTILE_TEST_KEY, TURNSTILE_SITE_KEY } from "../turnstile.js";
import { createCloud, createSessionStore } from "../cloud.js";

// a Turnstile stand-in: render() / reset() hand out a new token at once
function fakeTurnstile() {
  const t = { renders: 0, resets: 0, options: null, n: 0 };
  t.render = (el, options) => { t.renders += 1; t.options = options; setTimeout(() => options.callback("tok-" + ++t.n)); return "w1"; };
  t.reset = () => { t.resets += 1; setTimeout(() => t.options.callback("tok-" + ++t.n)); };
  return t;
}

// a cloud API stand-in: /session answers with a session for any token it has not seen
function fakeFetch(seen) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body.turnstile);
    return { ok: true, status: 200, json: async () => ({ session: "s-" + body.turnstile, expires_s: 3600,
      quota: { segments_left_today: 99 } }) };
  };
}

test("the site key: the test key on 127.0.0.1 / localhost only", () => {
  assert.equal(turnstileSiteKey("127.0.0.1"), TURNSTILE_TEST_KEY);
  assert.equal(turnstileSiteKey("localhost"), TURNSTILE_TEST_KEY);
  assert.equal(turnstileSiteKey("vitrans.pages.dev"), TURNSTILE_SITE_KEY);
});

test("ensure(): one render, a session per token, reused while valid, reset for a new one", async () => {
  const ts = fakeTurnstile(), seen = [], lines = [];
  const cloud = createCloud({ fetch: fakeFetch(seen) });
  const flow = createSessionFlow({ cloud, box: () => ({}), log: (l) => lines.push(l), hostname: "127.0.0.1",
    loadApi: async () => ts });
  await flow.ensure();
  assert.equal(cloud.session.token, "s-tok-1");
  assert.equal(ts.options.sitekey, TURNSTILE_TEST_KEY);
  assert.equal(ts.options.appearance, "interaction-only");
  await flow.ensure();
  assert.deepEqual(seen, ["tok-1"]);  // still valid: no new token
  await flow.renew();
  assert.equal(cloud.session.token, "s-tok-2");
  assert.deepEqual([ts.renders, ts.resets], [1, 1]);
  assert.ok(lines.some((l) => /99/.test(l)));
});

test("ensure(): a Turnstile error rejects with bad_turnstile; an abort rejects with AbortError", async () => {
  const ts = fakeTurnstile();
  ts.render = (el, options) => { setTimeout(() => options["error-callback"]("110200")); return "w1"; };
  const flow = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch([]) }), box: () => ({}), loadApi: async () => ts });
  await assert.rejects(flow.ensure(), (e) => e.code === "bad_turnstile");
  const ts2 = fakeTurnstile();
  ts2.render = () => "w1";  // never answers
  const flow2 = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch([]) }), box: () => ({}), loadApi: async () => ts2 });
  const ctrl = new AbortController();
  const p = flow2.ensure(ctrl.signal);
  setTimeout(() => ctrl.abort(), 5);
  await assert.rejects(p, (e) => e.name === "AbortError");
});

// ---- one Turnstile check at a time for the whole page (his report 2026-10-15): a shared hub, the check shown in the
// box of the tool that asks, no automatic retries (retry "never"), a "Thử lại" button after a failure

// a Turnstile stand-in that answers only when told: widgets by id, their options and boxes
function manualTurnstile() {
  const t = { renders: [], resets: [], removed: [], widgets: new Map(), n: 0 };
  t.render = (el, options) => { const id = "w" + (t.renders.length + 1); t.renders.push(el); t.widgets.set(id, { el, options }); return id; };
  t.reset = (id) => { t.resets.push(id); };
  t.remove = (id) => { t.removed.push(id); t.widgets.delete(id); };
  t.live = () => [...t.widgets.values()].pop();
  t.pass = () => t.live().options.callback("tok-" + ++t.n);
  t.fail = (code) => t.live().options["error-callback"](code);
  return t;
}

// a box with just enough DOM for the failure note: append / remove, buttons that can be clicked
function fakeBox(name) {
  const make = (tag) => {
    const el = { tag, children: [], textContent: "", parent: null, listeners: {}, hidden: false, className: "",
      append(...k) { for (const c of k) { c.parent = el; el.children.push(c); } },
      remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); el.parent = null; },
      addEventListener(type, fn) { el.listeners[type] = fn; },
      click() { el.listeners.click && el.listeners.click(); } };
    return el;
  };
  const box = make("div");
  box.name = name;
  box.ownerDocument = { createElement: make };
  box.find = (tag) => { const all = []; const walk = (e) => { for (const c of e.children) { if (c.tag === tag) all.push(c); walk(c); } }; walk(box); return all; };
  box.text = () => { let s = ""; const walk = (e) => { s += e.textContent || ""; for (const c of e.children) walk(c); }; walk(box); return s; };
  return box;
}

const tickT = () => new Promise((r) => setTimeout(r, 0));

test("shared hub: two tools, one check; asked from another box meanwhile -> the check moves there; one session", async () => {
  const ts = manualTurnstile(), seen = [];
  const store = createSessionStore({ storage: null });
  const hub = createCheckHub({ loadApi: async () => ts });
  const boxA = fakeBox("a"), boxB = fakeBox("b");
  const a = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch(seen), store }), box: () => boxA, hub, hostname: "127.0.0.1" });
  const b = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch(seen), store }), box: () => boxB, hub, hostname: "127.0.0.1" });
  const pa = a.ensure();
  await tickT();
  assert.deepEqual(ts.renders, [boxA]);
  const opt = ts.live().options;
  assert.equal(opt.retry, "never");
  assert.equal(opt["refresh-expired"], "auto");
  assert.equal(opt.appearance, "interaction-only");
  const pb = b.ensure();
  await tickT();
  assert.deepEqual(ts.renders, [boxA, boxB], "shown in the box of the tool that asked last");
  assert.deepEqual(ts.removed, ["w1"], "never two checks at once");
  ts.pass();
  await Promise.all([pa, pb]);
  assert.deepEqual(seen, ["tok-1"], "one session for both tools");
  await a.ensure();
  await b.ensure();
  assert.equal(ts.renders.length + ts.resets.length, 2, "no new check while the session is valid");
});

test("shared hub: before-interactive tells the asking tool the checkbox shows; after-interactive / the end clear it", async () => {
  const ts = manualTurnstile(), prompts = [];
  const flow = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch([]) }), box: () => fakeBox("x"),
    loadApi: async () => ts, onPrompt: (on) => prompts.push(on) });
  const p = flow.ensure();
  await tickT();
  ts.live().options["before-interactive-callback"]();
  assert.deepEqual(prompts, [true]);
  ts.live().options["after-interactive-callback"]();
  ts.pass();
  await p;
  assert.equal(prompts[prompts.length - 1], false);
});

test("a failed check: bad_turnstile with its code, no automatic retry; Thử lại resets the widget once per click", async () => {
  const ts = manualTurnstile(), seen = [], retried = [];
  const box = fakeBox("x");
  const flow = createSessionFlow({ cloud: createCloud({ fetch: fakeFetch(seen) }), box: () => box, loadApi: async () => ts,
    onRetried: (err) => retried.push(err || null) });
  const p = flow.ensure();
  await tickT();
  assert.equal(ts.fail("600010"), true, "the error is handled (no console noise)");
  await assert.rejects(p, (e) => e.code === "bad_turnstile" && e.turnstileCode === "600010");
  await tickT();
  assert.deepEqual(ts.resets, [], "no retry by itself");
  assert.match(box.text(), /600010/);
  const [btn] = box.find("button");
  assert.equal(btn.textContent, "Thử lại");
  btn.click();
  await tickT();
  assert.deepEqual(ts.resets, ["w1"], "one reset per click");
  assert.equal(box.find("button").length, 0, "the note goes while the check runs");
  ts.pass();
  await tickT(); await tickT();
  assert.deepEqual(seen, ["tok-1"]);
  assert.deepEqual(retried, [null], "the tool hears that the retry opened a session");
  assert.equal(box.find("button").length, 0);
});

test("renew(signal, used): a session another tool renewed meanwhile is kept; the failing one is replaced", async () => {
  const ts = fakeTurnstile(), seen = [];
  const store = createSessionStore({ storage: null });
  const hub = createCheckHub({ loadApi: async () => ts });
  const cloud = createCloud({ fetch: fakeFetch(seen), store });
  const flow = createSessionFlow({ cloud, box: () => ({}), hub });
  await flow.ensure();
  const first = cloud.session.token;
  await flow.renew(undefined, first);
  assert.deepEqual(seen, ["tok-1", "tok-2"]);
  await flow.renew(undefined, first);  // the stale token again: the current session was renewed already
  assert.deepEqual(seen, ["tok-1", "tok-2"]);
});
