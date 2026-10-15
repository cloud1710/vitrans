// One engine adapter for the five tools (web/adapter.js): "Máy chủ" = the cloud API on this origin after the browser
// check; "Trên máy" = the same API on the ViTranslate helper (127.0.0.1, web/helper.js), no session. Trên máy NEVER
// calls the cloud: a fetch spy over the calls each tool makes (text, file/PDF, image, subtitles, live) sees only
// 127.0.0.1; without a helper the adapter says helper_not_found and sends nothing anywhere. Every API call is one log
// line (web/log.js) without any text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdapter, callLogger } from "../adapter.js";
import { createHelperLink, HELPER_PORTS, sentenceSeconds, speedText } from "../helper.js";
import { createCloud, cloudJob, createSessionStore } from "../cloud.js";
import { createLiveApi } from "../live/translator.js";
import { createLog } from "../log.js";
import { createPrefs } from "../prefs.js";

const SECRET = "Patient Tran Thi B: the tumour of the left breast";
const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

// a fetch spy that plays a helper on port 47832 (47831 refuses) and a cloud on the page's origin
function spyFetch({ helper = true } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, credentials: init && init.credentials });
    const u = String(url);
    if (u.startsWith("http://127.0.0.1:47832") && helper) {
      if (u.endsWith("/api/health")) return json(200, { app: "ViTranslate", model_ready: true });
      if (u.endsWith("/api/v1/classify")) return json(200, { stage: "classify", packs: [], candidates: [],
        offline: false, unavailable: [], setup: { packs: [], hits: [] }, setup_id: "s".repeat(64) });
      if (u.endsWith("/api/v1/translate")) return json(200, { results: body.segments.map((s) => ({ id: s.id,
        text: "VI", level: 0, flags: [], fixes: [], cached: false, reduced: false, spans: [] })) });
    }
    if (u.startsWith("http://127.0.0.1")) throw new TypeError("Failed to fetch");
    if (u.startsWith("/api/v1/")) return json(200, { session: "S", expires_s: 3600 });
    throw new Error("unexpected " + u);
  };
  return { fetch, calls };
}

function setup({ engine = "local", helper = true } = {}) {
  const spy = spyFetch({ helper });
  const log = createLog({ storage: () => null, now: () => 0 });
  const prefs = createPrefs({ storage: () => null });
  prefs.setEngine(engine);
  const link = createHelperLink({ fetch: spy.fetch, log });
  const store = createSessionStore({ storage: null });
  const cloud = createCloud({ fetch: spy.fetch, store, onCall: callLogger(() => "text", "cloud", log) });
  const flow = { ensured: 0, async ensure() { this.ensured += 1; store.set({ token: "T", expiresAt: 1e15 }); },
    renew: async () => {} };
  let tool = "text";
  const adapter = createAdapter({ cloud, flow, prefs, helper: link, log, fetch: spy.fetch, tool: () => tool });
  return { spy, log, prefs, link, cloud, flow, adapter, setTool: (t) => { tool = t; } };
}

const SEGS = [{ id: 0, tagged: SECRET, essential: [], prev: "", nxt: SECRET + " 2", where: "Đoạn 1" },
  { id: 1, tagged: SECRET + " 2", essential: [], prev: SECRET, nxt: "", where: "Đoạn 2" }];

test("Trên máy never calls the cloud: every tool's calls go to the helper on 127.0.0.1, without a session", async () => {
  const s = setup();
  // text, PDF (the page pipeline), subtitles and the image tool: classify once, then the batches
  for (const [tool, profile] of [["text", undefined], ["file", undefined], ["sub", "file"], ["anh", "photo"]]) {
    s.setTool(tool);
    const eng = await s.adapter.ready();
    assert.equal(eng.kind, "local");
    assert.equal(eng.renew, null);  // no session to renew on the machine
    const cj = cloudJob(eng.client, { jobId: "job-" + tool, renew: eng.renew });
    await cj.prepare(SECRET, { domain: "", profile });
    const out = await cj.translateSegments(SEGS);
    assert.deepEqual(out.map((r) => r.text), ["VI", "VI"]);
  }
  // the live tool: its own client, pointed at the helper by the same adapter
  s.setTool("live");
  const eng = await s.adapter.ready();
  const live = createLiveApi({ jobId: "live-x", setup: () => ({ packs: [], hits: [] }), fetch: s.spy.fetch,
    endpoint: () => eng.endpoint("translate"), session: async () => { throw new Error("no session on the machine"); } });
  await live.translate([{ id: "s1", en: SECRET, prev: "" }]);
  const sent = s.spy.calls.filter((c) => c.body);
  assert.ok(sent.length >= 9);
  for (const c of s.spy.calls) assert.match(c.url, /^http:\/\/127\.0\.0\.1:4783[12]\//, c.url);
  for (const c of sent) {
    assert.equal("session" in c.body, false, c.url);
    assert.equal(c.credentials, "omit");
  }
  assert.equal(s.flow.ensured, 0);  // no browser check either
});

test("Trên máy without a helper: helper_not_found, nothing sent anywhere, looked for again next time", async () => {
  const s = setup({ helper: false });
  await assert.rejects(s.adapter.ready(), (e) => e.code === "helper_not_found");
  assert.ok(s.spy.calls.every((c) => /^http:\/\/127\.0\.0\.1:4783\d\/api\/health$/.test(c.url)));
  assert.equal(s.spy.calls.length, HELPER_PORTS.length);
  await assert.rejects(s.adapter.ready(), (e) => e.code === "helper_not_found");
  assert.equal(s.spy.calls.length, 2 * HELPER_PORTS.length);  // the next try looks again
  assert.equal(s.flow.ensured, 0);
  assert.match(s.log.text(), /ViTranslate · state · helper_not_found/);
});

test("a helper that went away: the call fails as helper_not_found (not a network retry), the link forgets it", async () => {
  const s = setup();
  const eng = await s.adapter.ready();
  assert.equal(s.link.base, "http://127.0.0.1:47832");
  const dead = createAdapter({ cloud: s.cloud, flow: s.flow, prefs: s.prefs, helper: s.link, log: s.log,
    fetch: async (url) => { if (String(url).includes("/api/v1/")) throw new TypeError("Failed to fetch"); return json(200, {}); },
    tool: () => "text" });
  const e2 = await dead.ready();
  const cj = cloudJob(e2.client, { jobId: "j", sleep: async () => {} });
  await assert.rejects(cj.prepare("x", {}), (e) => e.code === "helper_not_found");
  assert.equal(s.link.base, null);
  assert.equal(eng.kind, "local");
});

test("Máy chủ: the browser check, then the cloud client on this origin; nothing goes to 127.0.0.1", async () => {
  const s = setup({ engine: "cloud" });
  const eng = await s.adapter.ready();
  assert.equal(eng.kind, "cloud");
  assert.equal(eng.client, s.cloud);
  assert.equal(s.flow.ensured, 1);
  assert.equal(typeof eng.renew, "function");
  assert.equal(eng.endpoint("translate").url, "/api/v1/translate");
  assert.equal(s.spy.calls.length, 0);
});

test("one log line per API call, with tool, engine, count, latency and code -- never the text", async () => {
  const s = setup();
  s.setTool("sub");
  const eng = await s.adapter.ready();
  const cj = cloudJob(eng.client, { jobId: "j" });
  await cj.prepare(SECRET, { profile: "file" });
  await cj.translateSegments(SEGS);
  const lines = s.log.lines();
  assert.ok(lines.some((l) => /Phụ đề · trên máy · classify · \d+\.\d s · ok$/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /Phụ đề · trên máy · translate · 2 đoạn · \d+\.\d s · ok$/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /ViTranslate · state · found:47832$/.test(l)), lines.join("\n"));
  assert.ok(!/Patient|tumour|breast/.test(s.log.text()));
});

test("the expected speed of one live sentence from the helper's calibration (GPU fast, CPU several seconds)", () => {
  const gpu = { ready: true, recommendation: { device: "gpu" }, calibration: { results: { gpu: { overhead_s: 0.2, word_s: 0.03 } } } };
  assert.equal(sentenceSeconds(gpu).device, "gpu");
  assert.ok(Math.abs(sentenceSeconds(gpu).seconds - 0.65) < 1e-9);
  const cpu = { ready: true, recommendation: { device: "cpu" }, calibration: { results: {} } };
  assert.equal(sentenceSeconds(cpu).device, "cpu");
  assert.ok(sentenceSeconds(cpu).seconds > 5);  // the default CPU rates: about 7 s
  assert.equal(sentenceSeconds(null), null);
  assert.equal(sentenceSeconds({ ready: false }), null);
  assert.equal(speedText(gpu), "Trên máy (GPU): khoảng dưới 1 giây mỗi câu.");
  assert.equal(speedText(cpu), "Trên máy chỉ có CPU: khoảng 7 giây mỗi câu, phụ đề sẽ trễ.");
  assert.equal(speedText(null), "");
});
