// Block building of the PDF path (web/pdf/layout.js) on synthetic text items: lines, reading order (columns, bands,
// tables), paragraphs, kinds, running headers / footers / page numbers, References, continuation across columns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFragments, layoutDocument, segmentsOf, splitTranslation, runsOfTagged, splitRuns } from "../layout.js";
import { item, para, centered, page, LOREM, LOREM2, BOLD } from "./fixtures.mjs";

const texts = (blocks) => blocks.map((b) => b.text);
const live = (lay) => lay.blocks.filter((b) => !b.skip);

test("items on one baseline join into one fragment, with a space only where there is a gap", () => {
  const f = buildFragments([item("Hello", 50, 100), item("world", 80, 100), item("tum", 110, 100),
    item("our", 125, 100)]);
  assert.deepEqual(f.map((x) => x.text), ["Hello world tumour"]);
  assert.equal(f[0].x0, 50);
  assert.equal(f[0].base, 100);
});

test("a wide gap splits a row into fragments; a raised citation mark stays with its line", () => {
  const f = buildFragments([item("Left column text", 50, 100), item("Right column", 310, 100),
    item("cells", 50, 130), item("12", 75, 127, 6)]);
  assert.deepEqual(f.map((x) => x.text), ["Left column text", "Right column", "cells12"]);
});

test("two columns are read column by column, after the full-width title, even with aligned baselines", () => {
  const items = [centered("Spindle cell lesions of soft tissue", 50, 545, 70, 16),
    centered("Synthetic Author and Another Author", 50, 545, 92, 10)];
  let left = para(LOREM, 50, 285, 130);
  items.push(...left.items);
  left = para(LOREM2, 50, 285, left.base, { indent: 15 });
  items.push(...left.items);
  items.push(item("Methods", 310, 130, 10, { style: BOLD }));
  const right = para(LOREM2 + " " + LOREM, 310, 545, 142);
  items.push(...right.items);
  const lay = layoutDocument([page(0, items)]);
  const b = live(lay);
  assert.deepEqual(b.map((x) => x.kind), ["heading", "para", "para", "para", "heading", "para"]);
  assert.equal(b[0].text, "Spindle cell lesions of soft tissue");
  assert.equal(b[0].align, "center");
  assert.equal(b[2].text, LOREM);
  assert.equal(b[3].text, LOREM2);
  assert.equal(b[4].text, "Methods");
  assert.equal(b[5].text, LOREM2 + " " + LOREM);
  assert.ok(b[2].box.x1 <= 285 && b[5].box.x0 >= 310);
});

test("paragraphs split at a paragraph gap and after a short line that ends a sentence", () => {
  const p1 = para(LOREM, 50, 545, 100);
  const p2 = para(LOREM2, 50, 545, p1.base + 8);  // 8 pt paragraph spacing
  const lay = layoutDocument([page(0, [...p1.items, ...p2.items])]);
  assert.deepEqual(texts(live(lay)), [LOREM, LOREM2]);
  const ragged = para(LOREM, 50, 545, 100, { ragged: true });
  const lay2 = layoutDocument([page(0, ragged.items)]);
  assert.deepEqual(texts(live(lay2)), [LOREM]);
});

test("a line-end hyphen joins the word; a list marker, a caption and a heading start new blocks", () => {
  const items = [item("The tumour shows a striking transla-", 50, 100, 10, { x1: 300 }),
    item("tion of the cells into fascicles.", 50, 112),
    item("Figure 1. Spindle cells in long fascicles.", 50, 124),
    item("• First finding of the series", 50, 136), item("continues on a second line", 60, 148),
    item("• Second finding", 50, 160), item("1. Numbered step", 50, 172), item("2. Next step", 50, 184),
    item("Discussion", 50, 204, 14)];
  const b = live(layoutDocument([page(0, items)]));
  assert.deepEqual(texts(b), ["The tumour shows a striking translation of the cells into fascicles.",
    "Figure 1. Spindle cells in long fascicles.", "• First finding of the series continues on a second line",
    "• Second finding", "1. Numbered step", "2. Next step", "Discussion"]);
  assert.deepEqual(b.map((x) => x.kind), ["para", "caption", "list", "list", "list", "list", "heading"]);
});

test("a grid of short cells is a table read row by row; body columns are not a table", () => {
  const rows = [["Marker", "Positive cases", "Negative cases"], ["CD34", "12", "3"], ["S100 protein", "4", "11"]];
  const items = [];
  rows.forEach((r, i) => r.forEach((c, j) => items.push(item(c, 50 + j * 150, 400 + i * 16))));
  const lay = layoutDocument([page(0, items)]);
  const cells = lay.blocks.filter((x) => x.kind === "cell");
  assert.equal(cells.length, 9);
  assert.deepEqual(cells.map((c) => [c.table.row, c.table.col]),
    [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]);
  assert.deepEqual(cells.map((c) => c.skip), ["", "", "", "", "no_text", "no_text", "", "no_text", "no_text"]);
  assert.equal(lay.tables.length, 1);
  assert.deepEqual([lay.tables[0].rows, lay.tables[0].cols], [3, 3]);
  // two justified columns of body text with aligned baselines: paragraphs, no table
  const l = para(LOREM + " " + LOREM2, 50, 285, 100);
  const r = para(LOREM2 + " " + LOREM, 310, 545, 100);
  const lay2 = layoutDocument([page(0, [...l.items, ...r.items])]);
  assert.equal(lay2.tables.length, 0);
  assert.deepEqual(texts(live(lay2)), [LOREM + " " + LOREM2, LOREM2 + " " + LOREM]);
});

test("running headers and page numbers are kept out of the translation", () => {
  const pages = [0, 1, 2].map((k) => page(k, [item("Journal of Synthetic Pathology 2026; 12: " + (100 + k), 50, 30, 8),
    ...para(LOREM, 50, 545, 100).items, item(String(k + 1), 290, 815, 9)]));
  const lay = layoutDocument(pages);
  const skips = lay.blocks.map((b) => [b.page, b.skip]);
  assert.deepEqual(skips, [[0, "header_footer"], [0, ""], [0, "page_number"], [1, "header_footer"], [1, ""],
    [1, "page_number"], [2, "header_footer"], [2, ""], [2, "page_number"]]);
  // one page: no running header to see, the page number still stays out
  const one = layoutDocument([page(0, [item("Journal of Synthetic Pathology 2026", 50, 30, 8),
    ...para(LOREM, 50, 545, 100).items, item("Page 7", 280, 815, 9)])]);
  assert.deepEqual(one.blocks.map((b) => b.skip), ["", "", "page_number"]);
});

test("the References section stays untranslated until the next heading of its level", () => {
  const items = [item("Results", 50, 80, 12, { style: BOLD })];
  let p = para(LOREM, 50, 545, 100);
  items.push(...p.items, item("References", 50, p.base + 14, 12, { style: BOLD }));
  let base = p.base + 34;
  for (const r of ["1. Synthetic A, Author B. A study of spindle cells. J Synth Path. 2020;1:1-9.",
    "2. Synthetic C. Another study of fascicles. J Synth Path. 2021;2:10-19."]) {
    items.push(item(r, 50, base));
    base += 14;
  }
  items.push(item("Figure legends", 50, base + 10, 12, { style: BOLD }));
  p = para(LOREM2, 50, 545, base + 30);
  items.push(...p.items);
  const lay = layoutDocument([page(0, items)]);
  assert.deepEqual(lay.blocks.map((b) => b.skip), ["", "", "references", "references", "references", "", ""]);
  assert.deepEqual(texts(live(lay)), ["Results", LOREM, "Figure legends", LOREM2]);
});

test("a back-matter title closes the References whatever its size or weight, also on the next page", () => {
  // page 1 ends with the References (a bold 12 pt heading), page 2 opens with a plain body-size "Appendix A"
  const refs = ["1. Synthetic A, Author B. A study of spindle cells. J Synth Path. 2020;1:1-9.",
    "2. Synthetic C. Another study of fascicles. J Synth Path. 2021;2:10-19."];
  const one = [...para(LOREM, 50, 545, 100).items, item("References", 50, 160, 12, { style: BOLD })];
  refs.forEach((r, k) => one.push(item(r, 50, 180 + 14 * k)));
  const two = [item("Appendix A", 50, 80), ...para(LOREM2, 50, 545, 100).items,
    item("Funding. J Synth Path. 2020;1:1-9.", 50, 160), item("Acknowledgements", 50, 190),
    item("The synthetic fund paid for the stains.", 50, 210)];
  const lay = layoutDocument([page(0, one), page(1, two)]);
  const by = new Map(lay.blocks.map((b) => [b.text, b.skip]));
  for (const t of ["References", ...refs]) assert.equal(by.get(t), "references", t);
  for (const t of ["Appendix A", LOREM2, "Funding. J Synth Path. 2020;1:1-9.", "Acknowledgements",
    "The synthetic fund paid for the stains."]) assert.equal(by.get(t), "", t);
  // a plain line after the References that is no back-matter title stays inside
  const lay2 = layoutDocument([page(0, [item("References", 50, 100), item("Synthetic D. A third study. 2019.", 50, 120),
    item("Staining protocol for the lab", 50, 140)])]);
  assert.ok(lay2.blocks.every((b) => b.skip === "references"), lay2.blocks.map((b) => b.skip).join());
});

test("numbers-only and non-Latin blocks are skipped like the DOCX path does", () => {
  const lay = layoutDocument([page(0, [item("12.5 34.7", 50, 100), item("病理学的研究", 50, 140),
    item("Tumour cells.", 50, 180)])]);
  assert.deepEqual(lay.blocks.map((b) => b.skip), ["no_text", "non_latin", ""]);
});

test("a sentence cut by the column break is one segment over two blocks", () => {
  const l = para(LOREM + " In the second series the cells were", 50, 285, 100, { full: true });
  const r = para("stained with eosin and reviewed. " + LOREM2, 310, 545, 100);
  const lay = layoutDocument([page(0, [...l.items, ...r.items])]);
  const segs = segmentsOf(lay);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].blocks.length, 2);
  assert.equal(segs[0].text, LOREM + " In the second series the cells were stained with eosin and reviewed. " + LOREM2);
  assert.equal(segs[0].where, "Trang 1");
  const second = lay.blocks.find((b) => b.id === segs[0].blocks[1]);
  assert.equal(second.cont, segs[0].blocks[0]);
});

test("a centred two-line title is one block; a small block at the page foot is a footnote", () => {
  const items = [centered("Deep learning methods in", 50, 545, 80, 18), centered("digital pathology", 50, 545, 102, 18),
    ...para(LOREM, 50, 545, 140).items, item("1 Corresponding author: synthetic address, Example City.", 50, 805, 7)];
  const b = live(layoutDocument([page(0, items)]));
  assert.deepEqual(b.map((x) => [x.kind, x.text]), [["heading", "Deep learning methods in digital pathology"],
    ["para", LOREM], ["footnote", "1 Corresponding author: synthetic address, Example City."]]);
  assert.equal(b[0].level, 1);
});

test("segments carry the page as their place and the neighbours' text", () => {
  const pages = [page(0, para(LOREM, 50, 545, 100).items), page(1, para(LOREM2, 50, 545, 100).items)];
  const segs = segmentsOf(layoutDocument(pages));
  assert.deepEqual(segs.map((s) => [s.id, s.where, s.text]), [[0, "Trang 1", LOREM], [1, "Trang 2", LOREM2]]);
});

test("a translation over several blocks is split at spaces in proportion to the English", () => {
  assert.deepEqual(splitTranslation("Một hai ba bốn năm sáu", [10, 10]), ["Một hai ba", "bốn năm sáu"]);
  assert.deepEqual(splitTranslation("Một", [5, 5]), ["Một", ""]);
  assert.deepEqual(splitTranslation("A b c d", [1]), ["A b c d"]);
});

test("a centred line and a short heading under it are not two columns", () => {
  const items = [centered("Synthetic Author and Another Author", 50, 545, 100), item("Abstract", 50, 130, 11, { style: BOLD }),
    ...para(LOREM, 50, 545, 145).items];
  const b = live(layoutDocument([page(0, items)]));
  assert.deepEqual(texts(b), ["Synthetic Author and Another Author", "Abstract", LOREM]);
});

test("the last line of a paragraph right above a table stays in the paragraph", () => {
  const items = [item("All specimens were fixed in buffered formalin and", 310, 100, 10, { x1: 545 }),
    item("four microns.", 310, 112)];
  [["Marker", "Positive", "Negative"], ["CD34", "12", "3"], ["S100 protein", "4", "11"]].forEach((r, i) =>
    r.forEach((c, j) => items.push(item(c, 314 + j * 80, 138 + i * 17, 9))));
  const lay = layoutDocument([page(0, items)]);
  assert.equal(lay.blocks[0].text, "All specimens were fixed in buffered formalin and four microns.");
  assert.equal(lay.blocks.filter((b) => b.kind === "cell").length, 9);
  assert.equal(lay.tables.length, 1);
});

test("a ragged column that stops mid-sentence continues in the next column", () => {
  const l = [item("Spindle cell tumours of soft tissue form a broad", 50, 100, 10, { x1: 285 }),
    item("group of lesions. In the second series the cells", 50, 112, 10, { x1: 283 }), item("were then", 50, 124, 10, { x1: 180 })];
  const r = para("stained with eosin and reviewed. " + LOREM2, 310, 545, 100, { ragged: true });
  const segs = segmentsOf(layoutDocument([page(0, [...l, ...r.items])]));
  assert.equal(segs.length, 1);
});

test("a fragment made only of raised small items (far from its row's text) keeps a real size and box", () => {
  const f = buildFragments([item("Body text of the row", 50, 100), item("a", 400, 97, 6)]);
  assert.equal(f.length, 2);
  for (const x of f) assert.ok(Number.isFinite(x.size) && Number.isFinite(x.top) && Number.isFinite(x.base), JSON.stringify(x));
  assert.equal(f[1].size, 6);
});

const REG = { bold: false, italic: false, serif: true, color: [0, 0, 0], invisible: false };
const ITAL = { bold: false, italic: true, serif: true, color: [0, 0, 0], invisible: false };
const SBOLD = { bold: true, italic: false, serif: true, color: [0, 0, 0], invisible: false };

test("bold and italic spans inside a block travel to the translation as inline tags", () => {
  // a CV row: a bold label and a regular value on one line; a paragraph with an italic book title across a line end
  const items = [item("Name:", 50, 100, 10, { style: SBOLD }), item("Synthetic Person, MD", 80, 100, 10, { style: REG }),
    item("Example and Writer's", 50, 130, 10, { style: REG }), item("Synthetic Basis of", 155, 130, 10, { style: ITAL, x1: 290 }),
    item("Lesions", 50, 142, 10, { style: ITAL }), item("is a well known example of this kind.", 90, 142, 10, { style: REG })];
  const lay = layoutDocument([page(0, items)]);
  const segs = segmentsOf(lay);
  assert.equal(segs[0].text, "Name: Synthetic Person, MD");
  assert.equal(segs[0].tagged, "<g1>Name:</g1> Synthetic Person, MD");
  assert.deepEqual(segs[0].spans, { 1: { bold: true, italic: false } });
  const b = lay.blocks[0];
  assert.deepEqual(b.runs.map((r) => [r.text, !!(r.style && r.style.bold)]), [["Name: ", true], ["Synthetic Person, MD", false]]);
  // the italic title runs over the line end into one span
  assert.equal(segs[1].tagged, "Example and Writer's <g1>Synthetic Basis of Lesions</g1> is a well known example of this kind.");
  assert.deepEqual(segs[1].spans, { 1: { bold: false, italic: true } });
});

test("runs follow the line joins: a space between lines, a line-end hyphen dropped", () => {
  const items = [item("The tumour shows a striking transla-", 50, 100, 10, { x1: 300, style: REG }),
    item("tion", 50, 112, 10, { style: ITAL }), item("of the cells into fascicles.", 75, 112, 10, { style: REG })];
  const lay = layoutDocument([page(0, items)]);
  const b = lay.blocks[0];
  assert.equal(b.text, "The tumour shows a striking translation of the cells into fascicles.");
  assert.equal(b.runs.map((r) => r.text).join(""), b.text);
  assert.equal(segmentsOf(lay)[0].tagged, "The tumour shows a striking transla<g1>tion</g1> of the cells into fascicles.");
});

test("a translation with tags comes back as styled runs, split over the blocks of its segment", () => {
  const runs = runsOfTagged("<g1>Họ tên:</g1>  Người   Tổng hợp, <g2>Bệnh học</g2>", { 1: { bold: true, italic: false },
    2: { bold: false, italic: true } }, REG);
  assert.deepEqual(runs.map((r) => [r.text, r.style.bold, r.style.italic]),
    [["Họ tên:", true, false], [" Người Tổng hợp, ", false, false], ["Bệnh học", false, true]]);
  // no tags (the core gave plain text back): the dominant style throughout; unknown tags are dropped
  assert.deepEqual(runsOfTagged("Một <g7>hai</g7> ba", {}, SBOLD).map((r) => [r.text, r.style.bold]), [["Một hai ba", true]]);
  const parts = splitRuns(runs, [10, 10]);
  assert.deepEqual(parts.map((p) => p.map((r) => r.text).join("")), splitTranslation("Họ tên: Người Tổng hợp, Bệnh học", [10, 10]));
  assert.ok(parts[1].some((r) => r.style.italic));
});

test("a justified paragraph with a first-line indent is left aligned, not right aligned", () => {
  const p = para(LOREM + " " + LOREM2, 50, 545, 100, { indent: 12, full: true });
  const b = live(layoutDocument([page(0, p.items)]));
  assert.equal(b.length, 1);
  assert.equal(b[0].align, "left");
  // a one-line title set against the right edge of the text is right aligned; a short line on the left is not
  const t = layoutDocument([page(0, [item("Preface", 475, 60, 20), ...para(LOREM, 50, 545, 100).items, item("Short line.", 50, 160)])]);
  assert.deepEqual(t.blocks.map((x) => x.align), ["right", "left", "left"]);
  // really right-aligned lines still are
  const r = [item("Synthetic Street 12", 400, 100), item("Example City", 435, 112), item("Country", 460, 124)]
    .map((x) => ({ ...x, x1: 495 }));
  assert.equal(layoutDocument([page(0, r)]).blocks[0].align, "right");
});

test("a line that starts with 'Figure n' in the middle of a sentence is not a caption", () => {
  const items = [item("• Lobules: the lobules are the smallest units of the gland with thin septa (see", 50, 100, 10, { x1: 545 }),
    item("Figure 4.1); in fibrosis it is hard to see the outline of each small", 60, 112, 10, { x1: 545 }),
    item("lobule.", 60, 124),
    item("Figure 2. Spindle cells in long fascicles.", 50, 150)];
  const b = live(layoutDocument([page(0, items)]));
  assert.deepEqual(b.map((x) => x.kind), ["list", "caption"]);
});

test("a number set off by a tab stays with its item, and the item's next lines join it even when they start upper case", () => {
  const items = [item("1.", 50, 100), item("Example AB, Writer CD, Author EF: A Synthetic Study of Spindle Cell Lesions in", 84, 100, 10, { x1: 545 }),
    item("Soft Tissue and Bone With Long Follow Up in Two Synthetic Centres. Synth J", 50, 112, 10, { x1: 545 }),
    item("Pathol. 12(3): 101-109, 2020.", 50, 124),
    // ragged right: the line ends short of the edge because "Consecutive" did not fit after it
    item("2.", 50, 140), item("Writer CD, Example AB: Grading of Synthetic Tumours of the Lung in a Series of Fifty", 84, 140),
    item("Consecutive Cases. Synth Pathol Rep. 2021.", 50, 152)];
  const b = live(layoutDocument([page(0, items)]));
  assert.deepEqual(texts(b), ["1. Example AB, Writer CD, Author EF: A Synthetic Study of Spindle Cell Lesions in Soft Tissue and "
    + "Bone With Long Follow Up in Two Synthetic Centres. Synth J Pathol. 12(3): 101-109, 2020.",
  "2. Writer CD, Example AB: Grading of Synthetic Tumours of the Lung in a Series of Fifty Consecutive Cases. "
    + "Synth Pathol Rep. 2021."]);
  assert.deepEqual(b.map((x) => x.kind), ["list", "list"]);
});

test("the wrapped last line of a table's last row stays in its cell", () => {
  const items = [item("01/2019-02/2021", 50, 100), item("Senior Lecturer, Synthetic Department of Histology, Example College of", 200, 100),
    item("North Town", 200, 112),
    item("03/2021-Present", 50, 130), item("Associate Lecturer, Synthetic Department of Histology, Example College of", 200, 130),
    item("South Town", 200, 142)];
  const lay = layoutDocument([page(0, items)]);
  const cells = lay.blocks.filter((x) => x.kind === "cell");
  assert.deepEqual(cells.map((c) => c.text), ["01/2019-02/2021", "Senior Lecturer, Synthetic Department of Histology, "
    + "Example College of North Town", "03/2021-Present", "Associate Lecturer, Synthetic Department of Histology, Example College of South Town"]);
  assert.equal(lay.blocks.length, 4);
});
