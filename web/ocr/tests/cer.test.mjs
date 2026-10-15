// Character error rate of the accuracy runner (tests/cer.js): edit distance between the reference lines and the
// OCR lines, each side joined by single spaces (whitespace collapsed), divided by the reference length; a bullet
// glyph at the start of an OCR line is not counted (the synthetic references have none: the bullets are drawn).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cer, levenshtein, joinLines } from "./cer.js";

test("levenshtein distance", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", "abc"), 0);
});

test("lines are joined with single spaces, bullets at line starts dropped from the OCR side only", () => {
  assert.equal(joinLines([" Two  words ", "next"], false), "Two words next");
  assert.equal(joinLines(["• Item one", "● Item two", "- dash kept"], true), "Item one Item two - dash kept");
});

test("cer: errors / reference characters", () => {
  assert.equal(cer(["abcd", "efgh"], ["abcd", "efgh"]), 0);
  assert.equal(cer(["abcd"], ["abed"]), 0.25);
  assert.equal(cer(["abcd"], []), 1);
});
