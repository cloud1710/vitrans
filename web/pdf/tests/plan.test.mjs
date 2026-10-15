// The plan between reading and writing (web/pdf/plan.js): styles of the text items from the content analysis,
// which strings of the content streams are taken out (only where every use of a string lies in a translated
// block), which blocks are covered instead (the English cannot be taken out: invisible OCR text over an image, a
// string shared with text that stays, nothing found in the streams, a scanned page), and the viewport geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toViewport, invert, attachStyles, planRemoval } from "../plan.js";

const V = [1, 0, 0, -1, 0, 842];  // a portrait A4 page, no rotation: user (x, y) -> viewport (x, 842 - y)
const style = (o = {}) => ({ bold: false, italic: false, serif: false, color: [0, 0, 0], invisible: false, ...o });
// a show with one string element per box (user space [x0, y0, x1, y1])
const show = (stream, index, boxes, o = {}) => ({ stream, index, op: "TJ", tr: o.tr || 0, style: style(o.style),
  matrix: o.matrix || [10, 0, 0, 10, boxes[0][0], boxes[0][1] + 2.5], widthsKnown: true,
  elements: boxes.map((b) => ({ kind: "str", box: b })) });
const block = (id, page, box, o = {}) => ({ id, page, box, size: 10, skip: o.skip || "", lines: [{}], kind: "para" });

test("viewport transforms map boxes both ways", () => {
  assert.deepEqual(toViewport(V, [100, 700, 150, 710]), [100, 132, 150, 142]);
  const inv = invert(V);
  assert.deepEqual(toViewport(inv, [100, 132, 150, 142]), [100, 700, 150, 710]);
  // a page rotated 90 degrees (pdf.js viewport of a 595 x 842 page with /Rotate 90)
  const R = [0, 1, 1, 0, 0, 0];
  assert.deepEqual(toViewport(R, [100, 700, 150, 710]), [700, 100, 710, 150]);
});

test("items take the style of the string drawn under them", () => {
  const items = [{ str: "Bold heading", x0: 50, x1: 110, top: 92.5, bottom: 102.5, base: 100, size: 10 },
    { str: "plain", x0: 50, x1: 75, top: 112.5, bottom: 122.5, base: 120, size: 10 },
    { str: "nothing under", x0: 300, x1: 360, top: 400, bottom: 410, base: 407.5, size: 10 }];
  const shows = [show("page", 3, [[50, 739.5, 110, 749.5]], { style: { bold: true } }),
    show("page", 5, [[50, 719.5, 75, 729.5]], { style: { color: [1, 0, 0] } })];
  attachStyles(items, shows, V);
  assert.equal(items[0].style.bold, true);
  assert.deepEqual(items[1].style.color, [1, 0, 0]);
  assert.equal(items[2].style, null);
});

test("strings inside translated blocks are removed; a string also used outside them is not", () => {
  const page = { index: 0, transform: V };
  const blocks = [block(0, 0, { x0: 50, x1: 300, top: 92, bottom: 125 }),
    block(1, 0, { x0: 50, x1: 300, top: 400, bottom: 412 }, { skip: "header_footer" }),
    block(2, 0, { x0: 320, x1: 500, top: 92, bottom: 104 })];
  // page stream: op 3 holds two strings, the second outside every block; a form drawn twice: once inside block 2,
  // once in the skipped block 1 (the same string)
  const shows = [show("page", 3, [[50, 739.5, 110, 749.5], [400, 300, 420, 310]]),
    show("page", 7, [[50, 719.5, 75, 729.5]]),
    show("form:9", 0, [[330, 739.5, 360, 749.5]]), show("form:9", 0, [[60, 432, 90, 442]])];
  const plan = planRemoval([page], [{ shows, images: [] }], blocks, new Set([0, 2]));
  assert.deepEqual([...plan.edits.keys()].sort(), ["page"]);
  assert.deepEqual([...plan.edits.get("page").entries()].map(([k, v]) => [k, [...v.remove]]), [[3, [0]], [7, [0]]]);
  assert.deepEqual([...plan.cover].sort(), [2]);
  assert.equal(plan.removed, 2);
});

test("invisible text, clipping text and blocks with nothing found are covered; scanned pages cover everything", () => {
  const page = { index: 0, transform: V };
  const blocks = [block(0, 0, { x0: 50, x1: 300, top: 92, bottom: 104 }), block(1, 0, { x0: 50, x1: 300, top: 192, bottom: 204 }),
    block(2, 0, { x0: 50, x1: 300, top: 292, bottom: 304 }), block(3, 1, { x0: 50, x1: 300, top: 92, bottom: 104 })];
  const shows = [show("page", 1, [[50, 739.5, 110, 749.5]], { tr: 3, style: { invisible: true } }),
    show("page", 2, [[50, 639.5, 110, 649.5]], { tr: 7 })];
  const plan = planRemoval([page, { index: 1, transform: V, ocr: true }], [{ shows, images: [] }, { shows: [], images: [] }],
    blocks, new Set([0, 1, 2, 3]));
  // the invisible OCR string goes (the image under it keeps the English: cover); a clipping string stays (cover)
  assert.deepEqual([...plan.edits.get("page").keys()], [1]);
  assert.deepEqual([...plan.cover].sort(), [0, 1, 2, 3]);
});

test("a small picture lying on a block (a text shadow drawn as an image) makes the block covered", () => {
  const page = { index: 0, transform: V };
  const blocks = [block(0, 0, { x0: 50, x1: 300, top: 92, bottom: 104 }), block(1, 0, { x0: 50, x1: 300, top: 192, bottom: 204 })];
  const shows = [show("page", 1, [[50, 739.5, 110, 749.5]]), show("page", 2, [[50, 639.5, 110, 649.5]])];
  // a 260 x 16 picture over block 0; a full-page background picture under both
  const images = [[45, 736, 305, 752], [0, 0, 595, 842]];
  const plan = planRemoval([page], [{ shows, images }], blocks, new Set([0, 1]));
  assert.deepEqual([...plan.cover], [0]);
  assert.deepEqual([...plan.edits.get("page").keys()].sort(), [1, 2]);
});

test("rotated strings are never taken out of a horizontal block", () => {
  const page = { index: 0, transform: V };
  const blocks = [block(0, 0, { x0: 50, x1: 300, top: 92, bottom: 125 })];
  const shows = [show("page", 1, [[60, 720, 70, 745]], { matrix: [0, 10, -10, 0, 70, 720] }),
    show("page", 2, [[50, 739.5, 110, 749.5]])];
  const plan = planRemoval([page], [{ shows, images: [] }], blocks, new Set([0]));
  assert.deepEqual([...plan.edits.get("page").keys()], [2]);
});
