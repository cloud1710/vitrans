// Fitting the Vietnamese into a block's box (web/pdf/fit.js): greedy wrap at spaces (a word wider than the box is
// cut), the largest size from the original down to the minimum, then overflow marked; the room a block may grow
// into (free space below, and to the right for one-line blocks), never over another block or an image.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapLines, fitText, roomFor, fitBlock, sharedSizes, placeAt, sizeNeeded, FLOOR_SHARE } from "../fit.js";

// a fixed-pitch font: every character 0.5 em
const measure = (s, size) => Array.from(s).length * 0.5 * size;

test("lines wrap at spaces and a word wider than the box is cut", () => {
  assert.deepEqual(wrapLines("một hai ba bốn năm", 50, (s) => measure(s, 10)), ["một hai ba", "bốn năm"]);
  assert.deepEqual(wrapLines("abcdefghijklmnop", 30, (s) => measure(s, 10)), ["abcdef", "ghijkl", "mnop"]);
  assert.deepEqual(wrapLines("  a   b  ", 100, (s) => measure(s, 10)), ["a b"]);
  assert.deepEqual(wrapLines("", 100, (s) => measure(s, 10)), []);
});

test("text that fits keeps the original size", () => {
  const r = fitText("một hai ba bốn năm", { w: 100, h: 30 }, { size: 10, lineRatio: 1.2, measure });
  assert.equal(r.size, 10);
  assert.deepEqual(r.lines, ["một hai ba bốn năm"]);
  assert.equal(r.overflow, false);
  assert.equal(r.pitch, 12);
});

test("longer text shrinks to the largest size that fits", () => {
  // 40 characters in a 100 x 24 box at 10 pt: 2 lines of 20 need height 22 (12 + 10): fits at 10;
  // 60 characters: 3 lines at 10 pt (34 high) do not fit; at 8 pt lines of 25 characters, 3 lines = 28.6: no;
  // the answer is the largest size whose lines fit in 24 points
  const text = Array.from({ length: 12 }, () => "abcd").join(" ");  // 59 characters
  const r = fitText(text, { w: 100, h: 24 }, { size: 10, lineRatio: 1.2, measure });
  assert.equal(r.overflow, false);
  assert.ok(r.size < 10 && r.size >= 6, "size " + r.size);
  const h = (r.lines.length - 1) * r.pitch + r.size;
  assert.ok(h <= 24 + 0.25 * r.size, "height " + h);
  assert.ok(r.lines.every((l) => measure(l, r.size) <= 100));
  // one step bigger would not fit
  const bigger = fitText(text, { w: 100, h: 24 }, { size: r.size + 0.5, minSize: r.size + 0.5, lineRatio: 1.2, measure });
  assert.equal(bigger.overflow, true);
});

test("text that does not fit at the minimum size is drawn at the minimum and marked", () => {
  const text = Array.from({ length: 40 }, () => "abcd").join(" ");
  const r = fitText(text, { w: 60, h: 12 }, { size: 10, minSize: 6, lineRatio: 1.2, measure });
  assert.equal(r.overflow, true);
  assert.equal(r.size, 6);
  assert.ok(r.lines.length > 1);
  // the default minimum is 60 % of the size, never under 4 pt
  assert.equal(fitText(text, { w: 60, h: 12 }, { size: 10, lineRatio: 1.2, measure }).size, 6);
  assert.equal(fitText(text, { w: 60, h: 2 }, { size: 5, lineRatio: 1.2, measure }).size, 4);
});

test("a one-line block (heading, cell) shrinks on one line before it wraps", () => {
  // 24 characters: 120 pt at 10 pt in a 100 pt box with room for two lines
  const text = "abcdef ghijkl mnopqr stu";
  assert.equal(fitText(text, { w: 100, h: 30 }, { size: 10, lineRatio: 1.2, measure }).lines.length, 2);
  const one = fitText(text, { w: 100, h: 30 }, { size: 10, lineRatio: 1.2, measure, oneLine: true });
  assert.deepEqual(one.lines, [text]);
  assert.ok(one.size <= 100 / 12 && one.size >= 6 && !one.overflow, "size " + one.size);
  // too long for one line even at the minimum: wraps as usual
  const long = fitText(text + " " + text, { w: 100, h: 30 }, { size: 10, lineRatio: 1.2, measure, oneLine: true });
  assert.ok(long.lines.length > 1);
});

test("a centred block may use the same room on both sides of its centre", () => {
  const page = { width: 595, height: 842, margin: { x0: 50, x1: 545, top: 40, bottom: 800 } };
  const room = roomFor({ box: { x0: 200, x1: 400, top: 100, bottom: 118 }, lines: [{}], size: 18, align: "center" }, [], page);
  // centre 300: 250 pt to the left margin, 245 pt to the right one -> 245 on each side
  assert.deepEqual([room.x0, room.x1], [55, 545]);
});

test("a block keeps to its own box while a little smaller type will do, and only then grows", () => {
  const box = { x0: 0, x1: 100, top: 0, bottom: 12 };
  const room = { x0: 0, x1: 300, top: 0, bottom: 40 };
  // 21 characters: 105 pt at 10 pt; 9 pt fits the box (94.5 pt): stays in the box
  const a = fitBlock("abcdefghij klmnopqrst", box, room, { size: 10, lineRatio: 1.2, measure });
  assert.deepEqual([a.size < 10 && a.size >= 8.5, a.lines.length, a.room], [true, 1, box]);
  // 41 characters need 70 % or a second line: the room is used at the full size
  const b = fitBlock("abcdefghij klmnopqrst abcdefghij klmnopqrs", box, room, { size: 10, lineRatio: 1.2, measure });
  assert.deepEqual([b.size, b.room], [10, room]);
});

test("a right-aligned line grows to the left, up to the margin or its left neighbour", () => {
  const page = { width: 595, height: 842, margin: { x0: 50, x1: 545, top: 40, bottom: 800 } };
  const block = { box: { x0: 475, x1: 545, top: 40, bottom: 60 }, lines: [{}], size: 20, align: "right" };
  const room = roomFor(block, [], page);
  assert.deepEqual([room.x0, room.x1], [50, 545]);
  const nb = roomFor(block, [{ x0: 60, x1: 200, top: 42, bottom: 58 }], page);
  assert.deepEqual([nb.x0, nb.x1], [210, 545]);
});

test("a block may grow down to the next obstacle and, on one line, to the right", () => {
  const page = { width: 595, height: 842, margin: { x0: 50, x1: 545, top: 40, bottom: 800 } };
  const block = { box: { x0: 50, x1: 200, top: 100, bottom: 112 }, lines: [{}], size: 10 };
  const below = { x0: 60, x1: 300, top: 150, bottom: 162 };
  const right = { x0: 300, x1: 400, top: 98, bottom: 110 };
  const room = roomFor(block, [below, right], page);
  assert.equal(room.x0, 50);
  assert.ok(Math.abs(room.x1 - (300 - 5)) < 1e-9, "x1 " + room.x1);  // up to the right neighbour, less a gap
  assert.ok(room.bottom <= 150 - 2 && room.bottom > 112, "bottom " + room.bottom);
  // an obstacle that does not overlap horizontally does not stop it: the cap does (two lines of its size)
  const far = roomFor(block, [{ x0: 560, x1: 590, top: 130, bottom: 140 }], page);
  assert.equal(far.bottom, 136);
  // growth below is capped at the block's own height (at least two lines of its size)
  const tall = roomFor({ box: { x0: 50, x1: 545, top: 100, bottom: 160 }, lines: [{}, {}, {}, {}, {}], size: 10 }, [], page);
  assert.equal(tall.bottom, 220);
  assert.equal(tall.x1, 545);  // several lines: no growth to the right
  // a table cell stays in its cell
  const cell = roomFor({ box: { x0: 50, x1: 90, top: 100, bottom: 112 }, lines: [{}], size: 10, kind: "cell",
    cellBox: { x0: 48, x1: 140, top: 98, bottom: 114 } }, [], page);
  assert.deepEqual(cell, { x0: 50, x1: 140, top: 100, bottom: 114 });
});

// two faces: "B" (bold) 0.6 em per character, anything else 0.5 em
const measure2 = (s, size, face) => Array.from(s).length * (face === "B" ? 0.6 : 0.5) * size;

test("styled runs wrap like plain text and each line keeps its runs and faces", () => {
  const runs = [{ text: "Ho ten:", face: "B" }, { text: " Nguoi Tong hop bac si", face: "R" }];
  // 7 bold characters (42 pt at 10 pt) + space + 21 regular ones: one line needs 42 + 5 + 105 = 152 pt
  const one = fitText(runs, { w: 200, h: 12 }, { size: 10, lineRatio: 1.2, measure: measure2 });
  assert.deepEqual(one.lines, ["Ho ten: Nguoi Tong hop bac si"]);
  assert.deepEqual(one.runs, [[{ text: "Ho ten: ", face: "B" }, { text: "Nguoi Tong hop bac si", face: "R" }]]);
  // 90 pt wide: "Ho ten: Nguoi" is 42 + 5 + 25 = 72, with " Tong" 97 > 90
  const two = fitText(runs, { w: 90, h: 40 }, { size: 10, lineRatio: 1.2, measure: measure2 });
  assert.deepEqual(two.lines, ["Ho ten: Nguoi", "Tong hop bac si"]);
  assert.deepEqual(two.runs[0].map((r) => r.face), ["B", "R"]);
  assert.deepEqual(two.runs[1], [{ text: "Tong hop bac si", face: "R" }]);
  // a word in two faces is measured piece by piece: "Bronchi:" with the colon regular
  const w = wrapLines([{ text: "Bronchi", face: "B" }, { text: ": the bronchi", face: "R" }], 62, (t, f) => measure2(t, 10, f));
  assert.deepEqual(w, ["Bronchi:", "the bronchi"]);  // all regular, "Bronchi: the" (60 pt) would fit
});

test("blocks that shared a size share one: the smallest any of them needs, never under the floor", () => {
  const sizes = sharedSizes([{ key: "a", size: 10, need: 9 }, { key: "a", size: 10, need: 7.6 }, { key: "a", size: 10, need: 10 },
    { key: "b", size: 14, need: 14 }]);
  assert.equal(sizes.get("a"), 7.6);
  assert.equal(sizes.get("b"), 14);
  // a block that does not fit even at the floor (need null) holds its group at the floor, not under it
  const floor = sharedSizes([{ key: "a", size: 10, need: null }, { key: "a", size: 10, need: 9 }]);
  assert.equal(floor.get("a"), 10 * FLOOR_SHARE);
  assert.ok(FLOOR_SHARE >= 0.7 && FLOOR_SHARE <= 0.75);
});

test("at a given size the block's own box comes first, then its room, then the deep room down to the next obstacle", () => {
  const box = { x0: 0, x1: 100, top: 0, bottom: 12 };
  const room = { x0: 0, x1: 100, top: 0, bottom: 36 };
  const deep = { x0: 0, x1: 100, top: 0, bottom: 200 };
  const words = (n) => Array.from({ length: n }, () => "abcd").join(" ");
  assert.deepEqual(placeAt(words(4), [box, room, deep], 8, { lineRatio: 1.2, measure }).room, box);
  const r = placeAt(words(12), [box, room, deep], 8, { lineRatio: 1.2, measure });
  assert.deepEqual([r.size, r.room, r.overflow], [8, room, false]);
  const d = placeAt(words(40), [box, room, deep], 8, { lineRatio: 1.2, measure });
  assert.deepEqual([d.size, d.room, d.overflow], [8, deep, false]);
  const o = placeAt(words(400), [box, room, deep], 8, { lineRatio: 1.2, measure });
  assert.deepEqual([o.size, o.room, o.overflow], [8, deep, true]);
  // the deep room: no cap below, only the next obstacle or the page margin
  const page = { width: 595, height: 842, margin: { x0: 50, x1: 545, top: 40, bottom: 800 } };
  const block = { box: { x0: 50, x1: 300, top: 100, bottom: 136 }, lines: [{}, {}, {}], size: 10 };
  assert.equal(roomFor(block, [{ x0: 60, x1: 200, top: 500, bottom: 512 }], page, { deep: true }).bottom, 498);
  assert.equal(roomFor(block, [], page, { deep: true }).bottom, 800);
});

test("the size a block needs: its own box at a little smaller type, else its room down to the floor, else none", () => {
  const box = { x0: 0, x1: 100, top: 0, bottom: 12 };
  const room = { x0: 0, x1: 100, top: 0, bottom: 36 };
  assert.ok(sizeNeeded("abcdefghij klmnopqrst", box, room, { size: 10, lineRatio: 1.2, measure }) >= 8.5);
  const words = (n) => Array.from({ length: n }, () => "abcd").join(" ");
  const n = sizeNeeded(words(12), box, { ...room, bottom: 30 }, { size: 10, lineRatio: 1.2, measure });
  assert.ok(n >= 7.2 && n < 10, "need " + n);
  assert.equal(sizeNeeded(words(60), box, room, { size: 10, lineRatio: 1.2, measure }), null);
  // a title may take a lower floor of its own: smaller on one line rather than broken over two big lines
  const title = { x0: 0, x1: 100, top: 0, bottom: 30 };
  const t = "abcdefghij klmnopqrstu";  // 22 characters, 11 pt per pt of size: one line of 220 pt up to 20 pt
  assert.ok(sizeNeeded(t, title, title, { size: 30, lineRatio: 1.2, measure, oneLine: true, floor: 0.6 }) === null);
  const big = { x0: 0, x1: 220, top: 0, bottom: 30 };
  const s = sizeNeeded(t, big, big, { size: 30, lineRatio: 1.2, measure, oneLine: true, floor: 0.6 });
  assert.ok(s >= 18 && s < 0.72 * 30, "title " + s);
  const two = fitText(t, { w: 220, h: 30 }, { size: 30, minSize: 30 * 0.72, lineRatio: 1.2, measure, oneLine: true });
  assert.ok(two.overflow, "at the common floor the title would not fit on one line");
  // sharedSizes floors a block that fits nowhere at its own floor
  assert.equal(sharedSizes([{ key: "h", size: 30, need: null, floor: 0.6 }]).get("h"), 18);
});
