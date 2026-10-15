// The Functions' side of the shared translation core (web/engine/core.js):
// - the deploy-time pack bundle as a pack source (file bytes decoded with the core's decodeText), parsed once per
//   isolate into a pack set;
// - classifyDocument: prepareTranslation over the WHOLE document text (what the client's translateFile passes to
//   its injected prepare) -> the classify event with pack versions + the wire setup {packs, hits} + setup_id;
// - setupFor: the translate-side setup rebuilt from that wire setup only (packs in merge order, hits = glossary EN
//   keys in the helper's order) -- the same system prompt as prepareTranslation for the whole document, so every
//   batch of a document gets the helper's prompt;
// - a batch through the real core's translateSegments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleSource, packSetOf, classifyDocument, checkSetup, setupFor, setupIdOf, translate, MAX_HITS,
  SEGMENT_POOL, CALL_INTERVAL_MS } from "../../functions/_lib/engine.js";
import { prepareTranslation, selectPacks, sha256Hex } from "../../web/engine/core.js";
import { TAG_RULES } from "../../web/engine/translate.js";
import { CONCURRENCY } from "../../web/cloud.js";
import { ApiError } from "../../functions/_lib/http.js";
import { syntheticBundle, BUNDLE_TEXTS, MANIFEST, MODEL } from "./helpers.mjs";

const TEXT = "The biopsy showed a tumour.\nThe tumour reached one lymph node.\nBiopsy margins were clear.";
const KID_TEXT = "Core needle biopsy: ductal and lobular areas.\nThe tumour is ductal.\nA lymph node.";
const KIDS = [{ id: "alpha-kid", version: "0.2.0" }, { id: "alpha", version: "1.0.0" }];
const noSleep = async () => {};

async function codeOf(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e && e.stack));
    return e.status + " " + e.code;
  }
}

test("the bundle is a pack source: manifest, files decoded as strict UTF-8 with the BOM kept, null when absent", async () => {
  const src = bundleSource(syntheticBundle());
  assert.deepEqual(await src.manifest(), MANIFEST);
  assert.equal(await src.readText("_style", null, "prompt.md"), BUNDLE_TEXTS["_style/prompt.md"]);
  const csv = await src.readText("alpha", "1.0.0", "glossary.csv");
  assert.equal(csv, BUNDLE_TEXTS["alpha@1.0.0/glossary.csv"]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(await src.readText("alpha", "1.0.0", "tests.jsonl"), null);
  assert.equal(await src.readText("alpha", "9.9.9", "pack.json"), null);
  assert.equal(await src.readText("_shared", null, "owners.csv"), null, "includes are expanded at build time");
  const bad = syntheticBundle();
  bad.files["alpha@1.0.0/prompt.md"] = Buffer.from([0xff, 0xfe, 0x41]).toString("base64");
  await assert.rejects(bundleSource(bad).readText("alpha", "1.0.0", "prompt.md"), (e) => e.name === "PackError");
  for (const wrong of [null, {}, { format: 2, manifest: MANIFEST, files: {} }, { format: 1, files: {} }]) {
    assert.throws(() => bundleSource(wrong), (e) => e instanceof ApiError && e.code === "server_misconfigured");
  }
});

test("the parsed pack set is built once per bundle (per isolate)", async () => {
  const b = syntheticBundle();
  const p1 = packSetOf(b);
  assert.equal(packSetOf(b), p1);
  const set = await p1;
  assert.deepEqual(Object.keys(set.packs).sort(), ["alpha", "alpha-kid"]);
  assert.equal(set.style.id, "_style");
  assert.deepEqual(set.packs.alpha.glossary[0], ["biopsy", "sinh thiết", ""], "BOM dropped by the CSV reader");
  assert.notEqual(packSetOf(syntheticBundle()), p1, "another bundle, another set");
});

test("classifyDocument = prepareTranslation over the whole text: event with versions, wire setup, setup_id", async () => {
  const set = await packSetOf(syntheticBundle());
  const r = await classifyDocument(set, TEXT, []);
  const ref = await prepareTranslation(TEXT, { packs: set });
  assert.deepEqual(r.event, { ...ref.classify, packs: ref.classify.packs.map((p) => ({ ...p, version: "1.0.0" })) });
  assert.deepEqual(r.event, { ...(await selectPacks(TEXT, set.manifest, { packs: set })), packs: r.event.packs });
  assert.deepEqual(r.event.packs.map((p) => [p.id, p.version, p.reason]), [["alpha", "1.0.0", "match"]]);
  assert.deepEqual(r.setup, { packs: [{ id: "alpha", version: "1.0.0" }], hits: ref.hits.map((h) => h[0]) });
  assert.deepEqual(r.setup.hits, ["biopsy", "tumour", "lymph node"], "most frequent first, then longest");
  assert.equal(r.setupId, await setupIdOf(r.setup));
  assert.equal(r.setupId, await sha256Hex(JSON.stringify({ packs: [["alpha", "1.0.0"]], hits: r.setup.hits })));
  const user = await classifyDocument(set, KID_TEXT, ["alpha-kid"]);
  assert.deepEqual(user.event.packs.map((p) => [p.id, p.version, p.reason]), [["alpha-kid", "0.2.0", "user"],
    ["alpha", "1.0.0", "parent"]]);
  assert.deepEqual(user.setup.packs, KIDS);
  const unknown = await classifyDocument(set, TEXT, ["nope"]);
  assert.deepEqual([unknown.event.packs, unknown.event.unavailable, unknown.setup], [[], ["nope"], { packs: [], hits: [] }]);
});

test("photo: a short text the cosine selection gives no pack gets the packs whose detect words or id appear", async () => {
  const set = await packSetOf(syntheticBundle());
  const SHORT = "ANNUAL CONGRESS\nTUMOUR BOARD 2026\nSINGAPORE";
  const file = await classifyDocument(set, SHORT, []);
  assert.deepEqual(file.event.packs, [], "files: thresholds unchanged, no pack for one term");
  const photo = await classifyDocument(set, SHORT, [], { photo: true });
  assert.deepEqual(photo.event.packs.map((p) => [p.id, p.version, p.reason]), [["alpha", "1.0.0", "detect"]]);
  assert.deepEqual(photo.setup, { packs: [{ id: "alpha", version: "1.0.0" }], hits: ["tumour"] });
  assert.equal(photo.setupId, await setupIdOf(photo.setup));
  // the id's words count as a name ("alpha kid" -> alpha-kid and its parent)
  const named = await classifyDocument(set, "WELCOME TO ALPHA KID DAY", [], { photo: true });
  assert.deepEqual(named.event.packs.map((p) => [p.id, p.reason]), [["alpha-kid", "detect"], ["alpha", "parent"]]);
  // nothing of any pack: still none; a pack the cosine selection chose stays as it was
  assert.deepEqual((await classifyDocument(set, "WELCOME TO SINGAPORE", [], { photo: true })).event.packs, []);
  assert.deepEqual(await classifyDocument(set, TEXT, [], { photo: true }), await classifyDocument(set, TEXT, []));
  // the user's choice wins
  const user = await classifyDocument(set, SHORT, ["alpha-kid"], { photo: true });
  assert.deepEqual(user.event.packs.map((p) => p.reason), ["user", "parent"]);
});

// alpha with a house form in its glossary: "lymphô" is no regular syllable, the pack's author chose it
const HOUSE_TEXTS = { ...BUNDLE_TEXTS,
  "alpha@1.0.0/glossary.csv": BUNDLE_TEXTS["alpha@1.0.0/glossary.csv"] + "lymphocyte,lymphô bào,\n" };

test("the translate-side setup equals prepareTranslation's for the whole document (system, hits, fixes, scope, allowed)", async () => {
  for (const bundle of [syntheticBundle(), syntheticBundle(HOUSE_TEXTS)]) {
    const set = await packSetOf(bundle);
    for (const [text, domain] of [[TEXT, []], [KID_TEXT, ["alpha-kid"]], ["Nothing medical here at all.", []],
      [KID_TEXT, ["alpha"]]]) {
      const c = await classifyDocument(set, text, domain);
      const mine = await setupFor(set, await checkSetup(set, c.setup, c.setupId));
      const ref = await prepareTranslation(text, { packs: set, domain: domain.join(",") });
      for (const k of ["system", "hits", "fixes", "scope", "allowed"]) {
        assert.deepEqual(mine[k], ref[k], text.slice(0, 20) + ": " + k);
      }
      assert.ok(mine.system.includes(TAG_RULES));
    }
  }
});

test("the words of the document's packs are no strange words on the server either", async () => {
  const set = await packSetOf(syntheticBundle(HOUSE_TEXTS));
  const c = await classifyDocument(set, TEXT + "\nMany lymphocytes.", []);
  const setup = await checkSetup(set, c.setup);
  assert.deepEqual((await setupFor(set, setup)).allowed, ["lymphô"]);
  const model = async () => "Nhiều lymphô bào và carcinôm trong hạch.";
  const [r] = await translate(set, setup, [{ id: 1, tagged: "Many lymphocytes and a carcinoma in the node.",
    essential: [], prev: "", nxt: "", where: "" }], { model, modelKey: MODEL, sleep: noSleep });
  assert.equal(r.text, "Nhiều lymphô bào và carcinôm trong hạch.");
  assert.deepEqual(r.flags.filter((f) => f.startsWith("suspicious:")), ["suspicious:carcinôm"], "a real strange word stays");
});

test("setups are cached per isolate by setup_id and the pack part by pack keys", async () => {
  const set = await packSetOf(syntheticBundle());
  const c = await classifyDocument(set, KID_TEXT, ["alpha-kid"]);
  const a = await setupFor(set, await checkSetup(set, c.setup));
  assert.equal(await setupFor(set, await checkSetup(set, c.setup)), a);
  const other = await setupFor(set, await checkSetup(set, { packs: c.setup.packs, hits: ["lymph node"] }));
  assert.notEqual(other, a);
  assert.equal(other.system.split("Glossary (English = Vietnamese):")[0], a.system.split("Glossary (English = Vietnamese):")[0]);
  assert.deepEqual(other.hits, [["lymph node", "hạch bạch huyết"]]);
});

test("setup_id is the helper's too: one fixed vector (helper/tests/test_sentence_api.py checks the same value)", async () => {
  const setup = { packs: [{ id: "pathology", version: "0.2.0" }], hits: ["margin", "lymph node", "u\u1ed1ng"] };
  assert.equal(await setupIdOf(setup), "07eb82859996fe827bba19842d289ff6f8294961f0369958a7c8a42086887dfe");
});

test("a wire setup is checked against the bundle: changed packs 409, bad packs / hits / setup_id 400", async () => {
  const set = await packSetOf(syntheticBundle());
  const ok = { packs: KIDS, hits: ["ductal", "lymph node"] };
  assert.deepEqual(await checkSetup(set, ok, await setupIdOf(ok)), ok);
  assert.deepEqual(await checkSetup(set, { packs: [], hits: [] }), { packs: [], hits: [] });
  const check = async (setup, id) => codeOf(async () => await checkSetup(set, setup, id));
  assert.equal(await check({ packs: [{ id: "alpha", version: "0.9.0" }], hits: [] }), "409 packs_changed");
  assert.equal(await check({ packs: [{ id: "gone", version: "1.0.0" }], hits: [] }), "409 packs_changed");
  assert.equal(await check(ok, "0".repeat(64)), "400 bad_request", "setup_id of another setup");
  assert.equal(await check(ok, 42), "400 bad_request");
  const many = Array.from({ length: MAX_HITS + 1 }, (_, i) => "term" + i);
  assert.equal(MAX_HITS, 80, "the helper's glossary_hits limit");
  for (const bad of [null, [], { packs: KIDS }, { hits: [] }, { packs: KIDS, hits: [], extra: 1 },
    { packs: [{ id: "alpha" }], hits: [] }, { packs: [{ id: "Alpha!", version: "1.0.0" }], hits: [] },
    { packs: [KIDS[1], KIDS[1]], hits: [] }, { packs: [{ id: "alpha", version: "1.0.0", x: 1 }], hits: [] },
    { packs: Array.from({ length: 7 }, (_, i) => ({ id: "p" + i, version: "1.0.0" })), hits: [] },
    { packs: KIDS, hits: ["not a glossary term"] }, { packs: KIDS, hits: ["ductal", "Ductal"] },
    { packs: KIDS, hits: [42] }, { packs: [], hits: ["biopsy"] }, { packs: KIDS, hits: many },
    { packs: [KIDS[1]], hits: ["ductal"] }]) {
    assert.equal(await check(bad), "400 bad_request", JSON.stringify(bad).slice(0, 120));
  }
});

test("a batch goes through the real core with the document's setup: results {id, text, level, flags, fixes, cached, reduced, spans}", async () => {
  const set = await packSetOf(syntheticBundle());
  const c = await classifyDocument(set, TEXT, []);
  const seen = [];
  const answers = { "Biopsy of the <g1>tumour</g1>.": "Sinh thiết <g1>u</g1>.",
    "The tumour was reviewed by Jane Doe, MD, PhD.": "Khối bướu được BS. TS. Jane Doe xem lại." };
  const model = async (messages, opts) => {
    seen.push({ messages, opts });
    return { text: answers[messages[1].content.split("Translate:\n").pop()], truncated: false };
  };
  const results = await translate(set, await checkSetup(set, c.setup), [{ id: 7, tagged: "Biopsy of the <g1>tumour</g1>.",
    essential: [1], prev: "The biopsy showed a tumour.", nxt: "", where: "Slide 1" }, { id: "k2", tagged: "HER2 3+",
    essential: [], prev: "", nxt: "", where: "Slide 1" }, { id: "f3", tagged: "The tumour was reviewed by Jane Doe, MD, PhD.",
    essential: [], prev: "", nxt: "", where: "Slide 2" }], { model, modelKey: MODEL, sleep: noSleep });
  const keys = ["cached", "fixes", "flags", "id", "level", "reduced", "spans", "text"];
  assert.deepEqual(results.map((r) => Object.keys(r).sort()), [keys, keys, keys]);
  assert.deepEqual([results[0].id, results[0].text, results[0].level, results[0].reduced, results[0].spans,
    results[0].fixes], [7, "Sinh thiết <g1>u</g1>.", 0, false, [1], []]);
  assert.deepEqual([results[1].id, results[1].text, results[1].flags, results[1].fixes],
    ["k2", "HER2 3+", ["kept_code"], []]);
  // the pack's term fix (tumour: "khối bướu" -> "u") and the title order, each as {en, from, to}
  assert.equal(results[2].text, "U được TS. BS. Jane Doe xem lại.");
  assert.deepEqual(results[2].fixes, [{ en: "tumour", from: "Khối bướu", to: "U" },
    { en: "title-order", from: "BS. TS.", to: "TS. BS." }]);
  assert.deepEqual(results[2].flags.filter((f) => f.startsWith("term_fix:")), ["term_fix:tumour", "term_fix:title-order"]);
  assert.equal(seen.length, 2, "code-only text needs no model call");
  // the segments of a batch go at once: the calls of different segments come in any order
  const first = seen.find((c) => c.messages[1].content.endsWith("Translate:\nBiopsy of the <g1>tumour</g1>."));
  assert.ok(first, "the first segment's call");
  assert.equal(first.opts.think, false);
  const ref = await prepareTranslation(TEXT, { packs: set });
  for (const c of seen) assert.equal(c.messages[0].content, ref.system, "the document's system prompt, not the batch's");
});

// ---------------------------------------------------------------- a batch's segments at once (speed, spec H)

// Ten segments with scripted answers per source: plain answers, a broken tag answer (tag retry), English left (gate
// retry), a model error once (the core's segment retry), code only (no call). Every source is distinct.
const POOL_SEGS = [
  ["Biopsy of the <g1>tumour</g1>.", ["Sinh thiết <g1>u</g1>."]],
  ["The <g1>margin</g1> was <g2>clear</g2> in all the sections we examined today.",
    ["Diện cắt <g1>sạch</g1> ở mọi lát cắt.", "<g1>Diện cắt</g1> <g2>sạch</g2> ở mọi lát cắt mà chúng tôi khảo sát."]],
  ["HER2 3+", []],
  ["The lymph node was enlarged and firm on palpation at the time of surgery.",
    ["The lymph node was enlarged and firm on palpation at the time of surgery.",
      "Hạch bạch huyết to và chắc khi sờ lúc phẫu thuật."]],
  ["A second biopsy confirmed the diagnosis of the first one.", [new Error("3040: Capacity temporarily exceeded"),
    "Sinh thiết thứ hai xác nhận chẩn đoán của lần đầu."]],
  ["No <g1>necrosis</g1> was seen.", ["Không thấy <g1>hoại tử</g1>."]],
  ["The tumour cells were small.", ["Các tế bào u nhỏ."]],
  ["Mitoses were rare.", ["Nhân chia hiếm gặp."]],
  ["The <g1>stroma</g1> was loose.", ["<g1>Mô đệm</g1> lỏng lẻo."]],
  ["Follow-up showed no new lesion.", ["Theo dõi không thấy tổn thương mới."]],
];
const poolSegments = () => POOL_SEGS.map(([tagged], i) => ({ id: "p" + i, tagged, essential: [],
  prev: i > 0 ? POOL_SEGS[i - 1][0].replace(/<[^>]+>/g, "") : "", nxt: "", where: "Slide " + (i + 1) }));

/** A core model answering POOL_SEGS by source, in call order per source (an Error is thrown); records every call. */
function poolModel(onCall = null) {
  const n = new Map();
  const calls = [];
  const model = async (messages) => {
    const src = messages[1].content.split("Translate:\n").pop();
    const k = n.get(src) || 0;
    n.set(src, k + 1);
    calls.push({ src, user: messages[1].content });
    if (onCall) await onCall(src);
    const row = POOL_SEGS.find(([t]) => t === src);
    const replies = row ? row[1] : [];
    const reply = k < replies.length ? replies[k] : (replies.length ? replies[replies.length - 1] : "Văn bản khác.");
    if (reply instanceof Error) throw reply;
    return { text: reply, truncated: false };
  };
  return { model, calls };
}

const bySource = (calls) => {
  const m = new Map();
  for (const c of calls) m.set(c.src, [...(m.get(c.src) || []), c.user]);
  return m;
};

async function poolSetup() {
  const set = await packSetOf(syntheticBundle());
  const c = await classifyDocument(set, POOL_SEGS.map(([t]) => t.replace(/<[^>]+>/g, "")).join("\n"), []);
  return [set, await checkSetup(set, c.setup)];
}

test("a batch's segments are translated SEGMENT_POOL at a time: same results and per-segment calls as one after another", async () => {
  const [set, setup] = await poolSetup();
  const seq = poolModel();
  const one = await translate(set, setup, poolSegments(), { model: seq.model, modelKey: MODEL, sleep: noSleep,
    wait: noSleep, pool: 1 });
  // the pooled run holds the first calls until SEGMENT_POOL of them are in flight together (an event, not a time;
  // a run that sends one segment after another never gets there and fails at the guard)
  const waiting = [];
  let released = false;
  let expired = false;
  const guard = setTimeout(() => {
    expired = true;
    waiting.forEach((w) => w.reject(new Error("never in flight together")));
  }, 10000);
  const gate = (src) => (released ? null : expired ? Promise.reject(new Error("never in flight together"))
    : new Promise((resolve, reject) => {
    waiting.push({ resolve, reject, src });
    if (waiting.length === SEGMENT_POOL) {
      released = true;
      clearTimeout(guard);
      for (const w of waiting.reverse()) w.resolve(); // the later segments answer first
    }
  }));
  const pooled = poolModel(gate);
  const many = await translate(set, setup, poolSegments(), { model: pooled.model, modelKey: MODEL, sleep: noSleep,
    wait: noSleep });
  clearTimeout(guard);
  assert.ok(released, "SEGMENT_POOL model calls were in flight together");
  assert.ok(SEGMENT_POOL >= 2 && SEGMENT_POOL <= 5, "a small pool, under the 6 open connections of a Worker");
  assert.deepEqual(many.map((r) => r.id), poolSegments().map((s) => s.id), "results in segment order");
  assert.deepEqual(many, one, "every result exactly as one after another");
  assert.deepEqual(bySource(pooled.calls), bySource(seq.calls), "each segment's own calls, prompts and order unchanged");
  assert.equal(pooled.calls.length, seq.calls.length);
  assert.ok(seq.calls.length > POOL_SEGS.length, "the script has retries");
  assert.deepEqual(one.map((r) => r.level), [0, 2, 0, 2, 0, 0, 0, 0, 0, 0]);
  assert.ok(one[3].flags.includes("retried:english"));
});

test("pacing: the model calls of one request start CALL_INTERVAL_MS apart; a job stays under 300 requests a minute", async () => {
  const [set, setup] = await poolSetup();
  const waits = [];
  const { model, calls } = poolModel();
  // a frozen clock: each call's start is the pacer's wait from 0
  const out = await translate(set, setup, poolSegments(), { model, modelKey: MODEL, sleep: noSleep, now: () => 0,
    wait: async (ms) => { waits.push(ms); } });
  assert.equal(out.length, POOL_SEGS.length);
  assert.deepEqual(waits, Array.from({ length: calls.length - 1 }, (_, i) => (i + 1) * CALL_INTERVAL_MS),
    "the first call at once, then one start per interval");
  // a clock past the next slot: no wait at all
  const later = [];
  let t = 0;
  await translate(set, setup, poolSegments().slice(5), { model: poolModel().model, modelKey: MODEL, sleep: noSleep,
    now: () => (t += 10 * CALL_INTERVAL_MS), wait: async (ms) => { later.push(ms); } });
  assert.deepEqual(later, []);
  // Workers AI text generation: 300 requests a minute per account; the page keeps CONCURRENCY batches in flight
  assert.ok(CONCURRENCY * 60000 / CALL_INTERVAL_MS <= 250, "a job's calls stay well under 300 a minute");
});

test("a failed segment fails the batch with the first failing segment's error; the others stop; abort is AbortError", async () => {
  const [set, setup] = await poolSetup();
  // segments 6 and 8 always fail, 8 at once and 6 only after some turns of the event loop: whatever the timing,
  // the error is segment 6's, as one after another would give (a failure stops only the segments after it)
  const turns = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  const fatal = async (src) => {
    if (src.startsWith("Mitoses")) throw new Error("5035: model refused (8)");
    if (src.startsWith("No <g1>necrosis")) {
      await turns(20);
      throw new Error("5035: model refused (6)");
    }
  };
  const { model, calls } = poolModel(fatal);
  await assert.rejects(translate(set, setup, poolSegments(), { model, modelKey: MODEL, sleep: noSleep, wait: noSleep }),
    (e) => e.name === "ModelError" && e.message.includes("Slide 6") && e.message.includes("(6)"),
    "segment 6 comes before segment 8 in the document: its error");
  assert.equal(calls.filter((c) => c.src.startsWith("No <g1>necrosis")).length, 2, "segment 6 had its retry");
  const ctrl = new AbortController();
  const stopper = poolModel(() => { ctrl.abort(); return null; });
  await assert.rejects(translate(set, setup, poolSegments(), { model: stopper.model, modelKey: MODEL, sleep: noSleep,
    wait: noSleep, signal: ctrl.signal }), (e) => e.name === "AbortError");
  assert.ok(stopper.calls.length <= SEGMENT_POOL, "no call after the abort");
  const done = new AbortController();
  done.abort();
  const none = poolModel();
  await assert.rejects(translate(set, setup, poolSegments(), { model: none.model, modelKey: MODEL, sleep: noSleep,
    wait: noSleep, signal: done.signal }), (e) => e.name === "AbortError");
  assert.equal(none.calls.length, 0);
});
