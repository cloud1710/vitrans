// Fitting the Vietnamese text into a block's own box (web/anh/fit.js fitBox): the largest size (0.5 px steps) between
// the floor and the original size at which the greedy word wrap fits the width and the lines fit the height; at the
// floor tighter spacing, then narrower letters, never outside the box; a word wider than the box is cut into pieces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapText, fitBox } from "../fit.js";

// a monospace stand-in for canvas measureText: every character is half the size wide
const measure = (text, size) => Array.from(text).length * 0.5 * size;

test("box fit: the largest size that fits -- half a pixel larger does not", () => {
  const text = "Thời gian xử lý trung bình giảm 18% sau khi đào tạo nhân viên mới";
  const r = fitBox(text, 200, 60, { measure, maxSize: 24, minSize: 8, lineHeight: 1.2 });
  assert.ok(r.size < 24 && r.lines.length >= 2 && !r.squeezed, JSON.stringify(r));
  for (const l of r.lines) assert.ok(measure(l, r.size) <= 200);
  assert.ok((r.lines.length - 1) * r.size * 1.2 + r.size <= 60);
  assert.equal(r.lines.join(" "), text);
  const bigger = wrapText(text, 200, r.size + 0.5, measure);
  assert.ok((bigger.length - 1) * (r.size + 0.5) * 1.2 + r.size + 0.5 > 60 || bigger.some((l) => measure(l, r.size + 0.5) > 200));
});

test("a word wider than the box is cut into pieces that fit", () => {
  const lines = wrapText("immunohistochemistry", 50, 10, measure);
  assert.ok(lines.length >= 2);
  assert.equal(lines.join(""), "immunohistochemistry");
  for (const l of lines) assert.ok(measure(l, 10) <= 50);
});

// fitBox: the original box exactly; the size scales both ways between the floor and the original size
const box = (text, w, h, o = {}) => fitBox(text, w, h, { measure, maxSize: 40, minSize: 24, lineHeight: 1.2, extent: 1, ...o });
const height = (r) => (r.lines.length - 1) * r.size * r.lineHeight + r.size;
const width = (r, l) => (measure(l, r.size) + r.spacing * r.size * (Array.from(l).length - 1)) * r.scaleX;

test("box fit, grow: a short text takes the original size (the largest), one line", () => {
  const r = box("Tôi tham dự", 600, 50);
  assert.deepEqual([r.size, r.lines, r.squeezed, r.scaleX, r.spacing], [40, ["Tôi tham dự"], false, 1, 0]);
});

test("box fit, shrink: a longer text in a one-line box gets the largest size that keeps it on one line", () => {
  const text = "Trí tuệ trong từng pixel thế hệ mới";  // 35 characters: 35 x 0.5 x size <= 600 -> size <= 34.2
  const r = box(text, 600, 50);
  assert.deepEqual([r.lines.length, r.squeezed], [1, false]);
  assert.ok(r.size < 40 && r.size >= 34 && width(r, r.lines[0]) <= 600, JSON.stringify(r));
});

test("box fit, wrap: a box two lines high takes two lines at a larger size than one line would allow", () => {
  const text = "Đại hội thường niên lần thứ ba của hội bệnh học số châu Á";  // 57 characters
  const r = box(text, 600, 110, { minSize: 10 });
  assert.equal(r.lines.length, 2, JSON.stringify(r));
  assert.ok(r.size > 600 / (57 * 0.5), "larger than the one-line size");
  assert.ok(height(r) <= 110 && r.lines.every((l) => width(r, l) <= 600));
  assert.equal(r.lines.join(" "), text);
});

test("box fit, floor: too long at the floor -> the floor size, tighter spacing / narrower letters, never outside", () => {
  const text = "một hai ba bốn năm sáu bảy tám chín mười ".repeat(3).trim();  // 122 characters
  const r = box(text, 600, 50);
  assert.equal(r.size, 24, "never below the floor");
  assert.equal(r.squeezed, true);
  assert.ok(r.spacing < 0 || r.scaleX < 1, JSON.stringify(r));
  assert.ok(height(r) <= 50 + 1e-9 && r.lines.every((l) => width(r, l) <= 600 + 1e-9), JSON.stringify(r));
  assert.equal(r.lines.join(" "), text);
  // a little too long: the tighter spacing alone is enough
  const t = box("x".repeat(51), 600, 50);
  assert.deepEqual([t.size, t.squeezed, t.scaleX], [24, true, 1]);
  assert.ok(t.spacing < 0 && width(t, t.lines[0]) <= 600);
});

test("line breaks in the text are kept; empty text is no lines", () => {
  assert.deepEqual(wrapText("a\nb c", 1000, 10, measure), ["a", "b c"]);
  assert.deepEqual(fitBox("", 100, 20, { measure, maxSize: 20, minSize: 10, lineHeight: 1.2 }),
    { size: 20, lines: [], lineHeight: 1.2, spacing: 0, scaleX: 1, squeezed: false });
});
