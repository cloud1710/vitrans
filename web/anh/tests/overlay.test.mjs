// The plan of the overlay for one block (web/anh/overlay.js): the cover = the block's own box (its lines' rectangle in
// the text's frame plus a small margin), its background sampled just outside it, the text colour, ink height and
// stroke width measured inside it, the alignment from the lines, the siblings and the container around it, and the
// cover painted by smooth interpolation from its border; the drawing itself runs on a canvas in Chrome
// (tests/page_anh.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBlock, turn, styleHeights, alignOf, inpaintCover, harmonise } from "../overlay.js";

// an RGBA image w x h: background bg, and "text" pixels (every other column) inside the rectangles
function image(w, h, bg, rects, fg) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 2) data.set([...fg, 255], (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}

function fill(img, [x0, y0, x1, y1], c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img.data.set([...c, 255], (y * img.width + x) * 4);
}

// "glyphs": vertical bars of a stroke width, every `pitch` px, inside [x0, y0, x1, y1]
function bars(img, [x0, y0, x1, y1], stroke, pitch, c) {
  for (let x = x0; x + stroke - 1 <= x1; x += pitch) fill(img, [x, y0, x + stroke - 1, y1], c);
}

const block = (rect, angle, height, extra) => Object.assign({ rect, angle: angle || 0, height: height || rect[3] - rect[1],
  lineRects: [rect] }, extra || {});
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

test("background from just outside the block, text colour from inside it", () => {
  const img = image(240, 120, [246, 244, 238], [[40, 40, 160, 60]], [20, 40, 110]);
  const p = planBlock(block([38, 36, 162, 64]), img);
  assert.deepEqual(p.bg, [246, 244, 238]);
  assert.deepEqual(p.fg, [20, 40, 110]);
  // the cover is the block's rectangle with a small margin
  assert.ok(p.rect[0] < 38 && p.rect[2] > 162 && p.rect[1] < 36 && p.rect[3] > 64);
  assert.ok(p.rect[0] > 30 && p.rect[2] < 170);
});

test("a turned block samples around its turned rectangle", () => {
  const a = 0.08;
  const r = [60, 40, 180, 64];
  const img = image(260, 160, [10, 10, 10], [], [0, 0, 0]);
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 260; x++) {
      const qx = x * Math.cos(a) + y * Math.sin(a), qy = -x * Math.sin(a) + y * Math.cos(a);
      if (qx >= r[0] && qx <= r[2] && qy >= r[1] && qy <= r[3]) img.data.set([250, 250, 250, 255], (y * 260 + x) * 4);
    }
  }
  const p = planBlock(block(r, a), img);
  assert.deepEqual(p.bg, [10, 10, 10]);
  assert.deepEqual(p.fg, [250, 250, 250]);
  const [x, y] = turn([r[0], r[1]], a);
  assert.ok(Math.abs(x - (r[0] * Math.cos(a) - r[1] * Math.sin(a))) < 1e-9 && Math.abs(y - (r[0] * Math.sin(a) + r[1] * Math.cos(a))) < 1e-9);
});

test("ink height and stroke width are measured inside the block: thin strokes (regular) vs thick ones (bold)", () => {
  const img = image(400, 200, [12, 26, 63], [], [0, 0, 0]);
  bars(img, [50, 40, 350, 75], 3, 14, [245, 197, 66]);    // 36 px tall, 3 px strokes
  bars(img, [50, 120, 350, 155], 6, 14, [245, 197, 66]);  // 6 px strokes
  const thin = planBlock(block([46, 36, 354, 80]), img);
  const thick = planBlock(block([46, 116, 354, 160]), img);
  assert.deepEqual([thin.inkTop, thin.inkBottom], [40, 75]);
  assert.equal(thin.inkH, 36);
  assert.equal(thin.stroke, 3);
  assert.equal(thick.stroke, 6);
  assert.deepEqual(thick.fg, [245, 197, 66]);
});

test("a vertical gradient behind the text is painted back smoothly (no flat box), outside the cover untouched", () => {
  const w = 300, h = 120;
  const img = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set([10, 20 + y, 60 + Math.round(x / 4), 255], (y * w + x) * 4);
  bars(img, [60, 40, 240, 70], 4, 10, [255, 255, 255]);
  const out = { data: new Uint8ClampedArray(img.data), width: w, height: h };
  const cover = [54, 34, 246, 76];
  inpaintCover(img, out, cover, 0);
  let worst = 0;
  for (let y = 36; y <= 74; y++) {
    for (let x = 56; x <= 244; x++) {
      const p = px(out, x, y);
      worst = Math.max(worst, Math.abs(p[1] - (20 + y)), Math.abs(p[2] - (60 + Math.round(x / 4))), Math.abs(p[0] - 10));
    }
  }
  assert.ok(worst <= 3, "largest error " + worst);
  assert.deepEqual(px(out, 30, 50), px(img, 30, 50));
  assert.deepEqual(px(out, 150, 20), px(img, 150, 20));
});

test("the cover keeps the grain of a noisy background (a matched noise), a clean one stays clean", () => {
  const w = 200, h = 100;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const noisy = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  for (let i = 0; i < w * h; i++) {
    const v = 100 + Math.round((rnd() - 0.5) * 10);
    noisy.data.set([v, v, v, 255], i * 4);
  }
  const clean = image(w, h, [100, 100, 100], [], [0, 0, 0]);
  for (const img of [noisy, clean]) {
    bars(img, [50, 40, 150, 60], 4, 10, [255, 255, 255]);
    const out = { data: new Uint8ClampedArray(img.data), width: w, height: h };
    inpaintCover(img, out, [44, 34, 156, 66], 0);
    const v = [];
    for (let y = 36; y <= 64; y++) for (let x = 46; x <= 154; x++) v.push(px(out, x, y)[0]);
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
    assert.ok(Math.abs(mean - 100) < 1.5, "mean " + mean);
    if (img === clean) assert.equal(sd, 0);
    else assert.ok(sd > 1.5 && sd < 4.5, "sd " + sd + " (the background's is 2.9)");
  }
});

test("alignment of a multi-line block from its lines: left, right or centred edges", () => {
  const img = image(800, 400, [255, 255, 255], [], [0, 0, 0]);
  const lines = (rs) => block([Math.min(...rs.map((r) => r[0])), rs[0][1], Math.max(...rs.map((r) => r[2])), rs[rs.length - 1][3]],
    0, 30, { lineRects: rs });
  assert.equal(alignOf(lines([[100, 50, 600, 80], [100, 90, 400, 120]]), [], img), "left");
  assert.equal(alignOf(lines([[100, 50, 600, 80], [300, 90, 600, 120]]), [], img), "right");
  assert.equal(alignOf(lines([[100, 50, 700, 80], [250, 90, 550, 120]]), [], img), "center");
});

test("alignment of a single line: centred in the picture, against the left or right margin, centred in a box", () => {
  const img = image(1600, 1000, [10, 26, 63], [], [0, 0, 0]);
  fill(img, [200, 700, 900, 790], [245, 197, 66]);  // a gold box, left of the middle
  const title = block([280, 190, 1320, 260], 0, 70);
  const right = block([1318, 70, 1520, 104], 0, 34);
  const left = block([120, 565, 560, 605], 0, 40);
  const inBox = block([300, 728, 800, 762], 0, 34);    // centred in the box (200..900), not in the picture
  const all = [title, right, left, inBox];
  assert.equal(alignOf(title, all, img), "center");
  assert.equal(alignOf(right, all, img), "right");
  assert.equal(alignOf(left, all, img), "left");
  assert.equal(alignOf(inBox, all, img), "center");
  // lines that share a left edge with a sibling are left-aligned even when they happen to sit in the middle
  const a = block([400, 100, 1200, 130], 0, 30), b = block([400, 160, 900, 190], 0, 30);
  assert.equal(alignOf(a, [a, b], img), "left");
});

test("lines of one style share a height (the median of the heights within 25 %)", () => {
  assert.deepEqual(styleHeights([37, 41, 44, 43, 40.5, 60]), [41, 41, 41, 41, 41, 60]);
  assert.deepEqual(styleHeights([]), []);
});

test("sizes of one style are made equal when they differ by less than 15 %; larger differences stay", () => {
  assert.deepEqual(harmonise([{ size: 30, original: 32 }, { size: 28, original: 32 }, { size: 32, original: 32 }]), [28, 28, 28]);
  assert.deepEqual(harmonise([{ size: 30, original: 32 }, { size: 20, original: 32 }]), [30, 20]);
  assert.deepEqual(harmonise([{ size: 30, original: 32 }, { size: 60, original: 64 }]), [30, 60]);
});
