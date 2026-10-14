// The page's client of the cloud engine (web/cloud.js): the same-origin Pages Functions API of spec Amendment F
// (session from a Turnstile token, classify once, translate in batches of <= 20 with a job id), retries with backoff,
// quota / budget errors, session renewal and abort. A scripted fake fetch: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCloud, cloudJob, CloudError, API_BASE, BATCH_SIZE, BACKOFF_MS, CONCURRENCY } from "../cloud.js";

// answers: path -> function(body, call#) -> { status, body } | Error (thrown by fetch)
function fakeApi(answers) {
  const calls = [];
  const counts = {};
  const fetch = async (url, init) => {
    const path = String(url).slice(API_BASE.length);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: (init && init.method) || "GET", path, body });
    counts[path] = (counts[path] || 0) + 1;
    if (init && init.signal && init.signal.aborted) throw new DOMException("aborted", "AbortError");
    const answer = answers[path];
    if (!answer) return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
    const a = answer(body, counts[path]);
    if (a instanceof Error) throw a;
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body), { status: a.status || 200,
      headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

const SESSION = () => ({ body: { session: "tok-1", expires_s: 3600, quota: { segments_left_today: 500 } } });
const echo = (body) => ({ body: { results: body.segments.map((s) => ({ id: s.id, text: s.tagged + " (vi)", level: 0,
  flags: [] })), usage: { neurons: 12 } } });
const segs = (n) => Array.from({ length: n }, (_, i) => ({ id: i, tagged: "Segment <g1>" + i + "</g1>", where: "Body" }));

function clock(t) {
  const c = { t: t || 1000000, now: () => c.t };
  return c;
}

test("status is a GET of /api/v1/status; a session comes from a Turnstile token and expires before the server's", async () => {
  const c = clock();
  const api = fakeApi({ status: () => ({ body: { ok: true, model: "@cf/google/gemma-4-26b-a4b-it", budget_left_today: 0.8 } }),
    session: SESSION });
  const cloud = createCloud({ fetch: api.fetch, now: c.now });
  assert.equal(API_BASE, "/api/v1/");
  assert.deepEqual(await cloud.status(), { ok: true, model: "@cf/google/gemma-4-26b-a4b-it", budget_left_today: 0.8 });
  assert.equal(api.calls[0].method, "GET");
  assert.equal(cloud.hasSession(), false);
  const s = await cloud.openSession("XXXX.DUMMY.TOKEN.XXXX");
  assert.deepEqual(api.calls[1].body, { turnstile: "XXXX.DUMMY.TOKEN.XXXX" });
  assert.equal(api.calls[1].method, "POST");
  assert.equal(s.token, "tok-1");
  assert.deepEqual(s.quota, { segments_left_today: 500 });
  assert.equal(cloud.hasSession(), true);
  c.t += (3600 - 31) * 1000;
  assert.equal(cloud.hasSession(), true);
  c.t += 1000;
  assert.equal(cloud.hasSession(), false, "renewed 30 s before the server's expiry");
});

test("session errors keep the server's code: bad_turnstile (403), quota_exceeded (429); a non-JSON 5xx is server_error", async () => {
  for (const [status, code] of [[403, "bad_turnstile"], [429, "quota_exceeded"]]) {
    const cloud = createCloud({ fetch: fakeApi({ session: () => ({ status, body: { code } }) }).fetch });
    await assert.rejects(cloud.openSession("t"), (e) => e instanceof CloudError && e.code === code && e.status === status);
    assert.equal(cloud.hasSession(), false);
  }
  const html = createCloud({ fetch: fakeApi({ status: () => ({ status: 503, body: "<html>down</html>" }) }).fetch });
  await assert.rejects(html.status(), (e) => e.code === "server_error" && e.status === 503);
  const offline = createCloud({ fetch: fakeApi({ status: () => new TypeError("Failed to fetch") }).fetch });
  await assert.rejects(offline.status(), (e) => e.code === "network");
});

const EVENT = { offline: false, unavailable: [], candidates: [],
  packs: [{ id: "pathology", name: "Giải phẫu bệnh", score: 0.3, matched: ["biopsy"], reason: "match", version: "0.1.8" }] };
const SETUP = { packs: [{ id: "pathology", version: "0.1.8" }], hits: ["biopsy", "tumour"] };

test("classify gets the whole document text once (whole-document glossary hits, as the helper)", async () => {
  const api = fakeApi({ session: SESSION, classify: () => ({ body: { classify: EVENT, setup: SETUP, setup_id: "s-1" } }) });
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const whole = "biopsy tumour ".repeat(3000);  // 42,000 characters: no sample, no cap
  await cloudJob(cloud, { jobId: "job-1" }).prepare(whole, { domain: "", signal: null });
  const sent = api.calls.filter((c) => c.path === "classify");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.session, "tok-1");
  assert.equal(sent[0].body.text, whole);
  assert.equal("domain" in sent[0].body, false);
  // the user's pack choice (translateFile's comma-separated domain) goes along as ids
  await cloudJob(cloud, { jobId: "job-2" }).prepare("text", { domain: "pathology, pathology-breast" });
  assert.deepEqual(api.calls.filter((c) => c.path === "classify")[1].body.domain, ["pathology", "pathology-breast"]);
});

test("every translate batch of the document carries the classify setup as given: setup_id + setup {packs, hits}", async () => {
  for (const answer of [{ classify: EVENT, setup: SETUP, setup_id: "s-1" }, Object.assign({}, EVENT, { setup: SETUP, setup_id: "s-1" })]) {
    const api = fakeApi({ session: SESSION, classify: () => ({ body: answer }), translate: echo });
    const cloud = createCloud({ fetch: api.fetch });
    await cloud.openSession("t");
    const job = cloudJob(cloud, { jobId: "job-1" });
    const setup = await job.prepare("biopsy text", {});
    assert.equal(setup.classify.stage, "classify");
    assert.deepEqual(setup.classify.packs, EVENT.packs);
    assert.equal("setup" in setup.classify || "setup_id" in setup.classify, false);
    await job.translateSegments(segs(45));
    const batches = api.calls.filter((c) => c.path === "translate").map((c) => c.body);
    assert.equal(batches.length, 3);
    for (const b of batches) {
      // the server checks the setup: exactly {packs, hits}, and setup_id must be its hash (functions/_lib/engine.js)
      assert.deepEqual(Object.keys(b).sort(), ["job_id", "segments", "session", "setup", "setup_id"]);
      assert.equal(b.setup_id, "s-1");
      assert.deepEqual(b.setup, SETUP);
      assert.equal(b.job_id, "job-1");
    }
  }
  // a server that answers the bare classify event: packs from the event, no hits, no setup id
  const old = fakeApi({ session: SESSION, classify: () => ({ body: EVENT }), translate: echo });
  const cloud = createCloud({ fetch: old.fetch });
  await cloud.openSession("t");
  const job = cloudJob(cloud, { jobId: "j" });
  await job.prepare("x", {});
  await job.translateSegments(segs(1));
  const body = old.calls.find((c) => c.path === "translate").body;
  assert.deepEqual(body.setup, { packs: [{ id: "pathology", version: "0.1.8" }], hits: [] });
  assert.equal("setup_id" in body, false);
});

test("prepare() turns the classify answer into the pipeline's setup (classify event, packs for the report)", async () => {
  const api = fakeApi({ session: SESSION, classify: () => ({ body: { offline: false, unavailable: ["Thiếu"], candidates: [],
    packs: [{ id: "pathology", name: "Giải phẫu bệnh", score: 0.3, matched: ["biopsy"], reason: "match", version: "0.1.8" },
      { id: "pathology-breast", name: "GPB vú", score: 0.2, matched: [], reason: "match", version: "0.1.1" }] } }) });
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const setup = await cloudJob(cloud, { jobId: "j" }).prepare("biopsy text", { domain: "", signal: null });
  assert.equal(setup.classify.stage, "classify");
  assert.deepEqual(setup.classify.unavailable, ["Thiếu"]);
  assert.deepEqual(setup.packRows.map((r) => [r.id, r.version, r.source]), [["pathology", "0.1.8", null],
    ["pathology-breast", "0.1.1", null]]);
  assert.deepEqual(setup.pack, { id: "pathology+pathology-breast", name: "Giải phẫu bệnh + GPB vú",
    key: "pathology@0.1.8+pathology-breast@0.1.1" });
  assert.deepEqual(setup.unavailableNames, ["Thiếu"]);
  assert.equal(setup.offline, false);
  const none = fakeApi({ session: SESSION, classify: () => ({ body: { offline: false, unavailable: [], candidates: [], packs: [] } }) });
  const c2 = createCloud({ fetch: none.fetch });
  await c2.openSession("t");
  assert.deepEqual((await cloudJob(c2, { jobId: "j" }).prepare("x", {})).pack, { id: "_none", name: "Chung", key: "_none@0" });
});

test("segments go with their neighbour context and essential spans (text only); result fields pass through", async () => {
  const api = fakeApi({ session: SESSION, translate: (body) => ({ body: { results: body.segments.map((s) => ({ id: s.id,
    text: "x", level: 3, flags: ["formatting_lost"], reduced: true, spans: [1], cached: false })) } }) });
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const seg = { id: 7, tagged: "A <g1>b</g1> <g2>c</g2>", essential: [1], prev: "Before.", nxt: "After.", where: "Slide 2",
    extra: { not: "sent" } };
  const [r] = await cloudJob(cloud, { jobId: "j" }).translateSegments([seg], { setup: {}, tm: null, signal: null });
  assert.deepEqual(api.calls.find((c) => c.path === "translate").body.segments,
    [{ id: 7, tagged: "A <g1>b</g1> <g2>c</g2>", where: "Slide 2", prev: "Before.", nxt: "After.", essential: [1] }]);
  assert.deepEqual(r, { id: 7, text: "x", level: 3, flags: ["formatting_lost"], reduced: true, spans: [1], cached: false });
});

test("translateSegments sends batches of at most 20 with the job id and returns the results in segment order", async () => {
  const api = fakeApi({ session: SESSION, translate: (body) => {
    const r = echo(body);
    r.body.results.reverse();  // the server may answer in any order
    return r;
  } });
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const done = [];
  const job = cloudJob(cloud, { jobId: "job-9" });
  const out = await job.translateSegments(segs(45), { onBatch: (n, batch) => done.push([n, batch[0].id, batch.length]) });
  const batches = api.calls.filter((c) => c.path === "translate").map((c) => c.body);
  assert.equal(BATCH_SIZE, 20);
  assert.deepEqual(batches.map((b) => b.segments.length), [20, 20, 5]);
  assert.ok(batches.every((b) => b.job_id === "job-9" && b.session === "tok-1" && Array.isArray(b.setup.packs)));
  assert.deepEqual(batches[0].segments[0], { id: 0, tagged: "Segment <g1>0</g1>", where: "Body" });
  assert.deepEqual(out.map((r) => r.id), segs(45).map((s) => s.id));
  assert.equal(out[44].text, "Segment <g1>44</g1> (vi)");
  assert.deepEqual(done, [[20, 0, 20], [40, 20, 20], [45, 40, 5]]);  // each batch's results, in order, as they arrive
  assert.equal(job.usage.neurons, 36);
});

test("a failed batch is retried twice with backoff (model_error, server error, network), then the job fails", async () => {
  const slept = [];
  const sleep = async (ms) => { slept.push(ms); };
  let n = 0;
  const flaky = fakeApi({ session: SESSION, translate: (body) => (++n <= 2 ? { status: 502, body: { code: "model_error" } } : echo(body)) });
  const cloud = createCloud({ fetch: flaky.fetch, sleep });
  await cloud.openSession("t");
  const retries = [];
  const out = await cloudJob(cloud, { jobId: "j", onRetry: (k, e) => retries.push([k, e.code]) }).translateSegments(segs(3));
  assert.equal(out.length, 3);
  assert.deepEqual(slept, BACKOFF_MS);
  assert.deepEqual(retries, [[1, "model_error"], [2, "model_error"]]);
  const dead = fakeApi({ session: SESSION, translate: () => new TypeError("Failed to fetch") });
  const c2 = createCloud({ fetch: dead.fetch, sleep: async () => {} });
  await c2.openSession("t");
  await assert.rejects(cloudJob(c2, { jobId: "j" }).translateSegments(segs(2)), (e) => e.code === "network");
  assert.equal(dead.calls.filter((c) => c.path === "translate").length, 3);
});

test("quota and budget answers stop the job at once, without retries", async () => {
  for (const code of ["quota_exceeded", "budget_exhausted"]) {
    const api = fakeApi({ session: SESSION, translate: () => ({ status: 429, body: { code } }) });
    const cloud = createCloud({ fetch: api.fetch, sleep: async () => { throw new Error("no backoff expected"); } });
    await cloud.openSession("t");
    await assert.rejects(cloudJob(cloud, { jobId: "j" }).translateSegments(segs(100)), (e) => e.code === code && e.status === 429);
    // the first window of batches went out together; each once, and no batch after them
    assert.equal(api.calls.filter((c) => c.path === "translate").length, CONCURRENCY);
  }
});

// ---- batches in flight at once (the long lecture took 652 s with one batch after another) ----

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200,
  headers: { "content-type": "application/json" } });

// A translate API whose answers take time (delayOf(body) ms) and honour the request's abort signal; records the
// requests in flight. The session endpoint answers tok-1, tok-2, ...
function slowApi(delayOf, answer) {
  const st = { inFlight: 0, max: 0, sent: [], aborted: [], sessions: 0 };
  const fetch = (url, init) => new Promise((resolve, reject) => {
    const path = String(url).slice(API_BASE.length);
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (path === "session") {
      st.sessions += 1;
      resolve(json({ session: "tok-" + st.sessions, expires_s: 3600, quota: {} }));
      return;
    }
    st.sent.push(body);
    st.inFlight += 1;
    st.max = Math.max(st.max, st.inFlight);
    let settled = false;
    const t = setTimeout(() => { settled = true; st.inFlight -= 1; resolve(answer(body)); }, delayOf(body));
    const sig = init && init.signal;
    if (sig) {
      sig.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        st.inFlight -= 1;
        st.aborted.push(body.segments[0].id);
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    }
  });
  return { fetch, st };
}

test("up to 3 batches in flight per job; results and onBatch in segment order when later batches finish first", async () => {
  assert.equal(CONCURRENCY, 3);
  // batch k (first id 20 k) answers after (7 - k) * 15 ms: the later batches come back first
  const api = slowApi((b) => (7 - b.segments[0].id / 20) * 15, (b) => json(echo(b).body));
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const done = [];
  const job = cloudJob(cloud, { jobId: "job-c" });
  const out = await job.translateSegments(segs(130), { onBatch: (n, batch) => done.push([n, batch[0].id, batch.length]) });
  assert.equal(api.st.max, 3, "three requests in flight at once, never more");
  assert.equal(api.st.sent.length, 7);
  assert.ok(api.st.sent.every((b) => b.job_id === "job-c" && b.session === "tok-1" && b.segments.length <= BATCH_SIZE));
  assert.deepEqual(out.map((r) => r.id), segs(130).map((s) => s.id));
  assert.deepEqual(done, [[20, 0, 20], [40, 20, 20], [60, 40, 20], [80, 60, 20], [100, 80, 20], [120, 100, 20],
    [130, 120, 10]]);
  assert.equal(job.usage.neurons, 7 * 12);
});

test("a 429 stops the job: the batches in flight are aborted and no other batch is sent", async () => {
  for (const code of ["quota_exceeded", "budget_exhausted"]) {
    // the 2nd batch is refused at once; the others would take 200 ms
    const api = slowApi((b) => (b.segments[0].id === 20 ? 5 : 200),
      (b) => (b.segments[0].id === 20 ? json({ code }, 429) : json(echo(b).body)));
    const cloud = createCloud({ fetch: api.fetch, sleep: async () => { throw new Error("no backoff expected"); } });
    await cloud.openSession("t");
    const shown = [];
    await assert.rejects(cloudJob(cloud, { jobId: "j" }).translateSegments(segs(100), { onBatch: (n) => shown.push(n) }),
      (e) => e instanceof CloudError && e.code === code && e.status === 429);
    assert.equal(api.st.sent.length, 3, "the first window only");
    assert.deepEqual(api.st.aborted.sort((a, b) => a - b), [0, 40], "the two others in flight were stopped");
    assert.deepEqual(shown, []);
  }
});

test("cancel stops every batch in flight with AbortError", async () => {
  const ctrl = new AbortController();
  const api = slowApi(() => 10000, (b) => json(echo(b).body));
  const cloud = createCloud({ fetch: api.fetch });
  await cloud.openSession("t");
  const p = cloudJob(cloud, { jobId: "j", signal: ctrl.signal }).translateSegments(segs(100));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(api.st.inFlight, 3);
  ctrl.abort();
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.equal(api.st.inFlight, 0);
  assert.equal(api.st.sent.length, 3);
});

test("batches in flight that meet an expired session together renew it once and are sent again", async () => {
  const api = slowApi(() => 10, (b) => (b.session === "tok-1" ? json({ code: "session_expired" }, 401) : json(echo(b).body)));
  const cloud = createCloud({ fetch: api.fetch, sleep: async () => {} });
  await cloud.openSession("t1");
  let renewed = 0;
  // as the page does it: drop the session, then a new Turnstile token (slow) -> a new session
  const renew = async () => {
    renewed += 1;
    cloud.dropSession();
    await new Promise((r) => setTimeout(r, 30));
    await cloud.openSession("t2");
  };
  const out = await cloudJob(cloud, { jobId: "j", renew }).translateSegments(segs(60));
  assert.deepEqual(out.map((r) => r.id), segs(60).map((s) => s.id));
  assert.equal(renewed, 1);
  assert.deepEqual(api.st.sent.map((b) => b.session), ["tok-1", "tok-1", "tok-1", "tok-2", "tok-2", "tok-2"]);
});

test("an expired session (401) is renewed once through the page's renew() and the batch is sent again", async () => {
  let first = true;
  const api = fakeApi({ session: (body, k) => ({ body: { session: "tok-" + k, expires_s: 3600, quota: {} } }),
    translate: (body) => {
      if (first) { first = false; return { status: 401, body: { code: "session_expired" } }; }
      return echo(body);
    } });
  const cloud = createCloud({ fetch: api.fetch, sleep: async () => {} });
  await cloud.openSession("t1");
  let renewed = 0;
  const job = cloudJob(cloud, { jobId: "j", renew: async () => { renewed += 1; await cloud.openSession("t2"); } });
  const out = await job.translateSegments(segs(2));
  assert.equal(out.length, 2);
  assert.equal(renewed, 1);
  const sessions = api.calls.filter((c) => c.path === "translate").map((c) => c.body.session);
  assert.deepEqual(sessions, ["tok-1", "tok-2"]);
  // calls without a session are refused before anything is sent
  await assert.rejects(createCloud({ fetch: api.fetch }).classify("x"), (e) => e.code === "no_session");
});

test("abort: during the backoff or before a call the job stops with AbortError", async () => {
  const ctrl = new AbortController();
  const api = fakeApi({ session: SESSION, translate: () => ({ status: 502, body: { code: "model_error" } }) });
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    ctrl.abort();
    if (signal && signal.aborted) reject(new DOMException("aborted", "AbortError"));
    else resolve();
  });
  const cloud = createCloud({ fetch: api.fetch, sleep });
  await cloud.openSession("t");
  await assert.rejects(cloudJob(cloud, { jobId: "j", signal: ctrl.signal }).translateSegments(segs(2)),
    (e) => e.name === "AbortError");
  const done = new AbortController();
  done.abort();
  await assert.rejects(cloudJob(cloud, { jobId: "j", signal: done.signal }).classify("x"), (e) => e.name === "AbortError");
});

test("an answer that misses a segment or has no results is a bad response (retried, then reported)", async () => {
  const api = fakeApi({ session: SESSION, translate: (body) => ({ body: { results: body.segments.slice(1).map((s) => ({
    id: s.id, text: "x", level: 0, flags: [] })) } }) });
  const cloud = createCloud({ fetch: api.fetch, sleep: async () => {} });
  await cloud.openSession("t");
  await assert.rejects(cloudJob(cloud, { jobId: "j" }).translateSegments(segs(2)), (e) => e.code === "bad_response");
  assert.equal(api.calls.filter((c) => c.path === "translate").length, 3);
});
