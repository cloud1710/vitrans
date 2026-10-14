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
import { bundleSource, packSetOf, classifyDocument, checkSetup, setupFor, setupIdOf, translate, MAX_HITS }
  from "../../functions/_lib/engine.js";
import { prepareTranslation, selectPacks, sha256Hex } from "../../web/engine/core.js";
import { TAG_RULES } from "../../web/engine/translate.js";
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

test("the translate-side setup equals prepareTranslation's for the whole document (system, hits, fixes, scope)", async () => {
  const set = await packSetOf(syntheticBundle());
  for (const [text, domain] of [[TEXT, []], [KID_TEXT, ["alpha-kid"]], ["Nothing medical here at all.", []],
    [KID_TEXT, ["alpha"]]]) {
    const c = await classifyDocument(set, text, domain);
    const mine = await setupFor(set, await checkSetup(set, c.setup, c.setupId));
    const ref = await prepareTranslation(text, { packs: set, domain: domain.join(",") });
    for (const k of ["system", "hits", "fixes", "scope"]) assert.deepEqual(mine[k], ref[k], text.slice(0, 20) + ": " + k);
    assert.ok(mine.system.includes(TAG_RULES));
  }
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

test("a batch goes through the real core with the document's setup: results {id, text, level, flags, cached, reduced, spans}", async () => {
  const set = await packSetOf(syntheticBundle());
  const c = await classifyDocument(set, TEXT, []);
  const seen = [];
  const model = async (messages, opts) => {
    seen.push({ messages, opts });
    return { text: "Sinh thiết <g1>u</g1>.", truncated: false };
  };
  const results = await translate(set, await checkSetup(set, c.setup), [{ id: 7, tagged: "Biopsy of the <g1>tumour</g1>.",
    essential: [1], prev: "The biopsy showed a tumour.", nxt: "", where: "Slide 1" }, { id: "k2", tagged: "HER2 3+",
    essential: [], prev: "", nxt: "", where: "Slide 1" }], { model, modelKey: MODEL, sleep: noSleep });
  const keys = ["cached", "flags", "id", "level", "reduced", "spans", "text"];
  assert.deepEqual(results.map((r) => Object.keys(r).sort()), [keys, keys]);
  assert.deepEqual([results[0].id, results[0].text, results[0].level, results[0].reduced, results[0].spans],
    [7, "Sinh thiết <g1>u</g1>.", 0, false, [1]]);
  assert.deepEqual([results[1].id, results[1].text, results[1].flags], ["k2", "HER2 3+", ["kept_code"]]);
  assert.equal(seen.length, 1, "code-only text needs no model call");
  assert.equal(seen[0].opts.think, false);
  const ref = await prepareTranslation(TEXT, { packs: set });
  assert.equal(seen[0].messages[0].content, ref.system, "the document's system prompt, not the batch's");
  assert.ok(seen[0].messages[1].content.endsWith("Translate:\nBiopsy of the <g1>tumour</g1>."));
});
