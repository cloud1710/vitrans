// Reading a PDF page (web/pdf/read.js): pdf.js text items -> layout items in viewport space (horizontal text only),
// the page's text statistics (is there a usable text layer?), OCR lines -> items, and the background colour around
// a block sampled from a rendered page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsFromText, textStats, ocrItems, sampleRing, boxOfOcr } from "../read.js";

const V = [1, 0, 0, -1, 0, 842];

test("pdf.js items become viewport items; rotated and vertical text stays out", () => {
  const tc = { items: [
    { str: "Hello world", transform: [12, 0, 0, 12, 50, 700], width: 60, dir: "ltr" },
    { str: " ", transform: [12, 0, 0, 12, 110, 700], width: 3, dir: "ltr" },
    { str: "Axis label", transform: [0, 10, -10, 0, 30, 300], width: 45, dir: "ltr" },
    { str: "縦", transform: [10, 0, 0, 10, 300, 300], width: 10, dir: "ttb" },
    { type: "beginMarkedContent" },
  ] };
  const r = itemsFromText(tc, V);
  assert.deepEqual(r.items, [{ str: "Hello world", x0: 50, x1: 110, base: 142, size: 12, top: 133, bottom: 145 }]);
  assert.equal(r.rotated, 10 + 1);
});

test("a page whose text is mostly private-use or control characters has no usable text layer", () => {
  assert.deepEqual(textStats([{ str: "Normal English text here." }]), { chars: 22, junk: 0, usable: true });
  assert.equal(textStats([{ str: "\u0003\u0004 ab" }]).usable, false);
  assert.equal(textStats([]).usable, false);
});

test("OCR boxes in several shapes; lines become items at scale 1", () => {
  assert.deepEqual(boxOfOcr([10, 20, 110, 40]), [10, 20, 110, 40]);
  assert.deepEqual(boxOfOcr([[10, 20], [110, 22], [110, 40], [10, 38]]), [10, 20, 110, 40]);
  assert.deepEqual(boxOfOcr({ x: 10, y: 20, w: 100, h: 20 }), [10, 20, 110, 40]);
  assert.deepEqual(boxOfOcr({ x0: 10, y0: 20, x1: 110, y1: 40 }), [10, 20, 110, 40]);
  assert.deepEqual(boxOfOcr({ left: 10, top: 20, right: 110, bottom: 40 }), [10, 20, 110, 40]);
  const items = ocrItems({ lines: [{ text: " Scanned line ", box: [100, 200, 500, 240] }, { text: "", box: [0, 0, 1, 1] }] }, 2);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.str, "Scanned line");
  assert.deepEqual([it.x0, it.x1], [50, 250]);
  assert.ok(it.size > 12 && it.size < 20, "size " + it.size);
  assert.ok(it.base > 100 && it.base <= 120, "base " + it.base);
  assert.equal(it.style.invisible, false);
});

test("OCR line heights that differ only by ascenders and descenders give one font size; a heading stays larger", () => {
  const items = ocrItems({ lines: [{ text: "Case report", box: [90, 100, 300, 150] },
    { text: "A synthetic line", box: [90, 190, 700, 222] }, { text: "with descenders: gypq", box: [90, 222, 700, 260] },
    { text: "plain line", box: [90, 262, 500, 291] }] }, 1);
  const sizes = items.map((i) => Math.round(i.size * 100) / 100);
  assert.equal(sizes[1], sizes[2]);
  assert.equal(sizes[2], sizes[3]);
  assert.ok(sizes[0] > 1.3 * sizes[1], sizes.join());
});

test("the background around a block is the median colour of a ring just outside it", () => {
  // a 40 x 30 image at scale 2: light yellow everywhere, a dark "text" area inside the block, one red speck
  const w = 40;
  const h = 30;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const inside = x >= 10 && x < 30 && y >= 10 && y < 20;
      data.set(inside ? [20, 20, 20, 255] : [250, 245, 200, 255], k);
    }
  }
  data.set([255, 0, 0, 255], (8 * w + 8) * 4);
  const rgb = sampleRing({ width: w, height: h, data }, { x0: 5, x1: 15, top: 5, bottom: 10 }, 2);
  assert.deepEqual(rgb.map((v) => Math.round(v * 255)), [250, 245, 200]);
});
