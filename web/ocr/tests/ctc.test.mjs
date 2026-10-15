// CTC greedy decoding of the recognition model's output (web/ocr/ctc.js): PaddleOCR's CTCLabelDecode -- argmax per
// time step, repeats collapsed, the blank (index 0) dropped, the score = the mean of the kept steps' probabilities.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ctcDecode, charList } from "../ctc.js";

// one-hot-ish rows: [class index, probability] per time step, the rest of the row shares what is left
function logits(steps, classes) {
  const out = new Float32Array(steps.length * classes);
  steps.forEach(([k, p], t) => {
    for (let c = 0; c < classes; c++) out[t * classes + c] = (1 - p) / (classes - 1);
    out[t * classes + k] = p;
  });
  return out;
}

test("the character list is blank + the dictionary + a space (use_space_char)", () => {
  const chars = charList("a\nb\nc\n");
  assert.deepEqual(chars, ["blank", "a", "b", "c", " "]);
  assert.deepEqual(charList("a\r\nb\r\n"), ["blank", "a", "b", " "]);
  assert.deepEqual(charList("\\\n.\n"), ["blank", "\\", ".", " "]);  // the backslash entry is a character
});

test("repeats collapse, blanks separate and drop, the score is the mean of the kept steps", () => {
  const chars = charList("a\nb\nc\n");
  // a a _ a b b _ _ c (space at the end)
  const steps = [[1, 0.9], [1, 0.8], [0, 0.99], [1, 0.7], [2, 0.6], [2, 0.9], [0, 0.95], [0, 0.95], [3, 0.5], [4, 0.8]];
  const r = ctcDecode(logits(steps, chars.length), steps.length, chars.length, chars);
  assert.equal(r.text, "aabc ");
  // kept: the first step of each run (PaddleOCR keeps the probability of every selected position: first of a run)
  assert.ok(Math.abs(r.score - (0.9 + 0.7 + 0.6 + 0.5 + 0.8) / 5) < 1e-6, String(r.score));
  assert.deepEqual(r.steps, [0, 3, 4, 8, 9]);
});

test("nothing but blanks is an empty line with score 0", () => {
  const chars = charList("a\n");
  const r = ctcDecode(logits([[0, 0.9], [0, 0.8]], chars.length), 2, chars.length, chars);
  assert.deepEqual(r, { text: "", score: 0, steps: [] });
});

test("a batch is decoded row by row at an offset", () => {
  const chars = charList("x\ny\n");
  const a = logits([[1, 0.9], [0, 0.9]], chars.length);
  const b = logits([[2, 0.8], [2, 0.8]], chars.length);
  const both = new Float32Array(a.length + b.length);
  both.set(a, 0);
  both.set(b, a.length);
  assert.equal(ctcDecode(both, 2, chars.length, chars, 0).text, "x");
  assert.equal(ctcDecode(both, 2, chars.length, chars, 1).text, "y");
});
