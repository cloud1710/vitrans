// Text mode of the page (web/text.js): pasted English is split into paragraphs (one per non-empty line), each one a
// segment of the core's shape, and the Vietnamese comes back with the same line layout. Pure functions only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { textSegments, textOutput, charCount, TEXT_LIMIT, countText } from "../text.js";

test("each non-empty line is one paragraph segment with its neighbours as context", () => {
  const t = textSegments("The tumour is composed of spindle cells.\n\n  Mitoses are rare.  \r\nNo necrosis.\n");
  assert.deepEqual(t.segments, [
    { id: 0, tagged: "The tumour is composed of spindle cells.", essential: [], prev: "", nxt: "Mitoses are rare.",
      where: "Đoạn 1" },
    { id: 1, tagged: "Mitoses are rare.", essential: [], prev: "The tumour is composed of spindle cells.",
      nxt: "No necrosis.", where: "Đoạn 2" },
    { id: 2, tagged: "No necrosis.", essential: [], prev: "Mitoses are rare.", nxt: "", where: "Đoạn 3" },
  ]);
  // what translateFile hands to prepare: the paragraphs' text joined by newlines
  assert.equal(t.fullText, "The tumour is composed of spindle cells.\nMitoses are rare.\nNo necrosis.");
  assert.deepEqual(t.lines, ["The tumour is composed of spindle cells.", "", "Mitoses are rare.", "No necrosis.", ""]);
  assert.deepEqual(textSegments(" \n\t\n").segments, []);
});

test("the Vietnamese keeps the line layout; a paragraph not translated yet stays empty", () => {
  const t = textSegments("A.\n\nB.\nC.");
  const out = textOutput(t, [{ id: 0, text: "Một." }, { id: 2, text: "Ba." }]);
  assert.equal(out, "Một.\n\n\nBa.");
  assert.equal(textOutput(t, []), "\n\n\n");
});

test("characters are counted as code points against the 20,000 limit", () => {
  assert.equal(TEXT_LIMIT, 20000);
  assert.equal(charCount("abc"), 3);
  assert.equal(charCount("tế bào 🔬"), 8);  // the microscope emoji is one character (two UTF-16 units)
  assert.deepEqual(countText("x".repeat(19999)), { count: 19999, over: false, text: "19.999 / 20.000 ký tự" });
  assert.deepEqual(countText("x".repeat(20001)), { count: 20001, over: true, text: "20.001 / 20.000 ký tự (quá giới hạn)" });
  assert.deepEqual(countText(""), { count: 0, over: false, text: "0 / 20.000 ký tự" });
});
