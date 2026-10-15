// Term repair of the live profile (functions/_lib/repair.js): the user-message block that offers the numbered
// candidates of the core's finder, the USE / VI answer parser and the repaired English built from the corrections
// used (offered replacements only, in the source's own text). Synthetic text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPAIR_MARK, buildRepairBlock, parseRepairAnswer, applyRepairs } from "../../functions/_lib/repair.js";
import { termIndex, findCandidates } from "../../web/engine/core.js";

const KEYS = ["lymph node", "papillary thyroid carcinoma", "parathyroid carcinoma", "ductal", "biopsy"];
const ROWS = new Map([["lymph node", "hạch bạch huyết"], ["papillary thyroid carcinoma", "carcinom tuyến giáp dạng nhú"],
  ["parathyroid carcinoma", "carcinom tuyến cận giáp"], ["ductal", "ống tuyến"], ["biopsy", "sinh thiết"]]);
const index = termIndex(KEYS);
const cands = (text) => findCandidates(text, index);
const SRC = "The puppy thyroid carcinoma was in the lymph mode.";

test("the block numbers each heard span, its term and the term's Vietnamese, the rule and the two-line answer", () => {
  const c = cands(SRC);
  assert.deepEqual(c.map((x) => [x.from, x.to]), [["puppy thyroid carcinoma", "parathyroid carcinoma"],
    ["lymph mode", "lymph node"], ["puppy thyroid carcinoma", "papillary thyroid carcinoma"]]);
  const block = buildRepairBlock(c, ROWS);
  assert.ok(block.includes(REPAIR_MARK), block);
  assert.ok(block.includes("\n2. \"lymph mode\" -> lymph node = hạch bạch huyết\n"), block);
  assert.ok(block.includes("\n3. \"puppy thyroid carcinoma\" -> papillary thyroid carcinoma = carcinom tuyến giáp dạng nhú"));
  assert.match(block, /only when/i);
  assert.match(block, /\nUSE: .*\nVI: /);
  assert.equal(buildRepairBlock([], ROWS), "");
});

test("the answer parser: USE / VI lines, markdown marks, none, VI only, plain text", () => {
  assert.deepEqual(parseRepairAnswer("USE: 2\nVI: Hạch sạch."), { use: [2], vi: "Hạch sạch." });
  assert.deepEqual(parseRepairAnswer("**USE:** 1, 3\n\n**VI:** Hạch.\nDòng hai."), { use: [1, 3], vi: "Hạch.\nDòng hai." });
  assert.deepEqual(parseRepairAnswer("use : none\nvi: y"), { use: [], vi: "y" });
  assert.deepEqual(parseRepairAnswer("USE: 2 and 1\nVI: y"), { use: [2, 1], vi: "y" });
  assert.deepEqual(parseRepairAnswer("VI: Chỉ tiếng Việt."), { use: [], vi: "Chỉ tiếng Việt." });
  assert.deepEqual(parseRepairAnswer("USE: 1\nHạch."), { use: [1], vi: "Hạch." });
  assert.deepEqual(parseRepairAnswer("USE: 1"), { use: [1], vi: "" });
  assert.deepEqual(parseRepairAnswer("Hạch không có gì."), { use: [], vi: "Hạch không có gì." });
  assert.deepEqual(parseRepairAnswer(""), { use: [], vi: "" });
});

test("applyRepairs writes the corrections used into the source (best first, never overlapping, known numbers only)", () => {
  const c = cands(SRC);
  assert.deepEqual(applyRepairs(SRC, [3, 2], c), { text: "The papillary thyroid carcinoma was in the lymph node.",
    repairs: [{ from: "puppy thyroid carcinoma", to: "papillary thyroid carcinoma" }, { from: "lymph mode",
      to: "lymph node" }] });
  assert.deepEqual(applyRepairs(SRC, [2], c), { text: "The puppy thyroid carcinoma was in the lymph node.",
    repairs: [{ from: "lymph mode", to: "lymph node" }] });
  // two corrections of one span: the first number given wins
  assert.deepEqual(applyRepairs(SRC, [1, 3], c).repairs, [{ from: "puppy thyroid carcinoma", to: "parathyroid carcinoma" }]);
  for (const use of [[], [0], [4], [9, 0]]) assert.deepEqual(applyRepairs(SRC, use, c), { text: SRC, repairs: [] });
  assert.deepEqual(applyRepairs(SRC, [1], []), { text: SRC, repairs: [] });
});

test("a repaired span at the start of the sentence takes the source's capital", () => {
  const src = "Lymph mode biopsy was clear.";
  assert.deepEqual(applyRepairs(src, [1], cands(src)), { text: "Lymph node biopsy was clear.",
    repairs: [{ from: "Lymph mode", to: "Lymph node" }] });
});

test("the live index carries the medical lexicon of the gate (web/engine/medical_words.json)", async () => {
  const { repairIndex } = await import("../../functions/_lib/live.js");
  const idx = repairIndex({ rows: ROWS });
  assert.ok(idx.lexicon.size > 1000 && idx.lexicon.has("carcinoma"), String(idx.lexicon.size));
  assert.equal(repairIndex({ rows: ROWS }) === idx, false, "one index per base object");
});
