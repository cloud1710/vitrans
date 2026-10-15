// DB post-processing of the detection model's probability map (web/ocr/db.js), as PaddleOCR's DBPostProcess and the
// OCR pipeline's box filter do it: threshold -> connected regions -> minimum-area rectangle -> box score (mean
// probability inside the box) -> unclip (the rectangle grown by area * ratio / perimeter) -> scaled to the image ->
// clockwise order, clipped, boxes of <= 3 px dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { convexHull, minAreaRect, miniBox, unclip, dbBoxes, orderClockwise, regions } from "../db.js";

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const near = (pts, want, eps = 1e-6) => pts.length === want.length && pts.every((p, i) => close(p[0], want[i][0], eps)
  && close(p[1], want[i][1], eps));

// a probability map w x h with rectangles [x0, y0, x1, y1 (inclusive), p] and an optional rotation of each pixel set
function probMap(w, h, rects) {
  const m = new Float32Array(w * h);
  for (const [x0, y0, x1, y1, p] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = p;
  }
  return m;
}

test("convex hull of points (collinear points dropped)", () => {
  const hull = convexHull([[0, 0], [2, 0], [1, 0], [2, 2], [0, 2], [1, 1]]);
  assert.equal(hull.length, 4);
  for (const p of [[0, 0], [2, 0], [2, 2], [0, 2]]) assert.ok(hull.some((q) => q[0] === p[0] && q[1] === p[1]));
});

test("minimum-area rectangle: axis-aligned and rotated point sets", () => {
  const r = minAreaRect([[10, 20], [49, 20], [49, 29], [10, 29], [30, 25]]);
  assert.ok(close(r.w * r.h, 39 * 9, 1e-6));
  assert.ok(close(Math.min(r.w, r.h), 9) && close(Math.max(r.w, r.h), 39));
  // a 40 x 10 rectangle turned by 30 degrees
  const a = Math.PI / 6;
  const rot = ([x, y]) => [100 + x * Math.cos(a) - y * Math.sin(a), 50 + x * Math.sin(a) + y * Math.cos(a)];
  const t = minAreaRect([[0, 0], [40, 0], [40, 10], [0, 10], [20, 5]].map(rot));
  assert.ok(close(Math.min(t.w, t.h), 10, 1e-6) && close(Math.max(t.w, t.h), 40, 1e-6));
  assert.equal(t.points.length, 4);
});

test("miniBox orders the rectangle's corners top-left, top-right, bottom-right, bottom-left (PaddleOCR rule)", () => {
  const b = miniBox([[10, 20], [49, 20], [49, 29], [10, 29], [30, 25]]);
  assert.ok(near(b.points, [[10, 20], [49, 20], [49, 29], [10, 29]]), JSON.stringify(b.points));
  assert.ok(close(b.sside, 9));
});

test("unclip grows a rectangle by area * ratio / perimeter on every side", () => {
  const d = (39 * 9 * 1.5) / (2 * (39 + 9));
  const u = unclip([[10, 20], [49, 20], [49, 29], [10, 29]], 1.5);
  assert.ok(near(miniBox(u).points, [[10 - d, 20 - d], [49 + d, 20 - d], [49 + d, 29 + d], [10 - d, 29 + d]], 1e-6));
});

test("orderClockwise: smallest x + y first, then the smaller y - x", () => {
  assert.deepEqual(orderClockwise([[50, 30], [10, 30], [50, 10], [10, 10]]), [[10, 10], [50, 10], [50, 30], [10, 30]]);
});

test("dbBoxes: confident regions become boxes, weak and tiny ones are dropped, coordinates scaled to the image", () => {
  const w = 120, h = 80;
  const pred = probMap(w, h, [
    [10, 20, 49, 29, 0.9],   // a text line
    [60, 50, 109, 61, 0.8],  // another
    [70, 5, 100, 10, 0.4],   // above thresh 0.3 but the box score 0.4 < box_thresh 0.6
    [5, 70, 6, 71, 0.95],    // 2 x 2: shorter side 1 < min size 3
  ]);
  const boxes = dbBoxes(pred, w, h, { destW: 240, destH: 160 });
  assert.equal(boxes.length, 2, JSON.stringify(boxes));
  const first = boxes.find((b) => b.quad[0][0] < 60);
  const d = (39 * 9 * 1.5) / (2 * (39 + 9));
  // scaled x2, rounded, clockwise from the top-left
  assert.deepEqual(first.quad, [[Math.round((10 - d) * 2), Math.round((20 - d) * 2)], [Math.round((49 + d) * 2),
    Math.round((20 - d) * 2)], [Math.round((49 + d) * 2), Math.round((29 + d) * 2)], [Math.round((10 - d) * 2),
    Math.round((29 + d) * 2)]]);
  assert.ok(close(first.score, 0.9, 1e-6), String(first.score));
});

test("dbBoxes: a region on the image border is clipped to the image", () => {
  const w = 60, h = 30;
  const pred = probMap(w, h, [[0, 0, 40, 9, 0.9]]);
  const [b] = dbBoxes(pred, w, h, { destW: w, destH: h });
  for (const [x, y] of b.quad) assert.ok(x >= 0 && x <= w - 1 && y >= 0 && y <= h - 1, JSON.stringify(b.quad));
});

test("regions: 8-connected pixels are one region (cv2 contours); a one-pixel gap separates", () => {
  const w = 30, h = 30;
  const pred = probMap(w, h, [[2, 2, 5, 5, 0.9], [6, 6, 9, 9, 0.9],  // touching at a corner: one region
    [15, 2, 18, 5, 0.9], [20, 2, 23, 5, 0.9]]);                      // a column of 0 between: two regions
  const regs = regions(pred, w, h, 0.3);
  assert.equal(regs.length, 3);
  // per region: each row's leftmost and rightmost pixel (what the hull needs)
  const first = regs.find((r) => r.some(([x, y]) => x === 2 && y === 2));
  assert.ok(first.some(([x, y]) => x === 9 && y === 9));
  assert.equal(first.length, 16);  // 8 rows x 2 ends
});
