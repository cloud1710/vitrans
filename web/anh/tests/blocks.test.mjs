// OCR lines -> blocks (web/anh/blocks.js): paragraphs, bullets, titles and table cells for translation and for the
// overlay; already-Vietnamese and letter-less blocks are kept as they are; segments in the core's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBlocks, blockSegments, isVietnamese, photoVerdict } from "../blocks.js";

// an OCR line from its axis-aligned box
const L = (text, x0, y0, x1, y1) => ({ text, box: [x0, y0, x1, y1], quad: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  score: 0.95 });

test("a wrapped paragraph is one block; a gap of more than half a line starts the next", () => {
  const lines = [
    L("Digital imaging allows a laboratory to share", 100, 100, 900, 140),
    L("slides with remote experts within minutes.", 100, 146, 860, 186),
    L("In this pilot each image was scanned at high", 100, 192, 900, 232),
    L("resolution and stored on a server.", 100, 238, 640, 278),
    L("A second reader repeated the count on half of", 100, 330, 900, 370),
    L("the images.", 100, 376, 300, 416),
  ];
  const b = groupBlocks(lines);
  assert.equal(b.length, 2);
  assert.deepEqual(b[0].lines, [0, 1, 2, 3]);
  assert.equal(b[0].text, "Digital imaging allows a laboratory to share slides with remote experts within minutes. In this "
    + "pilot each image was scanned at high resolution and stored on a server.");
  assert.deepEqual(b[0].box, [100, 100, 900, 278]);
  assert.deepEqual(b[1].lines, [4, 5]);
});

test("bullets start blocks, the bullet glyph is kept aside, a continuation line joins its bullet", () => {
  const lines = [
    L("Quarterly Results of the Field Study", 90, 100, 1100, 160),
    L("• Samples were collected from 42 sites in 2024", 100, 250, 1000, 295),
    L("• Mean processing time fell by 18% after", 100, 300, 950, 345),
    L("training of all new staff", 140, 350, 600, 395),
    L("- Next steps: expand the panel", 100, 400, 800, 445),
  ];
  const b = groupBlocks(lines);
  assert.deepEqual(b.map((x) => x.lines), [[0], [1], [2, 3], [4]]);
  assert.deepEqual(b.map((x) => x.bullet), [null, "•", "•", "-"]);
  assert.equal(b[2].text, "Mean processing time fell by 18% after training of all new staff");
  assert.equal(b[3].text, "Next steps: expand the panel");
});

test("a bullet read as its own small box joins the line to its right", () => {
  const lines = [L("●", 100, 250, 125, 280), L("Two reviewers checked every report", 140, 245, 900, 285)];
  const b = groupBlocks(lines);
  assert.equal(b.length, 1);
  assert.equal(b[0].bullet, "●");
  assert.equal(b[0].text, "Two reviewers checked every report");
  assert.deepEqual(b[0].lines, [1]);
});

test("table cells stay apart: short stacked cells do not merge, cells of one row do not merge", () => {
  const lines = [
    L("Marker", 80, 100, 220, 140), L("Positive", 420, 100, 560, 140), L("Total", 980, 100, 1080, 140),
    L("Ki-67", 80, 150, 180, 190), L("128", 420, 150, 480, 190), L("200", 980, 150, 1040, 190),
  ];
  const b = groupBlocks(lines);
  assert.equal(b.length, 6);
});

test("a title over two lines merges; a big title does not swallow the smaller text under it", () => {
  const lines = [
    L("Survival analysis of the", 100, 100, 900, 170),
    L("national cohort data", 220, 176, 780, 246),
    L("Methods and first results of the study team", 100, 262, 800, 297),
  ];
  const b = groupBlocks(lines);
  assert.deepEqual(b.map((x) => x.lines), [[0, 1], [2]]);
});

test("two columns side by side stay two blocks", () => {
  const lines = [
    L("Left column text that wraps", 100, 100, 600, 140), L("Right column text that wraps", 800, 100, 1300, 140),
    L("onto a second line here", 100, 146, 520, 186), L("onto its own second line", 800, 146, 1250, 186),
  ];
  const b = groupBlocks(lines);
  assert.deepEqual(b.map((x) => x.lines), [[0, 2], [1, 3]]);
});

test("fragments of one line (wide word gaps) are joined before grouping", () => {
  const lines = [L("Results of the", 100, 100, 400, 140), L("field study", 410, 102, 640, 142)];
  const b = groupBlocks(lines);
  assert.equal(b.length, 1);
  assert.equal(b[0].text, "Results of the field study");
});

test("a line ending in a hyphen joins the next without a space", () => {
  const b = groupBlocks([L("The pathology report de-", 100, 100, 700, 140), L("scribes the margins.", 100, 146, 520, 186)]);
  assert.equal(b[0].text, "The pathology report de-scribes the margins.");
});

test("what the recognizer did not read at a box's ends (a drawn bullet, an icon) stays out of the block's region", () => {
  const withSpan = (l, span) => Object.assign(l, { span });
  const b = groupBlocks([
    withSpan(L("Samples were collected from 42 sites", 100, 250, 1100, 290), [0.04, 1]),     // 40 px unread: trimmed
    withSpan(L("Mean processing time fell by 18%", 100, 400, 1100, 440), [0.01, 0.99]),     // 10 px: kept
    withSpan(L("Two reviewers checked every report", 100, 550, 1100, 590), [0, 0.9]),       // 100 px at the end
  ]);
  assert.deepEqual(b.map((x) => [x.rect[0], x.rect[2]]), [[140, 1100], [100, 1100], [100, 1000]]);
  assert.deepEqual(b[0].box, [100, 250, 1100, 290]);  // the image box stays the line's box
});

test("isVietnamese: Vietnamese letters, or unaccented Vietnamese words as the English model reads them", () => {
  assert.equal(isVietnamese("Kết quả nghiên cứu của nhóm"), true);
  assert.equal(isVietnamese("Ket qua nghien cuu cua nhom benh nhan"), true);
  assert.equal(isVietnamese("Phuong phap dieu tri va theo doi"), true);
  assert.equal(isVietnamese("Results of the field study"), false);
  assert.equal(isVietnamese("The patient was seen in the clinic to do a test"), false);
  assert.equal(isVietnamese("Ki-67 index"), false);
});

test("letter-less and Vietnamese blocks are kept; the others are sent with their neighbours as context", () => {
  const lines = [
    L("Survival by grade", 100, 100, 600, 150),
    L("Kết quả nghiên cứu", 100, 250, 600, 290),
    L("0.87 (95%)", 100, 400, 300, 440),
    L("Grade 3 tumours recur early", 100, 550, 800, 590),
  ];
  const b = groupBlocks(lines);
  assert.deepEqual(b.map((x) => x.keep), [null, "vi", "symbols", null]);
  const s = blockSegments(b);
  assert.deepEqual(s.segments, [
    { id: 0, tagged: "Survival by grade", essential: [], prev: "", nxt: "Grade 3 tumours recur early", where: "Ảnh, dòng 1" },
    { id: 3, tagged: "Grade 3 tumours recur early", essential: [], prev: "Survival by grade", nxt: "", where: "Ảnh, dòng 4" },
  ]);
  assert.equal(s.fullText, "Survival by grade\nGrade 3 tumours recur early");
});

test("photoVerdict: no text, already Vietnamese (most of the letters), or something to translate", () => {
  assert.equal(photoVerdict([]), "empty");
  assert.equal(photoVerdict(groupBlocks([L("12 / 40", 10, 10, 200, 50)])), "empty");
  assert.equal(photoVerdict(groupBlocks([L("Kết quả nghiên cứu của nhóm", 10, 10, 600, 50),
    L("Results", 10, 200, 200, 240)])), "vi");
  assert.equal(photoVerdict(groupBlocks([L("Kết quả", 10, 10, 200, 50),
    L("Results of the field study in many sites", 10, 200, 900, 240)])), "translate");
});
