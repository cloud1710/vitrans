// Pre-processing of the OCR models' inputs (web/ocr/pre.js), as PaddleOCR / PaddleX feed PP-OCRv5:
// detection -- the image resized (limit side 64 'min', a maximum side, both sides multiples of 32), BGR, ImageNet
// mean / std taken in that order; recognition -- each box cut out along its rectangle (a tall box turned 90 degrees
// counter-clockwise), resized to height 48 keeping its ratio, (x / 255 - 0.5) / 0.5, BGR, zero padding to the batch
// width int(48 * max(320 / 48, widest ratio)), lines batched by ratio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detSize, resizeBilinear, detTensor, cropSize, recBatches, recTensor, REC_H } from "../pre.js";

const close = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;

// an RGBA image w x h filled by f(x, y) -> [r, g, b]
function image(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return d;
}

test("detSize: the long side capped, a short side under 64 raised to 64, both rounded to multiples of 32", () => {
  assert.deepEqual(detSize(2048, 1536, 1280), { w: 1280, h: 960 });
  assert.deepEqual(detSize(1000, 700, 1280), { w: 992, h: 704 });
  assert.deepEqual(detSize(100, 30, 1280), { w: 224, h: 64 });
  assert.deepEqual(detSize(10, 10, 1280), { w: 64, h: 64 });
  assert.deepEqual(detSize(5000, 40, 1280), { w: 1280, h: 32 });  // the cap wins over the 64 minimum
  // Python's round(): halves to even (80 / 32 = 2.5 -> 2, 112 / 32 = 3.5 -> 4)
  assert.deepEqual(detSize(200, 100, 160), { w: 160, h: 64 });
  assert.deepEqual(detSize(224, 112, 1280), { w: 224, h: 128 });
});

test("resizeBilinear: a flat image stays flat; 2 x 2 blocks survive a halving", () => {
  const flat = resizeBilinear(image(7, 5, () => [10, 20, 30]), 7, 5, 3, 2);
  for (let i = 0; i < 6; i++) assert.deepEqual(Array.from(flat.slice(i * 4, i * 4 + 4)), [10, 20, 30, 255]);
  const blocks = image(4, 4, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [200, 200, 200] : [0, 0, 0]);
  const half = resizeBilinear(blocks, 4, 4, 2, 2);
  assert.deepEqual([half[0], half[4], half[8], half[12]], [0, 200, 200, 0]);
});

test("detTensor: CHW, channel 0 = blue, ImageNet mean / std in PaddleOCR's order", () => {
  const t = detTensor(image(2, 1, () => [255, 0, 51]), 2, 1);
  assert.equal(t.length, 6);
  assert.ok(close(t[0], (51 / 255 - 0.485) / 0.229));  // B
  assert.ok(close(t[2], (0 - 0.456) / 0.224));         // G
  assert.ok(close(t[4], (1 - 0.406) / 0.225));         // R
});

test("cropSize: the rectangle's longer edges; tall boxes (h / w >= 1.5) are turned", () => {
  assert.deepEqual(cropSize([[0, 0], [100.7, 0], [100.7, 20.2], [0, 20.2]]), { cw: 100, ch: 20, rotate: false });
  assert.deepEqual(cropSize([[0, 0], [10, 0], [10, 40], [0, 40]]), { cw: 10, ch: 40, rotate: true });
});

test("recBatches: lines sorted by width ratio, batches of 6, each with its max ratio (at least 320 / 48)", () => {
  const quads = [200, 50, 900, 120, 60, 400, 70, 80].map((w) => [[0, 0], [w, 0], [w, 20], [0, 20]]);
  const b = recBatches(quads, 6);
  assert.deepEqual(b.map((x) => x.items), [[1, 4, 6, 7, 3, 0], [5, 2]]);
  assert.ok(close(b[0].ratio, 10));                    // 200 / 20
  assert.ok(close(b[1].ratio, 45));                    // 900 / 20
  assert.ok(close(recBatches([[[0, 0], [30, 0], [30, 20], [0, 20]]])[0].ratio, 320 / 48));
});

test("recTensor: a dark / light line keeps left and right, padding is 0, values in [-1, 1]", () => {
  const W = 120, H = 40;
  const img = image(W, H, (x) => (x < 60 ? [0, 0, 0] : [255, 255, 255]));
  const quad = [[20, 10], [100, 10], [100, 30], [20, 30]];  // 80 x 20 -> 192 x 48
  const ratio = 320 / 48;                                    // 320 wide
  const { data, width } = recTensor(img, W, H, [quad], ratio);
  assert.equal(width, 320);
  assert.equal(data.length, 3 * REC_H * 320);
  const at = (c, y, x) => data[c * REC_H * 320 + y * 320 + x];
  assert.ok(close(at(0, 24, 5), -1) && close(at(2, 24, 5), -1));     // dark start
  assert.ok(close(at(0, 24, 185), 1) && close(at(1, 24, 185), 1));   // light end
  assert.equal(at(0, 24, 200), 0);                                   // padding beyond 192
  for (const v of data) assert.ok(v >= -1 && v <= 1);
});

test("recTensor: a tall box is turned counter-clockwise (its top at the left)", () => {
  const W = 40, H = 60;
  const img = image(W, H, (x, y) => (y < 30 ? [0, 0, 0] : [255, 255, 255]));
  const quad = [[15, 10], [25, 10], [25, 50], [15, 50]];  // 10 x 40: turned, 40 x 10 -> 192 x 48
  const { data, width } = recTensor(img, W, H, [quad], 192 / 48);
  assert.equal(width, 192);
  const at = (y, x) => data[y * width + x];
  assert.ok(close(at(24, 5), -1), String(at(24, 5)));
  assert.ok(close(at(24, 186), 1), String(at(24, 186)));
});

test("recTensor: a batch of two lines stacks them, each padded to the batch width", () => {
  const W = 100, H = 20;
  const img = image(W, H, () => [255, 255, 255]);
  const { data, width, n } = recTensor(img, W, H, [[[0, 0], [20, 0], [20, 10], [0, 10]],
    [[0, 0], [90, 0], [90, 10], [0, 10]]], 9);
  assert.equal(n, 2);
  assert.equal(width, 432);
  const plane = REC_H * width;
  assert.ok(close(data[0 * 3 * plane + 10 * width + 50], 1));        // line 1: 96 wide
  assert.equal(data[0 * 3 * plane + 10 * width + 100], 0);            // its padding
  assert.ok(close(data[1 * 3 * plane + 10 * width + 400], 1));       // line 2: 432 wide
});
