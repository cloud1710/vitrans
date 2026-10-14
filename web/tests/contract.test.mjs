// The page's cloud client against the Pages Functions' own handlers (functions/_lib/api.js) in Node: the requests the
// page sends (web/cloud.js), the handlers' real checks (Turnstile, session, setup / setup_id, segment shape, limits),
// the shared core translating with the Functions tests' scripted Workers AI (tests/functions/helpers.mjs). The text
// mode, and a synthetic .docx through the page pipeline (translateFile with the injected prepare / translateSegments).
// No network.
import "../engine/tests/dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionApi, classifyApi, translateApi, statusApi } from "../../functions/_lib/api.js";
import { makeEnv, echoAI, fakeSiteverify, TEST_PASS, syntheticBundle, ORIGIN } from "../../tests/functions/helpers.mjs";
import { createCloud, cloudJob, BATCH_SIZE, CONCURRENCY } from "../cloud.js";
import { textSegments, textOutput } from "../text.js";
import { translateFile } from "../engine/pipeline.js";

const ROUTES = { "/api/v1/session": sessionApi, "/api/v1/classify": classifyApi, "/api/v1/translate": translateApi,
  "/api/v1/status": statusApi };

// fetch for createCloud: every request goes to the handler of its path, as the Pages runtime would route it.
// answer(source) -> the scripted model's answer (default: echoAI's "Bản dịch: <source>", English the gate refuses).
function functionsServer(answer) {
  const env = makeEnv({ AI: echoAI(answer ? { answer } : {}), ALLOW_TEST_TURNSTILE: "1" });
  const deps = { bundle: syntheticBundle(), fetch: fakeSiteverify(TEST_PASS).fetch, now: () => Date.now(),
    sleep: async () => {} };
  const calls = [];
  const fetch = async (url, init) => {
    const o = init || {};
    const method = o.method || "GET";
    const headers = new Headers(o.headers || {});
    headers.set("CF-Connecting-IP", "203.0.113.7");
    if (method !== "GET") headers.set("Origin", ORIGIN);
    const request = new Request(ORIGIN + String(url), { method, headers, body: o.body });
    const ctx = { request, env, params: {}, data: {}, waitUntil: () => {}, next: async () => new Response(null, { status: 404 }) };
    const res = await ROUTES[String(url)](ctx, deps);
    const copy = res.clone();
    calls.push({ path: String(url), status: res.status, body: o.body ? JSON.parse(o.body) : null,
      answer: await copy.json().catch(() => null) });
    return res;
  };
  return { fetch, calls, env };
}

async function session(server) {
  const cloud = createCloud({ fetch: server.fetch, sleep: async () => {} });
  const status = await cloud.status();
  assert.equal(status.ok, true);
  const s = await cloud.openSession("XXXX.DUMMY.TOKEN.XXXX");  // what Turnstile's always-pass test key hands out
  assert.ok(s.token && s.quota && Number.isFinite(s.quota.segments_left_today));
  return cloud;
}

const VI = {
  "The biopsy showed a tumour with clear margins.": "Sinh thiết cho thấy khối u, diện cắt không còn u.",
  "One lymph node held a small deposit.": "Một hạch bạch huyết có ổ di căn nhỏ.",
  "No other lesion.": "Không có tổn thương khác.",
};

test("text mode: the Functions accept the page's classify and translate requests and answer every paragraph", async () => {
  const server = functionsServer((src) => VI[src] || "?");
  const cloud = await session(server);
  const text = Object.keys(VI)[0] + "\n\n" + Object.keys(VI).slice(1).join("\n");
  const t = textSegments(text);
  const job = cloudJob(cloud, { jobId: "job-text-1" });
  const setup = await job.prepare(t.fullText, { domain: "" });
  assert.equal(setup.classify.stage, "classify");
  assert.ok(job.setup.setup_id, "the Functions answer a setup id");
  const results = await job.translateSegments(t.segments);
  assert.deepEqual(results.map((r) => r.id), [0, 1, 2]);
  assert.deepEqual(results.map((r) => r.text), Object.values(VI));
  assert.equal(textOutput(t, results), Object.values(VI)[0] + "\n\n" + Object.values(VI).slice(1).join("\n"));
  const failed = server.calls.filter((c) => c.status !== 200);
  assert.deepEqual(failed, [], "every request accepted");
  // what went over the wire: the setup as classify gave it, nested, with its id
  const tr = server.calls.find((c) => c.path === "/api/v1/translate").body;
  assert.deepEqual(Object.keys(tr).sort(), ["job_id", "segments", "session", "setup", "setup_id"]);
});

test("the Functions' checks are real: a string \"essential\" is refused and the page gets bad_request", async () => {
  const server = functionsServer((src) => VI[src] || "?");
  const cloud = await session(server);
  const t = textSegments(Object.keys(VI).join("\n"));
  const job = cloudJob(cloud, { jobId: "job-bad-1" });
  await job.prepare(t.fullText, { domain: "" });
  await assert.rejects(job.translateSegments(t.segments.map((s) => Object.assign({}, s, { essential: "tumour" }))),
    (e) => e.code === "bad_request");
  assert.equal(server.calls.at(-1).status, 400);
});

test("a .docx through the page pipeline with the Functions as its engine: written, read back, every batch accepted", async () => {
  const server = functionsServer();
  const cloud = await session(server);
  const job = cloudJob(cloud, { jobId: "job-file-1" });
  const bytes = new Uint8Array(readFileSync(new URL("../engine/tests/fixtures/codec_cases.docx", import.meta.url)));
  const events = [];
  // as the page does it: CONCURRENCY batches per pipeline call, sent together
  const res = await translateFile(bytes, "codec_cases.docx", { prepare: (text, o) => job.prepare(text, o),
    translateSegments: (segments, o) => job.translateSegments(segments, o), batchSize: BATCH_SIZE * CONCURRENCY,
    modelId: "@cf/google/gemma-4-26b-a4b-it", device: { kind: "cloud", name: "Cloudflare Workers AI" },
    onProgress: (ev) => events.push(ev.stage), yieldFn: async () => {} });
  assert.equal(res.name, "codec_cases_vi.docx");
  assert.ok(res.bytes.length > 1000);
  assert.equal(res.report.counts.segments, 23);
  assert.equal(res.report.device, "cloud");
  const tr = server.calls.filter((c) => c.path === "/api/v1/translate");
  assert.equal(tr.length, 2);  // 20 + 3
  assert.deepEqual(server.calls.filter((c) => c.status !== 200), []);
  assert.equal(new Set(tr.map((c) => c.body.setup_id)).size, 1);
  assert.ok(events.includes("classify") && events.includes("write") && events.at(-1) === "done");
});
