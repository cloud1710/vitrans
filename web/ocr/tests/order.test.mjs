// Reading order of the detected lines (web/ocr/order.js): top to bottom, and left to right within a row (boxes whose
// vertical spans overlap by at least half the smaller height), like PaddleOCR's sorted_boxes but with a tolerance
// that follows the text size instead of a fixed 10 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readingOrder, quadBounds } from "../order.js";

const quad = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

test("quadBounds: the axis-aligned box of a quad", () => {
  assert.deepEqual(quadBounds([[10, 12], [50, 8], [52, 30], [12, 34]]), [10, 8, 52, 34]);
});

test("two rows of two boxes, given shuffled, come back row by row, left to right", () => {
  const boxes = [[60, 48, 100, 68], [10, 10, 50, 30], [10, 50, 50, 70], [60, 12, 100, 32]].map(quad);
  assert.deepEqual(readingOrder(boxes), [1, 3, 2, 0]);
});

test("a box a little lower on the same row stays in the row; small text under a big title is a new row", () => {
  const boxes = [[200, 18, 300, 38], [10, 10, 100, 30], [10, 34, 100, 44]].map(quad);
  assert.deepEqual(readingOrder(boxes), [1, 0, 2]);
});

test("a paragraph turned by 5 degrees keeps its lines in order (rows are found in the text's own direction)", () => {
  const a = (5 * Math.PI) / 180;
  const rot = ([x, y]) => [Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a))];
  // five 800 x 40 lines, 46 apart, then turned: their upright boxes overlap a lot
  const quads = [0, 1, 2, 3, 4].map((k) => quad([200, 100 + 46 * k, 1000, 140 + 46 * k]).map(rot));
  const shuffled = [3, 0, 4, 1, 2];
  assert.deepEqual(readingOrder(shuffled.map((k) => quads[k])).map((i) => shuffled[i]), [0, 1, 2, 3, 4]);
});

test("an empty list is fine", () => {
  assert.deepEqual(readingOrder([]), []);
});
